import { ZodError } from 'zod'
import { CatalogRetryError } from './catalog-retry'
import {
  TmdbApiError,
  TmdbClient,
  movieHasExactTitle,
  movieHasReleaseYear,
  normalizeTmdbTitle,
  selectDominantVoteCandidate,
  selectExactTitleYearCandidates,
} from '@media-tracker/connector-tmdb'
import type { SyncJob } from '@media-tracker/contracts'
import type { TmdbMovieProfileProjection } from '@media-tracker/db'
import { ulid } from 'ulid'

import { createCatalogJobsRepository, createMoviesRepository } from './env'
import type { Bindings } from './env'
import { boundedTmdbEnvironment, tmdbGrantAllowed, tmdbGrantAttempts } from './tmdb-grant'

const batchSize = 10
const matcherVersion = 'tmdb-evidence@2'

function daysAfter(at: string, days: number) {
  return new Date(Date.parse(at) + days * 86_400_000).toISOString()
}

function safeRuntimeDiagnostic(error: unknown, secret: string) {
  if (!(error instanceof Error)) return 'Unknown failure'
  const message =
    secret.length === 0 ? error.message : error.message.replaceAll(secret, '[redacted]')
  return message.replace(/https?:\/\/[^\s"']+/giu, '[url]').slice(0, 240)
}

function jobMessage(jobId: string, cursor = ''): SyncJob {
  return {
    idempotencyKey: `catalog:tmdb:${jobId}`,
    source: 'tmdb',
    operation: 'refresh_tmdb_catalog',
    catalogJobId: jobId,
    catalogCursor: cursor,
  }
}

export async function startTmdbCatalogRefresh(env: Bindings, at = new Date().toISOString()) {
  if (env.TMDB_API_READ_TOKEN === undefined)
    throw new Error('TMDB_API_READ_TOKEN is not configured')
  const jobs = createCatalogJobsRepository(env.DB, env.DATABASE_USAGE_OBSERVER)
  const active = await jobs.findActive('tmdb')
  if (active !== null) {
    await env.SYNC_QUEUE.send(jobMessage(active.id, active.cursor ?? ''))
    return active
  }
  const job = await jobs.create(ulid(), 'tmdb', at)
  await env.SYNC_QUEUE.send(jobMessage(job.id))
  return job
}

export async function processTmdbCatalogRefresh(env: Bindings, job: SyncJob): Promise<void> {
  if (job.operation !== 'refresh_tmdb_catalog' || job.catalogJobId === undefined) return
  const hosted = env.AUTH_MODE === 'access'
  if (hosted && !tmdbGrantAllowed(env, job.catalogJobId)) return
  const bounded = hosted ? boundedTmdbEnvironment(env) : null
  if (bounded) env = bounded.env
  const at = new Date().toISOString()
  const jobs = createCatalogJobsRepository(env.DB, env.DATABASE_USAGE_OBSERVER)
  const current = await jobs.find(job.catalogJobId)
  if (current === null || current.state === 'succeeded' || current.state === 'failed') return
  if (current.provider !== 'tmdb') return
  if ((current.cursor ?? '') !== (job.catalogCursor ?? '')) {
    // A previous delivery may have committed its cursor before Queue send failed.
    if (current.state === 'pending' || current.state === 'running')
      await env.SYNC_QUEUE.send(jobMessage(current.id, current.cursor ?? ''))
    return
  }
  const reserved = await jobs.reserve(
    job.catalogJobId,
    current.cursor,
    at,
    new Date(Date.parse(at) + 5 * 60_000).toISOString(),
    hosted ? tmdbGrantAttempts : undefined,
  )
  if (reserved === null) throw new CatalogRetryError(300)
  if (env.TMDB_API_READ_TOKEN === undefined) {
    await jobs.fail(job.catalogJobId, reserved, 'not_configured', at)
    return
  }
  const lease = { jobId: job.catalogJobId, token: reserved, kind: 'catalog' as const }
  let advanced = false
  const movies = createMoviesRepository(env.DB, env.DATABASE_USAGE_OBSERVER, lease)
  let stage = 'candidate_query'
  try {
    const candidates = await movies.listTmdbEnrichmentCandidates({
      ...(current.cursor === null ? {} : { afterMediaItemId: current.cursor }),
      retryBefore: daysAfter(at, -90),
      matcherVersion,
      at,
      limit: batchSize,
    })
    bounded?.budget.page(candidates.length)
    stage = 'configuration_state'
    const configurationNeeded =
      current.cursor === null && (await movies.needsTmdbConfigurationRefresh(at))
    if (candidates.length === 0) {
      if (configurationNeeded) {
        stage = 'provider_request'
        const client = new TmdbClient(env.TMDB_API_READ_TOKEN, bounded?.budget.fetch)
        const configuration = await client.configuration()
        stage = 'persistence'
        await movies.applyTmdbCatalogBatch({
          at,
          configuration: {
            secureBaseUrl: configuration.data.images.secure_base_url,
            posterBaseUrl: `${configuration.data.images.secure_base_url}w500`,
            backdropBaseUrl: `${configuration.data.images.secure_base_url}w1280`,
            posterSizes: configuration.data.images.poster_sizes,
            backdropSizes: configuration.data.images.backdrop_sizes,
            fetchedAt: at,
            expiresAt: daysAfter(at, 30),
            etag: configuration.etag,
          },
          movies: [],
        })
      }
      stage = 'completion'
      await movies.reconcileTmdbIdentityCollisions(at)
      stage = 'projection_rebuild'
      await movies.rebuild(at)
      await jobs.complete(job.catalogJobId, reserved, at)
      return
    }
    stage = 'provider_request'
    const client = new TmdbClient(env.TMDB_API_READ_TOKEN, bounded?.budget.fetch)
    const configuration = configurationNeeded ? await client.configuration() : null
    const results: TmdbMovieProfileProjection[] = []
    let requestCount = configuration === null ? 0 : 1
    for (const candidate of candidates) {
      bounded?.budget.check()
      let movieId: number | null = null
      let tvId: number | null = candidate.matchedTmdbTvId
      let method: TmdbMovieProfileProjection['matchMethod'] = null
      let candidateCount = 0
      let selectedDetail: Awaited<ReturnType<TmdbClient['movieDetails']>> | null = null
      if (tvId !== null) {
        method = 'exact_tv_title_year'
        candidateCount = 1
      } else if (candidate.exactTmdbMovieId !== null) {
        movieId = candidate.exactTmdbMovieId
        method = 'exact_tmdb_id'
        candidateCount = 1
      } else if (candidate.exactImdbId !== null) {
        const found = await client.findMovieByImdb(candidate.exactImdbId)
        requestCount += 1
        candidateCount = found.length
        if (found.length === 1) {
          movieId = found[0]!.id
          method = 'exact_imdb_id'
        }
      } else if (candidate.releaseYear !== null) {
        const found = await client.searchMovie(candidate.importedTitle, candidate.releaseYear)
        requestCount += 1
        const exact = selectExactTitleYearCandidates(
          found,
          candidate.importedTitle,
          candidate.releaseYear,
        )
        candidateCount = exact.length
        if (exact.length === 1) {
          movieId = exact[0]!.id
          method = 'exact_title_year'
        } else if (exact.length > 1) {
          const dominant = selectDominantVoteCandidate(exact)
          if (dominant !== null) {
            movieId = dominant.id
            method = 'dominant_title_year_votes'
          }
        }
        if (exact.length === 0) {
          const withoutYear = await client.searchMovieWithoutYear(candidate.importedTitle)
          requestCount += 1
          const normalized = normalizeTmdbTitle(candidate.importedTitle)
          const exactTitles = withoutYear.filter((result) =>
            [result.title, result.original_title].some(
              (title) => normalizeTmdbTitle(title) === normalized,
            ),
          )
          // Search ranking is used only to bound requests. An accepted result
          // must independently verify an exact title (including alternatives)
          // and an actual country release in the source year.
          const candidatesToVerify = [
            ...exactTitles,
            ...withoutYear.slice(0, 5).filter((result) => !exactTitles.includes(result)),
          ].slice(0, 10)
          const verified: Array<{
            result: (typeof withoutYear)[number]
            detail: Awaited<ReturnType<TmdbClient['movieDetails']>>
          }> = []
          for (const result of candidatesToVerify) {
            const detail = await client.movieDetails(result.id)
            requestCount += 1
            if (
              movieHasExactTitle(detail.data, candidate.importedTitle) &&
              movieHasReleaseYear(detail.data, candidate.releaseYear)
            )
              verified.push({ result, detail })
          }
          candidateCount = verified.length
          const winner =
            verified.length === 1
              ? verified[0]
              : verified.find(
                  (item) =>
                    item.result === selectDominantVoteCandidate(verified.map((v) => v.result)),
                )
          if (winner !== undefined) {
            movieId = winner.result.id
            selectedDetail = winner.detail
            method = verified.length === 1 ? 'verified_release_year' : 'dominant_title_year_votes'
          }
        }
      }
      if (
        movieId === null &&
        tvId === null &&
        candidateCount === 0 &&
        candidate.releaseYear !== null
      ) {
        const tvResults = await client.searchTv(candidate.importedTitle, candidate.releaseYear)
        requestCount += 1
        const normalized = normalizeTmdbTitle(candidate.importedTitle)
        const exactTv = tvResults.filter(
          (item) =>
            item.first_air_date?.slice(0, 4) === candidate.releaseYear &&
            [item.name, item.original_name].some(
              (title) => normalizeTmdbTitle(title) === normalized,
            ),
        )
        candidateCount = exactTv.length
        const selected = exactTv.length === 1 ? exactTv[0] : selectDominantVoteCandidate(exactTv)
        if (selected !== null && selected !== undefined) {
          tvId = selected.id
          method = exactTv.length === 1 ? 'exact_tv_title_year' : 'dominant_title_year_votes'
        }
      }
      if (tvId !== null) {
        const detail = await client.tvDetails(tvId)
        requestCount += 1
        const data = detail.data
        results.push({
          mediaItemId: candidate.mediaItemId,
          tmdbMovieId: null,
          tmdbTvId: tvId,
          matchStatus: 'matched',
          matchMethod: method,
          candidateCount,
          matcherVersion,
          attemptedAt: at,
          safeErrorCode: null,
          profile: null,
          tvProfile: {
            currentTitle: data.name,
            originalTitle: data.original_name,
            originalLanguage: data.original_language,
            overview: data.overview,
            firstAirDate: data.first_air_date,
            posterPath: data.poster_path,
            backdropPath: data.backdrop_path,
            tagline: data.tagline,
            status: data.status,
            voteAverage: data.vote_average,
            voteCount: data.vote_count,
            creatorNames: data.created_by.map((creator) => creator.name),
            genres: data.genres.map((genre) => genre.name),
            cast: data.credits.cast.slice(0, 5).map((credit) => ({
              name: credit.name,
              character: credit.character,
            })),
            countries: data.production_countries.map((country) => country.name),
            fetchedAt: at,
            checkedAt: at,
            expiresAt: daysAfter(at, 30),
            etag: detail.etag,
          },
        })
        continue
      }
      if (movieId === null) {
        results.push({
          mediaItemId: candidate.mediaItemId,
          tmdbMovieId: null,
          matchStatus: candidateCount > 1 ? 'ambiguous' : 'unmatched',
          matchMethod: null,
          candidateCount,
          matcherVersion,
          attemptedAt: at,
          safeErrorCode: null,
          profile: null,
        })
        continue
      }
      const detail = selectedDetail ?? (await client.movieDetails(movieId))
      if (selectedDetail === null) requestCount += 1
      const data = detail.data
      results.push({
        mediaItemId: candidate.mediaItemId,
        tmdbMovieId: movieId,
        matchStatus: 'matched',
        matchMethod: method,
        candidateCount,
        matcherVersion,
        attemptedAt: at,
        safeErrorCode: null,
        profile: {
          currentTitle: data.title,
          originalTitle: data.original_title,
          originalLanguage: data.original_language,
          overview: data.overview,
          releaseDate: data.release_date,
          runtimeMinutes: data.runtime,
          posterPath: data.poster_path,
          backdropPath: data.backdrop_path,
          tagline: data.tagline,
          imdbId: data.imdb_id ?? data.external_ids.imdb_id,
          status: data.status,
          voteAverage: data.vote_average,
          voteCount: data.vote_count,
          fetchedAt: at,
          checkedAt: at,
          expiresAt: daysAfter(at, 30),
          etag: detail.etag,
          genres: data.genres,
          directors: data.credits.crew
            .filter((credit) => credit.job === 'Director')
            .map((credit) => ({
              creditId: credit.credit_id,
              personId: credit.id,
              name: credit.name,
            })),
          cast: data.credits.cast.map((credit) => ({
            creditId: credit.credit_id,
            personId: credit.id,
            name: credit.name,
            character: credit.character,
          })),
          countries: data.production_countries.map((country) => ({
            code: country.iso_3166_1,
            name: country.name,
          })),
          alternativeTitles: data.alternative_titles.titles.map((title) => ({
            countryCode: title.iso_3166_1,
            title: title.title,
          })),
        },
      })
    }
    stage = 'persistence'
    await movies.applyTmdbCatalogBatch({
      at,
      ...(configuration === null
        ? {}
        : {
            configuration: {
              secureBaseUrl: configuration.data.images.secure_base_url,
              posterBaseUrl: `${configuration.data.images.secure_base_url}w500`,
              backdropBaseUrl: `${configuration.data.images.secure_base_url}w1280`,
              posterSizes: configuration.data.images.poster_sizes,
              backdropSizes: configuration.data.images.backdrop_sizes,
              fetchedAt: at,
              expiresAt: daysAfter(at, 30),
              etag: configuration.etag,
            },
          }),
      movies: results,
    })
    stage = 'advance'
    advanced = await jobs.advance(job.catalogJobId, reserved, {
      cursor: candidates.at(-1)!.mediaItemId,
      requested: candidates.length,
      returned: results.filter((value) => value.matchStatus === 'matched').length,
      omitted: results.filter((value) => value.matchStatus !== 'matched').length,
      quotaUnits: requestCount,
      at,
    })
    if (!advanced) throw new CatalogRetryError(300)
    stage = 'enqueue'
    await env.SYNC_QUEUE.send(jobMessage(job.catalogJobId, candidates.at(-1)!.mediaItemId))
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'tmdb.catalog_stage_failed',
        stage,
        diagnostic: safeRuntimeDiagnostic(error, env.TMDB_API_READ_TOKEN),
      }),
    )
    if (error instanceof CatalogRetryError) throw error
    const terminal =
      (error instanceof TmdbApiError && !error.retryable) || error instanceof ZodError
    if (terminal && !advanced) {
      await jobs.fail(
        job.catalogJobId,
        reserved,
        error instanceof TmdbApiError ? `http_${error.status}` : 'invalid_provider_response',
        at,
      )
      throw error
    }
    if (!advanced) await jobs.release(job.catalogJobId, reserved, at)
    throw new CatalogRetryError(
      error instanceof TmdbApiError
        ? Math.min(43_200, Math.max(60, error.retryAfterSeconds ?? 60))
        : 60,
      { cause: error },
    )
  }
}
