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

const batchSize = 50

function daysAfter(at: string, days: number) {
  return new Date(Date.parse(at) + days * 86_400_000).toISOString()
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
  const jobs = createCatalogJobsRepository(env.DB)
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
  const jobs = createCatalogJobsRepository(env.DB)
  const current = await jobs.find(job.catalogJobId)
  if (current === null || current.state === 'succeeded' || current.state === 'failed') return
  if ((current.cursor ?? '') !== (job.catalogCursor ?? '')) return
  if (env.YOUTUBE_API_KEY === undefined) {
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
  const repository = createVideosRepository(env.DB)
  try {
    const candidates = await repository.listYoutubeCatalogCandidates({
      ...(current.cursor === null ? {} : { afterMediaItemId: current.cursor }),
      at,
      limit: batchSize,
    })
    if (candidates.length === 0) {
      await repository.purgeExpiredYoutubeCatalog(at)
      await jobs.complete(job.catalogJobId, at)
      await repository.rebuild(at)
      return
    }
    const client = new YoutubeDataApiClient(env.YOUTUBE_API_KEY)
    const videos = await client.videos(candidates.map((candidate) => candidate.videoId))
    const channelIds = [
      ...new Set(
        videos
          .map((video) => video.snippet.channelId)
          .filter((value): value is string => value !== null),
      ),
    ]
    const [channels, categories] = await Promise.all([
      channelIds.length === 0 ? Promise.resolve([]) : client.channels(channelIds),
      current.cursor === null ? client.categories('US') : Promise.resolve([]),
    ])
    const expiresAt = daysAfter(at, 30)
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
    await jobs.advance(job.catalogJobId, {
      cursor: candidates.at(-1)!.mediaItemId,
      requested: candidates.length,
      returned: videos.length,
      omitted: candidates.length - videos.length,
      quotaUnits: 1 + (channelIds.length > 0 ? 1 : 0) + (current.cursor === null ? 1 : 0),
      at,
    })
    await env.SYNC_QUEUE.send(jobMessage(job.catalogJobId, candidates.at(-1)!.mediaItemId))
  } catch (error) {
    if (error instanceof YoutubeApiError && error.retryable)
      await jobs.release(job.catalogJobId, at)
    else
      await jobs.fail(
        job.catalogJobId,
        error instanceof YoutubeApiError
          ? `http_${error.status}`
          : error instanceof Error
            ? error.name
            : 'unknown',
        at,
      )
    throw error
  }
}
