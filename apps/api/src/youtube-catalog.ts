import { ZodError } from 'zod'
import { CatalogRetryError } from './catalog-retry'
import {
  bestYoutubeThumbnail,
  YoutubeApiError,
  YoutubeDataApiClient,
  youtubeDurationMilliseconds,
} from '@media-tracker/connector-youtube'
import type { SyncJob } from '@media-tracker/contracts'
import { ulid } from 'ulid'

import { createCatalogJobsRepository, createVideosRepository } from './env'
import type { Bindings } from './env'

const candidateBatchSize = 250
const providerBatchSize = 50

function chunks<Value>(values: readonly Value[], size: number): Value[][] {
  const result: Value[][] = []
  for (let offset = 0; offset < values.length; offset += size)
    result.push(values.slice(offset, offset + size))
  return result
}

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
    idempotencyKey: `catalog:youtube:${jobId}`,
    source: 'youtube',
    operation: 'refresh_youtube_catalog',
    catalogJobId: jobId,
    catalogCursor: cursor,
  }
}

export async function startYoutubeCatalogRefresh(env: Bindings, at = new Date().toISOString()) {
  if (env.YOUTUBE_API_KEY === undefined) throw new Error('YOUTUBE_API_KEY is not configured')
  const jobs = createCatalogJobsRepository(env.DB, env.DATABASE_USAGE_OBSERVER)
  const active = await jobs.findActive('youtube')
  if (active !== null) {
    await env.SYNC_QUEUE.send(jobMessage(active.id, active.cursor ?? ''))
    return active
  }
  const job = await jobs.create(ulid(), 'youtube', at)
  await env.SYNC_QUEUE.send(jobMessage(job.id))
  return job
}

export async function processYoutubeCatalogRefresh(env: Bindings, job: SyncJob): Promise<void> {
  if (job.operation !== 'refresh_youtube_catalog' || job.catalogJobId === undefined) return
  const at = new Date().toISOString()
  const jobs = createCatalogJobsRepository(env.DB, env.DATABASE_USAGE_OBSERVER)
  const current = await jobs.find(job.catalogJobId)
  if (current === null || current.state === 'succeeded' || current.state === 'failed') return
  if (current.provider !== 'youtube') return
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
  )
  if (reserved === null) throw new CatalogRetryError(300)
  if (env.YOUTUBE_API_KEY === undefined) {
    await jobs.fail(job.catalogJobId, reserved, 'not_configured', at)
    return
  }
  const lease = { jobId: job.catalogJobId, token: reserved, kind: 'catalog' as const }
  let advanced = false
  const repository = createVideosRepository(env.DB, env.DATABASE_USAGE_OBSERVER, lease)
  let stage = 'candidate_query'
  try {
    const candidates = await repository.listYoutubeCatalogCandidates({
      ...(current.cursor === null ? {} : { afterMediaItemId: current.cursor }),
      at,
      limit: candidateBatchSize,
    })
    if (candidates.length === 0) {
      stage = 'expiry_purge'
      await repository.purgeExpiredYoutubeCatalog(at)
      stage = 'completion'
      stage = 'projection_rebuild'
      await repository.rebuild(at, { jobId: job.catalogJobId, token: reserved })
      return
    }
    stage = 'provider_request'
    const client = new YoutubeDataApiClient(env.YOUTUBE_API_KEY)
    const videoBatches = chunks(candidates, providerBatchSize)
    const videos = (
      await Promise.all(
        videoBatches.map((batch) => client.videos(batch.map((candidate) => candidate.videoId))),
      )
    ).flat()
    const channelIds = [
      ...new Set(
        videos
          .map((video) => video.snippet.channelId)
          .filter((value): value is string => value !== null),
      ),
    ]
    const channelBatches = chunks(channelIds, providerBatchSize)
    const [channelResults, categories] = await Promise.all([
      Promise.all(channelBatches.map((batch) => client.channels(batch))),
      current.cursor === null ? client.categories('US') : Promise.resolve([]),
    ])
    const channels = channelResults.flat()
    const expiresAt = daysAfter(at, 30)
    stage = 'persistence'
    await repository.applyYoutubeCatalogBatch({
      jobId: job.catalogJobId,
      at,
      expiresAt,
      requested: candidates,
      videos: videos.map((video) => ({
        mediaItemId: candidates.find((candidate) => candidate.videoId === video.id)!.mediaItemId,
        videoId: video.id,
        title: video.snippet.title,
        description: video.snippet.description,
        channelId: video.snippet.channelId,
        channelTitle: video.snippet.channelTitle,
        publishedAt: video.snippet.publishedAt,
        durationMs: youtubeDurationMilliseconds(video.contentDetails.duration),
        categoryId: video.snippet.categoryId,
        tags: video.snippet.tags,
        captionAvailable:
          video.contentDetails.caption === null ? null : video.contentDetails.caption === 'true',
        definition: video.contentDetails.definition,
        projection: video.contentDetails.projection,
        privacyStatus: video.status.privacyStatus,
        uploadStatus: video.status.uploadStatus,
        embeddable: video.status.embeddable,
        madeForKids: video.status.madeForKids,
        regionRestriction: video.contentDetails.regionRestriction,
        liveBroadcastContent: video.snippet.liveBroadcastContent,
        scheduledStartAt: video.liveStreamingDetails?.scheduledStartTime ?? null,
        actualStartAt: video.liveStreamingDetails?.actualStartTime ?? null,
        actualEndAt: video.liveStreamingDetails?.actualEndTime ?? null,
        thumbnails: video.snippet.thumbnails,
        fetchedAt: at,
        expiresAt,
        etag: video.etag,
      })),
      channels: channels.map((channel) => ({
        channelId: channel.id,
        title: channel.snippet.title,
        description: channel.snippet.description,
        customUrl: channel.snippet.customUrl,
        publishedAt: channel.snippet.publishedAt,
        country: channel.snippet.country,
        thumbnailUrl: bestYoutubeThumbnail(channel.snippet.thumbnails),
        fetchedAt: at,
        expiresAt,
        etag: channel.etag,
      })),
      categories: categories.map((category) => ({
        categoryId: category.id,
        regionCode: 'US',
        title: category.snippet.title,
        assignable: category.snippet.assignable,
        fetchedAt: at,
        expiresAt,
      })),
    })
    stage = 'advance'
    advanced = await jobs.advance(job.catalogJobId, reserved, {
      cursor: candidates.at(-1)!.mediaItemId,
      requested: candidates.length,
      returned: videos.length,
      omitted: candidates.length - videos.length,
      quotaUnits: videoBatches.length + channelBatches.length + (current.cursor === null ? 1 : 0),
      at,
    })
    if (!advanced) throw new CatalogRetryError(300)
    stage = 'enqueue'
    await env.SYNC_QUEUE.send(jobMessage(job.catalogJobId, candidates.at(-1)!.mediaItemId))
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'youtube.catalog_stage_failed',
        stage,
        diagnostic: safeRuntimeDiagnostic(error, env.YOUTUBE_API_KEY),
      }),
    )
    if (error instanceof CatalogRetryError) throw error
    const terminal =
      (error instanceof YoutubeApiError && !error.retryable) || error instanceof ZodError
    if (terminal && !advanced) {
      await jobs.fail(
        job.catalogJobId,
        reserved,
        error instanceof YoutubeApiError ? `http_${error.status}` : 'invalid_provider_response',
        at,
      )
      throw error
    }
    if (!advanced) await jobs.release(job.catalogJobId, reserved, at)
    throw new CatalogRetryError(
      error instanceof YoutubeApiError
        ? Math.min(43_200, Math.max(60, error.retryAfterSeconds ?? 60))
        : 60,
      { cause: error },
    )
  }
}
