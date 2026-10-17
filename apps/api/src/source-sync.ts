import { D1DatabaseClient, SqlSourceSyncAdmission } from '@media-tracker/db'
import type { Bindings } from './env'
import { SyncBudget, SyncDeferredError, sourceSyncLimits, type SyncSource } from './sync-budget'
import { jobUsage } from './usage-metrics'

export function sourceSyncAllowed(env: Bindings, source: SyncSource, now = Date.now()) {
  if (env.SYNC_ENABLED === 'false') return false
  if (env.AUTH_MODE !== 'access')
    return env.SYNC_SOURCES === undefined || env.SYNC_SOURCES.split(',').includes(source)
  return (
    (env.SYNC_SOURCES ?? '').split(',').includes(source) &&
    Number.isFinite(Date.parse(env.SYNC_BUDGET_UNTIL ?? '')) &&
    Date.parse(env.SYNC_BUDGET_UNTIL!) > now
  )
}

export async function runSourceSync<Result>(
  env: Bindings,
  source: SyncSource,
  operation: (bindings: Bindings) => Promise<Result>,
): Promise<Result> {
  if (!sourceSyncAllowed(env, source))
    throw new SyncDeferredError('Source sync is paused or its usage grant has expired')
  const started = Date.now()
  const budget = new SyncBudget(sourceSyncLimits[source])
  const usage = jobUsage(env, `sync_${source}`)
  const admission =
    env.AUTH_MODE === 'access' ? new SqlSourceSyncAdmission(new D1DatabaseClient(env.DB)) : null
  const owner = crypto.randomUUID()
  if (admission && !(await admission.acquire(owner, started)))
    throw new SyncDeferredError('Another source sync is running', 300)
  let reserved = false
  let outcome: 'succeeded' | 'failed' = 'failed'
  try {
    if (admission) {
      reserved = await admission.reserve(source, started, JSON.stringify(budget.limits))
      if (!reserved)
        throw new SyncDeferredError('Source daily sync allowance exhausted; retry tomorrow')
    }
    const result = await operation({ ...usage.env, SYNC_BUDGET: budget, SYNC_FETCH: budget.fetch })
    outcome =
      typeof result === 'object' &&
      result !== null &&
      'partialFailures' in result &&
      Array.isArray(result.partialFailures) &&
      result.partialFailures.length > 0
        ? 'failed'
        : 'succeeded'
    return result
  } finally {
    usage.report()
    try {
      if (reserved)
        await admission!.finish(
          source,
          started,
          Date.now(),
          outcome,
          JSON.stringify({ ...budget.usage, ...usage.snapshot() }),
        )
    } finally {
      if (admission) await admission.release(owner)
    }
  }
}
