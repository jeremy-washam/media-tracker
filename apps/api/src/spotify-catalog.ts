import { CatalogLeaseLostError } from '@media-tracker/db'
import { CatalogRetryError } from './catalog-retry'
import { SyncBudget, SyncDeferredError } from './sync-budget'
import { catalogRetryLimitReached, spotifyStaleBefore, retryAfterSeconds } from './catalog-policy'
import {
  SpotifyApiError,
  fetchSpotifyArtistResponse,
  parseSpotifyArtistResponse,
  fetchSpotifyEpisodeResponse,
  fetchSpotifyTrackResponse,
  parseSpotifyEpisodeResponse,
  parseSpotifyTrackResponse,
} from '@media-tracker/connector-spotify'
import type { SyncJob } from '@media-tracker/contracts'
import {
  rawObjectId,
  sourceRecordId,
  syncRunId,
  utcInstant,
  type RawObject,
  type SourceRecord,
  type SyncRun,
} from '@media-tracker/domain'
import { ulid } from 'ulid'

import type { Bindings } from './env'
import {
  createLedgerRepository,
  createSpotifyCatalogJobsRepository,
  createSpotifyLibraryRepository,
} from './env'
import { refreshStoredSpotifyToken } from './spotify-credentials'
import { trackMetadata } from './spotify-sync'

const batchSize = 25
const normalDelaySeconds = 60
const parserVersion = 'spotify-exact-catalog@1'

class StaleCatalogResponseError extends Error {
  constructor() {
    super('Catalog acquisition is stale; a new job must request current metadata')
    this.name = 'StaleCatalogResponseError'
  }
}

function message(jobId: string): SyncJob {
  return {
    idempotencyKey: `catalog:spotify:${jobId}`,
    source: 'spotify',
    operation: 'refresh_spotify_catalog',
    catalogJobId: jobId,
  }
}

function afterSeconds(at: string, seconds: number): string {
  return new Date(Date.parse(at) + seconds * 1000).toISOString()
}

function retryDelay(error: unknown): number {
  if (error instanceof SpotifyApiError && error.status === 429)
    return Math.max(900, retryAfterSeconds(error.retryAfterSeconds))
  return 300
}

function safeErrorCode(error: unknown): string {
  if (error instanceof SpotifyApiError) return `spotify_http_${error.status}`
  return error instanceof Error ? error.name.slice(0, 80) : 'unknown_error'
}

async function sha256(bytes: Uint8Array): Promise<{ hex: string; digest: ArrayBuffer }> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return {
    digest,
    hex: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''),
  }
}

async function persistResponse(input: {
  env: Bindings
  connectionId: string
  runId: string
  kind: 'track' | 'episode' | 'artist'
  id: string
  response: { bytes: Uint8Array; contentType: string }
  at: ReturnType<typeof utcInstant>
}): Promise<RawObject> {
  const ledger = createLedgerRepository(
    input.env.DB,
    input.env.DATABASE_USAGE_OBSERVER,
    input.env.CATALOG_LEASE,
  )
  const acquisitionKey = `spotify:${input.runId}:catalog:${input.kind}:${input.id}`
  const existing = await ledger.findRawObject(
    input.connectionId as RawObject['connectionId'],
    acquisitionKey,
  )
  if (existing !== null) return existing
  const sum = await sha256(input.response.bytes)
  const storageKey = `raw/spotify/sha256/${sum.hex.slice(0, 2)}/${sum.hex}.json`
  await input.env.RAW_BUCKET.put(storageKey, input.response.bytes, {
    httpMetadata: { contentType: input.response.contentType },
    customMetadata: { sha256: sum.hex },
    sha256: sum.digest,
  })
  const raw: RawObject = {
    id: rawObjectId(`spotify_catalog_${input.runId}_${input.kind}_${input.id}`),
    connectionId: input.connectionId as RawObject['connectionId'],
    syncRunId: syncRunId(input.runId),
    kind: 'api_page',
    acquisitionKey,
    storageKey,
    sha256: sum.hex,
    contentType: input.response.contentType,
    byteLength: input.response.bytes.byteLength,
    acquiredAt: input.at,
    processingStatus: 'pending',
    lastParserVersion: null,
    processingError: null,
  }
  await ledger.commit({ rawObjects: [raw] })
  return raw
}

async function responseForCandidate(input: {
  env: Bindings
  connectionId: string
  runId: string
  kind: 'track' | 'episode' | 'artist'
  id: string
  accessToken: string
}): Promise<{ bytes: Uint8Array; contentType: string; raw: RawObject }> {
  const ledger = createLedgerRepository(
    input.env.DB,
    input.env.DATABASE_USAGE_OBSERVER,
    input.env.CATALOG_LEASE,
  )
  const existing = await ledger.findRawObject(
    input.connectionId as RawObject['connectionId'],
    `spotify:${input.runId}:catalog:${input.kind}:${input.id}`,
  )
  if (existing !== null) {
    const acquired = Date.parse(existing.acquiredAt)
    if (
      !Number.isFinite(acquired) ||
      acquired <= Date.parse(spotifyStaleBefore(new Date().toISOString()))
    )
      throw new StaleCatalogResponseError()
    const object = await input.env.RAW_BUCKET.get(existing.storageKey)
    if (object === null) throw new Error('Catalog raw object is missing')
    return {
      bytes: new Uint8Array(await object.arrayBuffer()),
      contentType: existing.contentType,
      raw: existing,
    }
  }
  const response =
    input.kind === 'artist'
      ? await fetchSpotifyArtistResponse({
          accessToken: input.accessToken,
          id: input.id,
          fetch: input.env.SYNC_FETCH ?? fetch,
        })
      : input.kind === 'track'
        ? await fetchSpotifyTrackResponse({
            accessToken: input.accessToken,
            id: input.id,
            fetch: input.env.SYNC_FETCH ?? fetch,
          })
        : await fetchSpotifyEpisodeResponse({
            accessToken: input.accessToken,
            id: input.id,
            fetch: input.env.SYNC_FETCH ?? fetch,
          })
  const raw = await persistResponse({
    ...input,
    response,
    at: utcInstant(new Date().toISOString()),
  })
  return { ...response, raw }
}

async function recordResponse(input: {
  env: Bindings
  raw: RawObject
  kind: 'track' | 'episode' | 'artist'
  id: string
}): Promise<void> {
  const record: SourceRecord = {
    id: sourceRecordId(ulid()),
    rawObjectId: input.raw.id,
    connectionId: input.raw.connectionId,
    recordType: `${input.kind}_catalog_observation`,
    recordPath: '$',
    sourceRecordKey: `spotify:${input.kind}:${input.id}`,
    sourceRecordedAt: null,
    observedAt: input.raw.acquiredAt,
    parserVersion,
    contentSha256: input.raw.sha256,
    disposition: 'normalized',
    upstreamState: 'active',
    errorCode: null,
  }
  await createLedgerRepository(
    input.env.DB,
    input.env.DATABASE_USAGE_OBSERVER,
    input.env.CATALOG_LEASE,
  ).commit({
    sourceRecords: [record],
    rawObjects: [{ ...input.raw, processingStatus: 'processed', lastParserVersion: parserVersion }],
  })
}

export async function startSpotifyCatalogBackfill(
  env: Bindings,
  scheduledAt?: string,
): Promise<string> {
  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_REFRESH_TOKEN || !env.TOKEN_ENCRYPTION_KEY)
    throw new Error('Spotify catalog credentials are not configured')
  const jobs = createSpotifyCatalogJobsRepository(env.DB, env.DATABASE_USAGE_OBSERVER)
  const active = await jobs.findActive()
  if (active !== null) {
    await env.SYNC_QUEUE.send(message(active.id))
    return active.id
  }
  const dailyId = scheduledAt === undefined ? null : `catalog:spotify:${scheduledAt.slice(0, 10)}`
  if (dailyId !== null) {
    const existing = await jobs.find(dailyId)
    if (existing !== null) return existing.id
  }
  const ledger = createLedgerRepository(env.DB, env.DATABASE_USAGE_OBSERVER)
  const connection = await ledger.findConnectionBySource('spotify')
  if (connection === null) throw new Error('Run the Spotify library sync before catalog backfill')
  const at = utcInstant(new Date().toISOString())
  const runId = syncRunId(ulid())
  const run: SyncRun = {
    id: runId,
    connectionId: connection.id,
    kind: 'backfill',
    status: 'running',
    startedAt: at,
    finishedAt: null,
    counts: { rawObjects: 0, sourceRecords: 0, normalizedRecords: 0, failedRecords: 0 },
    errorCode: null,
    errorMessage: null,
  }
  await ledger.saveSyncRun(run)
  const job = await jobs.create({
    id: dailyId ?? ulid(),
    connectionId: connection.id,
    syncRunId: runId,
    at,
  })
  await env.SYNC_QUEUE.send(message(job.id))
  return job.id
}

export async function spotifyCatalogJobStatus(env: Bindings, id: string) {
  const job = await createSpotifyCatalogJobsRepository(env.DB, env.DATABASE_USAGE_OBSERVER).find(id)
  if (job === null) return null
  const backlog = await createSpotifyLibraryRepository(
    env.DB,
    env.DATABASE_USAGE_OBSERVER,
  ).catalogBacklogCounts()
  return {
    jobId: job.id,
    provider: 'spotify' as const,
    state: job.state,
    phase: job.phase,
    requestedCount: job.requestedCount,
    returnedCount: job.returnedCount,
    unavailableCount: job.unavailableCount,
    remainingArtists: backlog.artists,
    remainingTracks: backlog.tracks,
    remainingEpisodes: backlog.episodes,
    nextAttemptAt: job.nextAttemptAt,
    safeErrorCode: job.safeErrorCode,
  }
}

export async function resumeSpotifyCatalogBackfill(env: Bindings): Promise<void> {
  const job = await createSpotifyCatalogJobsRepository(
    env.DB,
    env.DATABASE_USAGE_OBSERVER,
  ).findActive()
  if (job !== null && (job.nextAttemptAt === null || job.nextAttemptAt <= new Date().toISOString()))
    await env.SYNC_QUEUE.send(message(job.id))
}

export async function processSpotifyCatalogBackfill(
  env: Bindings,
  queueJob: SyncJob,
): Promise<void> {
  if (queueJob.operation !== 'refresh_spotify_catalog' || !queueJob.catalogJobId) return
  const jobs = createSpotifyCatalogJobsRepository(env.DB, env.DATABASE_USAGE_OBSERVER)
  const current = await jobs.find(queueJob.catalogJobId)
  if (current === null || current.state === 'succeeded' || current.state === 'failed') return
  const at = new Date().toISOString()
  const budget = new SyncBudget(
    { requests: 26, bytes: 16 * 1024 * 1024, pages: 1, records: batchSize },
    env.SYNC_FETCH ?? fetch,
  )
  env = { ...env, SYNC_FETCH: budget.fetch }
  if (current.nextAttemptAt !== null && current.nextAttemptAt > at)
    throw new CatalogRetryError(
      Math.min(
        43_200,
        Math.max(1, Math.ceil((Date.parse(current.nextAttemptAt) - Date.parse(at)) / 1000)),
      ),
    )
  const leaseToken = await jobs.reserve(current.id, current.phase, at, afterSeconds(at, 300))
  if (leaseToken === null) throw new CatalogRetryError(300)
  if (catalogRetryLimitReached(current, batchSize)) {
    await jobs.fail(current.id, leaseToken, at, 'retry_limit')
    return
  }
  env = { ...env, CATALOG_LEASE: { jobId: current.id, token: leaseToken, kind: 'spotify' } }
  const library = createSpotifyLibraryRepository(
    env.DB,
    env.DATABASE_USAGE_OBSERVER,
    env.CATALOG_LEASE,
  )
  let advanced = false
  let requested = 0
  let returned = 0
  let tracksReturned = 0
  let unavailable = 0
  try {
    // Artist credits in Track responses carry no photos. Share the existing
    // request budget with exact artist lookups, prioritizing frequently heard artists.
    const artists =
      current.phase === 'tracks'
        ? await library.listArtistsNeedingArtwork(Math.floor(batchSize / 2), spotifyStaleBefore(at))
        : []
    const candidates =
      current.phase === 'tracks'
        ? [
            ...artists.map((value) => ({
              kind: 'artist' as const,
              id: value.spotifyId,
              uri: value.artistUri,
              mediaItemId: value.artistId,
            })),
            ...(
              await library.listTracksNeedingMetadata(
                batchSize - artists.length,
                spotifyStaleBefore(at),
              )
            ).map((value) => ({
              kind: 'track' as const,
              id: value.trackId,
              uri: value.trackUri,
              mediaItemId: value.mediaItemId,
            })),
          ]
        : (await library.listPodcastEpisodesNeedingMetadata(batchSize, spotifyStaleBefore(at))).map(
            (value) => ({
              kind: 'episode' as const,
              id: value.episodeId,
              uri: value.episodeUri,
              mediaItemId: value.mediaItemId,
            }),
          )
    if (candidates.length === 0) {
      const backlog = await library.catalogBacklogCounts(spotifyStaleBefore(at))
      if (backlog.tracks > 0 || backlog.episodes > 0 || backlog.artists > 0) {
        advanced = await jobs.advance(current.id, leaseToken, {
          phase: current.phase === 'tracks' ? 'episodes' : 'tracks',
          requested: 0,
          returned: 0,
          unavailable: 0,
          at,
        })
        if (!advanced) throw new CatalogRetryError(300)
        await env.SYNC_QUEUE.send(message(current.id))
      } else {
        if (!(await jobs.complete(current.id, leaseToken, at))) throw new CatalogRetryError(300)
      }
      return
    }
    budget.page(candidates.length)
    const token = await refreshStoredSpotifyToken(env, current.connectionId)
    for (const candidate of candidates) {
      const { id, kind } = candidate
      let response: Awaited<ReturnType<typeof responseForCandidate>>
      try {
        response = await responseForCandidate({
          env,
          connectionId: current.connectionId,
          runId: current.syncRunId,
          kind,
          id,
          accessToken: token.accessToken,
        })
      } catch (error) {
        if (error instanceof SpotifyApiError && error.status === 404) {
          if (candidate.kind === 'artist')
            await library.applyArtistArtwork({
              artistId: candidate.mediaItemId,
              spotifyId: id,
              artistUri: candidate.uri,
              imageUrl: null,
              observedAt: at,
              unavailable: true,
            })
          else if (candidate.kind === 'track')
            await library.markTrackMetadataUnavailable([candidate.mediaItemId], at)
          else await library.markEpisodeCatalogUnavailable(candidate.mediaItemId, at)
          requested++
          unavailable++
          continue
        }
        throw error
      }
      if (candidate.kind === 'artist') {
        const value = parseSpotifyArtistResponse(response)
        if (value.id !== candidate.id || value.uri !== candidate.uri)
          throw new Error('Spotify artist identity mismatch')
        await recordResponse({ env, raw: response.raw, kind, id })
        await library.applyArtistArtwork({
          artistId: candidate.mediaItemId,
          spotifyId: id,
          artistUri: candidate.uri,
          imageUrl: value.imageUrl,
          observedAt: response.raw.acquiredAt,
        })
      } else if (candidate.kind === 'track') {
        const value = parseSpotifyTrackResponse(response)
        if (value.id !== candidate.id || value.uri !== candidate.uri)
          throw new Error('Spotify track identity mismatch')
        await recordResponse({ env, raw: response.raw, kind, id })
        await library.applyTrackMetadata(
          trackMetadata(
            value as typeof value & { id: string; uri: string },
            candidate.mediaItemId,
            response.raw.acquiredAt,
          ),
          { rebuildSearch: false },
        )
        tracksReturned++
      } else {
        const value = parseSpotifyEpisodeResponse(response)
        if (value.episodeId !== candidate.id || value.episodeUri !== candidate.uri)
          throw new Error('Spotify episode identity mismatch')
        await recordResponse({ env, raw: response.raw, kind, id })
        await library.applyEpisodeCatalogMetadata({
          mediaItemId: candidate.mediaItemId,
          episodeId: id,
          episodeUri: candidate.uri,
          title: value.title,
          showId: value.showId === null ? null : `spotify_show_${value.showId}`,
          showUri: value.showUri,
          showName: value.showName,
          description: value.description,
          imageUrl: value.imageUrl,
          canonicalUrl: value.canonicalUrl,
          publishedAt: value.releaseDate,
          publishedPrecision: value.releaseDatePrecision,
          durationMs: value.durationMs,
          observedAt: response.raw.acquiredAt,
        })
      }
      requested++
      returned++
    }
    if (current.phase === 'tracks') {
      if (tracksReturned > 0) await library.rebuildMusicSearch()
    } else {
      await library.rebuildPodcastProjection()
      await library.rebuildPodcastSearch()
    }
    advanced = await jobs.advance(current.id, leaseToken, {
      // Drain a phase before switching; alternating into an empty phase would
      // consume retry reservations for ordinary successful backfill progress.
      phase: current.phase,
      requested,
      returned,
      unavailable,
      at,
    })
    if (!advanced) throw new CatalogRetryError(300)
    await env.SYNC_QUEUE.send(message(current.id), { delaySeconds: normalDelaySeconds })
  } catch (error) {
    if (error instanceof CatalogRetryError) throw error
    if (advanced || error instanceof CatalogLeaseLostError)
      throw new CatalogRetryError(60, { cause: error })
    if (tracksReturned > 0) await library.rebuildMusicSearch()
    if (current.phase === 'episodes' && returned > 0) {
      await library.rebuildPodcastProjection()
      await library.rebuildPodcastSearch()
    }
    const code = safeErrorCode(error)
    if (
      error instanceof SyncDeferredError ||
      error instanceof StaleCatalogResponseError ||
      (error instanceof SpotifyApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 401 &&
        error.status !== 429)
    ) {
      if (
        !(await jobs.fail(current.id, leaseToken, at, code, { requested, returned, unavailable }))
      )
        throw new CatalogRetryError(300)
    } else {
      const delay = retryDelay(error)
      if (
        !(await jobs.defer(current.id, leaseToken, at, afterSeconds(at, delay), code, {
          requested,
          returned,
          unavailable,
        }))
      )
        throw new CatalogRetryError(300)
      await env.SYNC_QUEUE.send(message(current.id), { delaySeconds: Math.min(43_200, delay) })
    }
    console.warn(JSON.stringify({ event: 'spotify.catalog_batch_failed', jobId: current.id, code }))
  }
}
