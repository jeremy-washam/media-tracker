import { SyncJobSchema } from '@media-tracker/contracts'

import app from './app'
import { syncHardcover } from './hardcover-sync'
import { syncLetterboxdRss } from './letterboxd-rss-sync'
import { syncReadwiseArchive } from './readwise-sync'
import { acquireReadwiseArticleContent, indexReadwiseArticleContent } from './readwise-content'
import { syncSpotifySavedEpisodes } from './spotify-sync'
import { createArticlesRepository } from './env'

import type { SyncJob } from '@media-tracker/contracts'

import type { Bindings } from './env'

const worker = {
  fetch: app.fetch,
  scheduled(_controller, env, context) {
    console.info(
      JSON.stringify({
        level: 'info',
        event: 'cron.triggered',
      }),
    )
    const tasks: (() => Promise<void>)[] = []
    if (env.LETTERBOXD_USERNAME === undefined) {
      console.info(
        JSON.stringify({
          level: 'info',
          event: 'letterboxd.rss_skipped',
          reason: 'not_configured',
        }),
      )
    } else {
      tasks.push(() =>
        syncLetterboxdRss(env)
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
    if (env.HARDCOVER_TOKEN === undefined) {
      console.info(
        JSON.stringify({
          level: 'info',
          event: 'hardcover.sync_skipped',
          reason: 'not_configured',
        }),
      )
    } else {
      tasks.push(() =>
        syncHardcover(env)
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
    if (env.READWISE_TOKEN === undefined) {
      console.info(
        JSON.stringify({
          level: 'info',
          event: 'readwise.sync_skipped',
          reason: 'not_configured',
        }),
      )
    } else {
      tasks.push(() =>
        syncReadwiseArchive(env)
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
    if (env.SPOTIFY_CLIENT_ID === undefined || env.SPOTIFY_REFRESH_TOKEN === undefined) {
      console.info(
        JSON.stringify({
          level: 'info',
          event: 'spotify.sync_skipped',
          reason: 'not_configured',
        }),
      )
    } else {
      tasks.push(() =>
        syncSpotifySavedEpisodes(env)
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
    if (tasks.length > 0) {
      context.waitUntil(tasks.reduce((chain, task) => chain.then(task), Promise.resolve()))
    }
  },
  async queue(batch, env) {
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

      if (
        result.data.operation === 'acquire_article_content' ||
        result.data.operation === 'index_article_content'
      ) {
        try {
          if (result.data.operation === 'acquire_article_content')
            await acquireReadwiseArticleContent(env, result.data)
          else await indexReadwiseArticleContent(env, result.data)
          message.ack()
        } catch (error) {
          await createArticlesRepository(env.DB).failContentJob(
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
    }
  },
} satisfies ExportedHandler<Bindings, SyncJob>

export default worker
