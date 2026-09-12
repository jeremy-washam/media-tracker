import { SyncJobSchema } from '@media-tracker/contracts'

import app from './app'
import { syncHardcover } from './hardcover-sync'
import { syncLetterboxdRss } from './letterboxd-rss-sync'

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
    const tasks: Promise<unknown>[] = []
    if (env.LETTERBOXD_USERNAME === undefined) {
      console.info(
        JSON.stringify({
          level: 'info',
          event: 'letterboxd.rss_skipped',
          reason: 'not_configured',
        }),
      )
    } else {
      tasks.push(
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
      tasks.push(
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
    if (tasks.length > 0) context.waitUntil(Promise.all(tasks))
  },
  queue(batch) {
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
