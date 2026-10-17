import { D1DatabaseClient, SqlSourceSyncAdmission } from '@media-tracker/db'
import type { Bindings } from './env'
import {
  SyncBudget,
  SyncDeferredError,
  sourceSyncLimits,
  type SyncSource,
  type SyncLimits,
} from './sync-budget'
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
  let budget = new SyncBudget(sourceSyncLimits[source])
  let admissionStarted = started
  let previousUsage: Record<string, number> = {}
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
      if (!reserved && env.SYNC_RETRY_SOURCE === source) {
        const previous = await admission.retryable(source, started)
        if (previous) {
          const initial: SyncLimits = JSON.parse(previous.reservation_json)
          const used: Record<string, number> = JSON.parse(previous.usage_json)
          const remaining = { ...sourceSyncLimits[source] }
          for (const key of Object.keys(remaining) as (keyof SyncLimits)[]) {
            if (
              !Number.isSafeInteger(initial[key]) ||
              !Number.isSafeInteger(used[key]) ||
              used[key]! < 0
            )
              throw new SyncDeferredError('Prior sync usage cannot be reconciled')
            remaining[key] = Math.min(remaining[key], initial[key]) - used[key]!
            if (remaining[key] <= 0)
              throw new SyncDeferredError('No reserved sync allowance remains')
          }
          reserved = await admission.claimRetry(source, previous.started_at)
          if (reserved) {
            budget = new SyncBudget(remaining)
            admissionStarted = previous.started_at
            previousUsage = used
          }
        }
      }
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
          admissionStarted,
          Date.now(),
          outcome,
          JSON.stringify(
            Object.fromEntries(
              Object.entries({ ...budget.usage, ...usage.snapshot() }).map(([key, value]) => [
                key,
                value + (previousUsage[key] ?? 0),
              ]),
            ),
          ),
        )
    } finally {
      if (admission) await admission.release(owner)
    }
  }
}
