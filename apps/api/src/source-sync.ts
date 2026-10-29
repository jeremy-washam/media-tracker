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
import { operatingWorkAllowed } from './operating-budget'

export function sourceSyncAllowed(env: Bindings, source: SyncSource) {
  if (env.SYNC_ENABLED === 'false') return false
  if (env.AUTH_MODE !== 'access')
    return env.SYNC_SOURCES === undefined || env.SYNC_SOURCES.split(',').includes(source)
  return (env.SYNC_SOURCES ?? '').split(',').includes(source)
}

function providerRetryAt(error: unknown, now: number): number {
  if (typeof error !== 'object' || error === null) return 0
  if (
    'retryAfterSeconds' in error &&
    typeof error.retryAfterSeconds === 'number' &&
    Number.isFinite(error.retryAfterSeconds) &&
    error.retryAfterSeconds > 0
  )
    return Math.min(Number.MAX_SAFE_INTEGER, now + Math.ceil(error.retryAfterSeconds * 1000))
  if ('retryAfter' in error && typeof error.retryAfter === 'string') {
    const seconds = Number(error.retryAfter)
    const at = Number.isFinite(seconds)
      ? now + Math.max(0, seconds) * 1000
      : Date.parse(error.retryAfter)
    return Number.isFinite(at) && at > now ? Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(at)) : 0
  }
  return 0
}

export async function runSourceSync<Result>(
  env: Bindings,
  source: SyncSource,
  operation: (bindings: Bindings) => Promise<Result>,
): Promise<Result> {
  if (!sourceSyncAllowed(env, source) || !(await operatingWorkAllowed(env)))
    throw new SyncDeferredError('Source sync is paused')
  const started = Date.now()
  const usage = jobUsage(env, `sync_${source}`)
  let previousUsage: Record<string, number> = {}
  const cumulativeDatabaseUsage = () => {
    const current = usage.snapshot()
    return {
      rowsRead: current.rowsRead + (previousUsage.rowsRead ?? 0),
      rowsWritten: current.rowsWritten + (previousUsage.rowsWritten ?? 0),
      databaseBytes: Math.max(current.databaseBytes, previousUsage.databaseBytes ?? 0),
    }
  }
  let budget = new SyncBudget(sourceSyncLimits[source], fetch, Date.now, cumulativeDatabaseUsage)
  let admissionStarted = started
  const admission =
    env.AUTH_MODE === 'access' ? new SqlSourceSyncAdmission(new D1DatabaseClient(env.DB)) : null
  const owner = crypto.randomUUID()
  if (admission) {
    const storage = await env.DB.prepare('SELECT 1').all()
    const size = storage.meta.size_after
    if (!Number.isFinite(size) || size <= 0 || size >= 3_000_000_000)
      throw new SyncDeferredError('Database storage headroom must be verified before source sync')
  }
  if (admission && !(await admission.acquire(owner, started)))
    throw new SyncDeferredError('Another source sync is running', 300)
  let reserved = false
  let outcome: 'succeeded' | 'failed' | 'running' = 'failed'
  let retryNotBefore = 0
  let snapshotRunId: string | undefined
  try {
    if (admission) {
      if (!(await admission.withinAllowance()))
        throw new SyncDeferredError('Source sync daily safety ceiling reached')
      const pending = await admission.resumable(source, started)
      reserved =
        !pending && (await admission.reserve(source, started, JSON.stringify(budget.limits)))
      if (!reserved) {
        const continuation = pending
        const previous = continuation ?? (await admission.retryable(source, started))
        if (previous) {
          const exhausted = async (reason: string): Promise<never> => {
            await admission.exhaust(source, previous.started_at, started, reason)
            throw new SyncDeferredError(reason)
          }
          if (previous.attempts >= 96)
            await exhausted('Source continuation attempt ceiling reached')
          const initial: SyncLimits = JSON.parse(previous.reservation_json)
          const used: Record<string, number> = JSON.parse(previous.usage_json)
          const remaining = { ...sourceSyncLimits[source] }
          for (const key of Object.keys(remaining) as (keyof SyncLimits)[]) {
            if (
              !Number.isSafeInteger(initial[key]) ||
              !Number.isSafeInteger(used[key]) ||
              used[key]! < 0
            )
              await exhausted('Prior sync usage cannot be reconciled')
            remaining[key] = Math.min(remaining[key], initial[key]) - used[key]!
            if (remaining[key] < 0 || (remaining[key] === 0 && previous.scan_complete !== 1))
              await exhausted('No reserved sync allowance remains')
          }
          if ((used.failedOperations ?? 0) > 0 || (used.unmeasuredNonFirstStatements ?? 0) > 0)
            await exhausted('Prior database usage is uncertain; checkpoint retained')
          reserved = continuation
            ? await admission.claimContinuation(source, previous.started_at, started)
            : await admission.claimRetry(source, previous.started_at, started)
          if (reserved) {
            budget = new SyncBudget(remaining, fetch, Date.now, cumulativeDatabaseUsage)
            admissionStarted = previous.started_at
            previousUsage = used
            snapshotRunId = previous.snapshot_run_id ?? undefined
          }
        }
      }
      if (!reserved)
        throw new SyncDeferredError('Source daily sync allowance exhausted; retry tomorrow')
    }
    budget.check()
    const checkedFetch: typeof fetch = async (input, init) => {
      if (!(await operatingWorkAllowed(env))) throw new SyncDeferredError('Source sync is paused')
      return budget.fetch(input, init)
    }
    const result = await operation({ ...usage.env, SYNC_BUDGET: budget, SYNC_FETCH: checkedFetch })
    if (
      source === 'hardcover' &&
      typeof result === 'object' &&
      result !== null &&
      'syncRunId' in result &&
      typeof result.syncRunId === 'string'
    )
      snapshotRunId = result.syncRunId
    outcome =
      typeof result === 'object' &&
      result !== null &&
      'continuation' in result &&
      result.continuation === true
        ? 'running'
        : typeof result === 'object' &&
            result !== null &&
            'partialFailures' in result &&
            Array.isArray(result.partialFailures) &&
            result.partialFailures.length > 0
          ? 'failed'
          : 'succeeded'
    return result
  } catch (error) {
    retryNotBefore = providerRetryAt(error, Date.now())
    throw error
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
                key === 'databaseBytes'
                  ? Math.max(value, previousUsage[key] ?? 0)
                  : value + (previousUsage[key] ?? 0),
              ]),
            ),
          ),
          { ...(snapshotRunId === undefined ? {} : { snapshotRunId }), retryNotBefore },
        )
    } finally {
      if (admission) await admission.release(owner)
    }
  }
}
