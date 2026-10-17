import { SyncJobSchema } from '@media-tracker/contracts'
import { D1DatabaseClient, SqlSourceSyncAdmission } from '@media-tracker/db'
import { SyncDeferredError, type SyncSource } from './sync-budget'

import app from './app'
import { authorizeRequest, privateAccessError } from './access'
import { limitApiUsage } from './usage-limits'
import { jobUsage } from './usage-metrics'
import { runSourceSync, sourceSyncAllowed } from './source-sync'
import { maintainCatalog, MAINTENANCE_CRON } from './catalog-maintenance'
import { syncHardcover } from './hardcover-sync'
import { syncLetterboxdRss } from './letterboxd-rss-sync'
import { syncReadwiseArchive } from './readwise-sync'
import { acquireReadwiseArticleContent, indexReadwiseArticleContent } from './readwise-content'
import { syncSpotifySavedEpisodes } from './spotify-sync'
import { createArticlesRepository } from './env'
import { processTmdbCatalogRefresh, startTmdbCatalogRefresh } from './tmdb-catalog'
import { processYoutubeCatalogRefresh, startYoutubeCatalogRefresh } from './youtube-catalog'
import { TmdbApiError } from '@media-tracker/connector-tmdb'
import { YoutubeApiError } from '@media-tracker/connector-youtube'
import { processSpotifyCatalogBackfill, resumeSpotifyCatalogBackfill } from './spotify-catalog'

import type { SyncJob } from '@media-tracker/contracts'

import type { Bindings } from './env'

const sourceOperations = {
  letterboxd: syncLetterboxdRss,
  hardcover: syncHardcover,
  readwise: syncReadwiseArchive,
  spotify: syncSpotifySavedEpisodes,
}

async function enqueueSources(env: Bindings) {
  const admission = new SqlSourceSyncAdmission(new D1DatabaseClient(env.DB))
  const now = Date.now()
  const messages: MessageSendRequest<SyncJob>[] = []
  for (const source of Object.keys(sourceOperations) as SyncSource[]) {
    if (sourceSyncAllowed(env, source) && (await admission.available(source, now)))
      messages.push({
        body: {
          source,
          operation: 'sync_source',
          idempotencyKey: `source-sync:${source}:${new Date(now).toISOString().slice(0, 10)}`,
        },
      })
  }
  if (messages.length) await env.SYNC_QUEUE.sendBatch(messages)
}

async function scheduledJob<Result>(
  env: Bindings,
  scope: string,
  operation: (bindings: Bindings) => Promise<Result>,
): Promise<Result> {
  const usage = jobUsage(env, scope)
  try {
    return await operation(usage.env)
  } finally {
    usage.report()
  }
}

const worker = {
  async fetch(request: Request, env: Bindings, context: ExecutionContext) {
    const denied = await authorizeRequest(request, env)
    if (denied) return denied
    if (env.SYNC_ENABLED === 'false' && !['GET', 'HEAD', 'OPTIONS'].includes(request.method))
      return privateAccessError(503, 'Sync is paused during deployment.')
    const pathname = new URL(request.url).pathname
    if (
      env.AUTH_MODE === 'access' &&
      env.SYNC_ENABLED === 'true' &&
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      !/^\/api\/connections\/(readwise|hardcover|letterboxd|spotify)\/sync$/.test(pathname)
    )
      return privateAccessError(503, 'Imports and enrichment are paused during source-sync setup.')
    if (pathname === '/__scheduled' && env.AUTH_MODE !== 'local')
      return new Response('Not found', { status: 404 })
    if (pathname !== '/api' && !pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    const limited = await limitApiUsage(request, env)
    if (limited) return limited
    return app.fetch(request, env, context)
  },
  scheduled(controller, env, context) {
    if (controller.cron === MAINTENANCE_CRON && env.MAINTENANCE_ENABLED === 'true')
      context.waitUntil(maintainCatalog(env))
    // The frequent cleanup schedule must never increase provider polling cadence.
    if (controller.cron === MAINTENANCE_CRON || env.SYNC_ENABLED === 'false') return
    if (env.AUTH_MODE === 'access') {
      // Each source gets its own bounded queue invocation, rather than sharing
      // the scheduled handler's wall-clock lifetime with every other provider.
      context.waitUntil(enqueueSources(env))
      return
    }
    console.info(
      JSON.stringify({
        level: 'info',
        event: 'cron.triggered',
      }),
    )
    const tasks: (() => Promise<void>)[] = []
    if (env.LETTERBOXD_USERNAME === undefined || !sourceSyncAllowed(env, 'letterboxd')) {
      console.info(
        JSON.stringify({
          level: 'info',
          event: 'letterboxd.rss_skipped',
          reason: 'not_configured',
        }),
      )
    } else {
      tasks.push(() =>
        runSourceSync(env, 'letterboxd', syncLetterboxdRss)
          .then((result) => {
            console.info(
              JSON.stringify({
                level: 'info',
                event: 'letterboxd.rss_completed',
                syncRunId: result.syncRunId,
                unchanged: result.unchanged,
                feedEntries: result.feedEntries,
                unresolvedRecords: result.unresolvedRecords,
              }),
            )
          })
          .catch((error: unknown) => {
            console.error(
              JSON.stringify({
                level: 'error',
                event: 'letterboxd.rss_failed',
                errorName: error instanceof Error ? error.name : 'UnknownError',
              }),
            )
          }),
      )
    }
    if (env.HARDCOVER_TOKEN === undefined || !sourceSyncAllowed(env, 'hardcover')) {
      console.info(
        JSON.stringify({
          level: 'info',
          event: 'hardcover.sync_skipped',
          reason: 'not_configured',
        }),
      )
    } else {
      tasks.push(() =>
        runSourceSync(env, 'hardcover', syncHardcover)
          .then((result) => {
            console.info(
              JSON.stringify({
                level: 'info',
                event: 'hardcover.sync_completed',
                syncRunId: result.syncRunId,
                mode: result.mode,
                books: result.books,
                archiveEntries: result.archiveEntries,
              }),
            )
          })
          .catch((error: unknown) => {
            console.error(
              JSON.stringify({
                level: 'error',
                event: 'hardcover.sync_failed',
                errorName: error instanceof Error ? error.name : 'UnknownError',
              }),
            )
          }),
      )
    }
    if (env.READWISE_TOKEN === undefined || !sourceSyncAllowed(env, 'readwise')) {
      console.info(
        JSON.stringify({
          level: 'info',
          event: 'readwise.sync_skipped',
          reason: 'not_configured',
        }),
      )
    } else {
      tasks.push(() =>
        runSourceSync(env, 'readwise', syncReadwiseArchive)
          .then((result) => {
            console.info(
              JSON.stringify({
                level: 'info',
                event: 'readwise.sync_completed',
                syncRunId: result.syncRunId,
                pages: result.pages,
                archiveItems: result.archiveItems,
              }),
            )
          })
          .catch((error: unknown) => {
            console.error(
              JSON.stringify({
                level: 'error',
                event: 'readwise.sync_failed',
                errorName: error instanceof Error ? error.name : 'UnknownError',
              }),
            )
          }),
      )
    }
    if (
      env.SPOTIFY_CLIENT_ID === undefined ||
      env.SPOTIFY_REFRESH_TOKEN === undefined ||
      !sourceSyncAllowed(env, 'spotify')
    ) {
      console.info(
        JSON.stringify({
          level: 'info',
          event: 'spotify.sync_skipped',
          reason: 'not_configured',
        }),
      )
    } else {
      tasks.push(() =>
        runSourceSync(env, 'spotify', syncSpotifySavedEpisodes)
          .then((result) => {
            console.info(
              JSON.stringify({
                level: 'info',
                event: 'spotify.sync_completed',
                syncRunId: result.syncRunId,
                mode: result.mode,
                archiveEpisodes: result.archiveEpisodes,
                refreshTokenRotated: result.refreshTokenRotated,
              }),
            )
          })
          .catch((error: unknown) => {
            console.error(
              JSON.stringify({
                level: 'error',
                event: 'spotify.sync_failed',
                errorName: error instanceof Error ? error.name : 'UnknownError',
                errorMessage: error instanceof Error ? error.message : 'Unknown failure',
              }),
            )
          }),
      )
    }
    if (env.CATALOG_AUTO_REFRESH === 'true' && env.TMDB_API_READ_TOKEN !== undefined)
      tasks.push(() =>
        scheduledJob(env, 'scheduled_tmdb_catalog', startTmdbCatalogRefresh).then(() => undefined),
      )
    if (env.CATALOG_AUTO_REFRESH === 'true' && env.YOUTUBE_API_KEY !== undefined)
      tasks.push(() =>
        scheduledJob(env, 'scheduled_youtube_catalog', startYoutubeCatalogRefresh).then(
          () => undefined,
        ),
      )
    if (env.SPOTIFY_CATALOG_ENABLED !== 'false')
      tasks.push(() => scheduledJob(env, 'scheduled_spotify_catalog', resumeSpotifyCatalogBackfill))
    if (tasks.length > 0) {
      context.waitUntil(tasks.reduce((chain, task) => chain.then(task), Promise.resolve()))
    }
  },
  async queue(batch, env) {
    if (env.SYNC_ENABLED === 'false') {
      batch.retryAll({ delaySeconds: 300 })
      return
    }
    for (const message of batch.messages) {
      const result = SyncJobSchema.safeParse(message.body)

      if (!result.success) {
        console.error(
          JSON.stringify({
            level: 'error',
            event: 'queue.invalid_message',
            messageId: message.id,
          }),
        )
        message.ack()
        continue
      }

      if (result.data.operation === 'sync_source') {
        const source = result.data.source
        if (!(source in sourceOperations)) {
          message.ack()
          continue
        }
        try {
          const operation = sourceOperations[source as SyncSource]
          await runSourceSync<unknown>(env, source as SyncSource, operation)
          message.ack()
        } catch (error) {
          if (error instanceof SyncDeferredError && error.retryAfterSeconds !== undefined)
            message.retry({ delaySeconds: error.retryAfterSeconds })
          else {
            // Failed/admitted work is recorded durably. The next eligible daily
            // attempt retries from committed checkpoints instead of hot-looping.
            console.error(
              JSON.stringify({
                level: 'error',
                event: 'source_sync.stopped',
                source,
                errorName: error instanceof Error ? error.name : 'UnknownError',
              }),
            )
            message.ack()
          }
        }
        continue
      }

      if (
        ((result.data.operation === 'acquire_article_content' ||
          result.data.operation === 'index_article_content') &&
          env.ARTICLE_CONTENT_ENABLED === 'false') ||
        (result.data.operation === 'refresh_spotify_catalog' &&
          env.SPOTIFY_CATALOG_ENABLED === 'false') ||
        ((result.data.operation === 'refresh_tmdb_catalog' ||
          result.data.operation === 'refresh_youtube_catalog') &&
          env.CATALOG_AUTO_REFRESH === 'false')
      ) {
        // Keep queued work recoverable; rollout config leaves consumers detached.
        message.retry({ delaySeconds: 43200 })
        continue
      }

      const usage = jobUsage(env, result.data.operation)
      try {
        if (
          result.data.operation === 'acquire_article_content' ||
          result.data.operation === 'index_article_content'
        ) {
          try {
            if (result.data.operation === 'acquire_article_content')
              await acquireReadwiseArticleContent(usage.env, result.data)
            else await indexReadwiseArticleContent(usage.env, result.data)
            message.ack()
          } catch (error) {
            await createArticlesRepository(
              usage.env.DB,
              usage.env.DATABASE_USAGE_OBSERVER,
            ).failContentJob(
              result.data.idempotencyKey,
              new Date().toISOString(),
              error instanceof Error ? error.name : 'UnknownError',
            )
            console.error(
              JSON.stringify({
                level: 'error',
                event: 'readwise.content_failed',
                messageId: message.id,
                errorName: error instanceof Error ? error.name : 'UnknownError',
              }),
            )
            message.retry()
          }
          continue
        }

        if (
          result.data.operation === 'refresh_tmdb_catalog' ||
          result.data.operation === 'refresh_youtube_catalog'
        ) {
          try {
            if (result.data.operation === 'refresh_tmdb_catalog')
              await processTmdbCatalogRefresh(usage.env, result.data)
            else await processYoutubeCatalogRefresh(usage.env, result.data)
            message.ack()
          } catch (error) {
            console.error(
              JSON.stringify({
                level: 'error',
                event: 'catalog.refresh_failed',
                provider: result.data.source,
                messageId: message.id,
                errorName: error instanceof Error ? error.name : 'UnknownError',
              }),
            )
            if (
              (error instanceof TmdbApiError && error.retryable) ||
              (error instanceof YoutubeApiError && error.retryable)
            )
              message.retry()
            else message.ack()
          }
          continue
        }

        if (result.data.operation === 'refresh_spotify_catalog') {
          try {
            await processSpotifyCatalogBackfill(usage.env, result.data)
            message.ack()
          } catch (error) {
            console.error(
              JSON.stringify({
                level: 'error',
                event: 'spotify.catalog_queue_failed',
                messageId: message.id,
                errorName: error instanceof Error ? error.name : 'UnknownError',
              }),
            )
            message.retry()
          }
          continue
        }

        console.info(
          JSON.stringify({
            level: 'info',
            event: 'queue.placeholder_received',
            messageId: message.id,
            idempotencyKey: result.data.idempotencyKey,
            source: result.data.source,
            operation: result.data.operation,
          }),
        )
        message.ack()
      } finally {
        usage.report()
      }
    }
  },
} satisfies ExportedHandler<Bindings, SyncJob>

export default worker
