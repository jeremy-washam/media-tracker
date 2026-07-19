import { SyncJobSchema } from '@media-tracker/contracts'

import app from './app'

import type { SyncJob } from '@media-tracker/contracts'

import type { Bindings } from './env'

const worker = {
  fetch: app.fetch,
  scheduled() {
    console.info(
      JSON.stringify({
        level: 'info',
        event: 'cron.triggered',
      }),
    )
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
