import {
  TmdbApiError,
  TmdbClient,
  selectExactTitleYearCandidates,
} from '@media-tracker/connector-tmdb'
import type { SyncJob } from '@media-tracker/contracts'
import type { TmdbMovieProfileProjection } from '@media-tracker/db'
import { ulid } from 'ulid'

import { createCatalogJobsRepository, createMoviesRepository } from './env'
import type { Bindings } from './env'

const batchSize = 10
const matcherVersion = 'tmdb-conservative@1'

function daysAfter(at: string, days: number) {
  return new Date(Date.parse(at) + days * 86_400_000).toISOString()
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
  const jobs = createCatalogJobsRepository(env.DB)
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
  const at = new Date().toISOString()
  const jobs = createCatalogJobsRepository(env.DB)
  const current = await jobs.find(job.catalogJobId)
  if (current === null || current.state === 'succeeded' || current.state === 'failed') return
  if ((current.cursor ?? '') !== (job.catalogCursor ?? '')) return
  if (env.TMDB_API_READ_TOKEN === undefined) {
    await jobs.fail(job.catalogJobId, 'not_configured', at)
    return
  }
  const reserved = await jobs.reserve(
    job.catalogJobId,
    current.cursor,
    at,
    new Date(Date.parse(at) + 5 * 60_000).toISOString(),
  )
  if (!reserved) return
  const movies = createMoviesRepository(env.DB)
  try {
    const candidates = await movies.listTmdbEnrichmentCandidates({
      ...(current.cursor === null ? {} : { afterMediaItemId: current.cursor }),
      retryBefore: daysAfter(at, -90),
      at,
      limit: batchSize,
    })
    const configurationNeeded =
      current.cursor === null && (await movies.needsTmdbConfigurationRefresh(at))
    if (candidates.length === 0) {
      if (configurationNeeded) {
        const client = new TmdbClient(env.TMDB_API_READ_TOKEN)
        const configuration = await client.configuration()
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
      await jobs.complete(job.catalogJobId, at)
      return
    }
    const client = new TmdbClient(env.TMDB_API_READ_TOKEN)
    const configuration = configurationNeeded ? await client.configuration() : null
    const results: TmdbMovieProfileProjection[] = []
    let requestCount = configuration === null ? 0 : 1
    for (const candidate of candidates) {
      let movieId: number | null = null
      let method: TmdbMovieProfileProjection['matchMethod'] = null
      let candidateCount = 0
      if (candidate.exactTmdbMovieId !== null) {
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
        }
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
      const detail = await client.movieDetails(movieId)
      requestCount += 1
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
    await jobs.advance(job.catalogJobId, {
      cursor: candidates.at(-1)!.mediaItemId,
      requested: candidates.length,
      returned: results.filter((value) => value.matchStatus === 'matched').length,
      omitted: results.filter((value) => value.matchStatus !== 'matched').length,
      quotaUnits: requestCount,
      at,
    })
    await env.SYNC_QUEUE.send(jobMessage(job.catalogJobId, candidates.at(-1)!.mediaItemId))
  } catch (error) {
    if (error instanceof TmdbApiError && error.retryable) await jobs.release(job.catalogJobId, at)
    else
      await jobs.fail(
        job.catalogJobId,
        error instanceof TmdbApiError
          ? `http_${error.status}`
          : error instanceof Error
            ? error.name
            : 'unknown',
        at,
      )
    throw error
  }
}
