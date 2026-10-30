import {
  SourceSyncQueuedResponseSchema,
  type SourceSyncQueuedResponse,
} from '@media-tracker/contracts'
import { D1DatabaseClient, SqlSourceSyncAdmission } from '@media-tracker/db'
import type { Bindings } from './env'
import { operatingWorkAllowed } from './operating-budget'
import { sourceSyncAllowed } from './source-sync'
import { SyncDeferredError, type SyncSource } from './sync-budget'

const configured = (env: Bindings, source: SyncSource) => {
  switch (source) {
    case 'readwise':
      return Boolean(env.READWISE_TOKEN?.trim())
    case 'hardcover':
      return Boolean(env.HARDCOVER_TOKEN?.trim())
    case 'letterboxd':
      return Boolean(env.LETTERBOXD_USERNAME?.trim())
    case 'spotify':
      return Boolean(
        env.SPOTIFY_CLIENT_ID?.trim() &&
        env.SPOTIFY_REFRESH_TOKEN?.trim() &&
        env.TOKEN_ENCRYPTION_KEY?.trim(),
      )
  }
}

/** Hosted manual requests await durable enqueue, never the provider scan.
 * Preflight reads do not reserve work. The consumer rechecks admission and all
 * existing limits, including changes between this check and Queue delivery. */
export async function queueHostedSourceSync(
  env: Bindings,
  source: SyncSource,
  requestId: string,
): Promise<SourceSyncQueuedResponse | null> {
  if (env.AUTH_MODE !== 'access') return null
  if (!sourceSyncAllowed(env, source)) throw new SyncDeferredError('Source sync is paused')
  if (!configured(env, source))
    throw new SyncDeferredError('Source sync credentials are not configured')
  if (!(await operatingWorkAllowed(env))) throw new SyncDeferredError('Source sync is paused')
  const now = Date.now()
  const db = new D1DatabaseClient(env.DB, env.DATABASE_USAGE_OBSERVER)
  const admission = new SqlSourceSyncAdmission(db)
  if (!(await admission.withinAllowance(now)))
    throw new SyncDeferredError('Source sync daily safety ceiling reached')
  if (
    await db.prepare('SELECT 1 FROM source_sync_lease WHERE expires_at>? LIMIT 1').bind(now).first()
  )
    throw new SyncDeferredError('Another source sync is running', 300)
  if (
    !(await admission.available(source, now)) &&
    !(await admission.resumable(source, now)) &&
    !(await admission.retryable(source, now))
  )
    throw new SyncDeferredError(
      'Source daily sync allowance exhausted; retry when the next allocation is eligible',
    )
  const receipt = SourceSyncQueuedResponseSchema.parse({ status: 'queued', source, requestId })
  try {
    await env.SYNC_QUEUE.send({
      operation: 'sync_source',
      source,
      idempotencyKey: `source-sync:${source}:manual:${requestId}`,
    })
  } catch {
    // A lost send response is uncertain, not proof that no message was stored.
    throw new SyncDeferredError(
      'Source sync enqueue could not be confirmed. Check recent activity before retrying.',
    )
  }
  return receipt
}
