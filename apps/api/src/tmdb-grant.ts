import type { Bindings } from './env'
import { SyncBudget, SyncDeferredError } from './sync-budget'

// One reviewed refresh, including all retry/lease-recovery attempts. Changing
// the job ID requires another account-wide allowance review.
export const tmdbGrantAttempts = 80

export function tmdbGrantAllowed(env: Bindings, jobId: string | undefined, now = Date.now()) {
  const until = Date.parse(env.TMDB_CATALOG_UNTIL ?? '')
  const sourceUntil = Date.parse(env.SYNC_BUDGET_UNTIL ?? '')
  return (
    env.AUTH_MODE === 'access' &&
    env.SYNC_ENABLED === 'true' &&
    Boolean(jobId) &&
    jobId === env.TMDB_CATALOG_JOB_ID &&
    Number.isFinite(until) &&
    until > now &&
    until <= sourceUntil &&
    until <= now + 32 * 86_400_000
  )
}

/** Native D1 boundary: check between operations and count first() through all()
 * so write claims retain their real metadata. A single operation may cross the
 * stop threshold; the reviewed allocation reserves headroom for that operation.
 */
export function boundedTmdbEnvironment(env: Bindings) {
  let rowsRead = 0
  let rowsWritten = 0
  let databaseBytes = 0
  let uncertain = false
  const budget = new SyncBudget(
    { requests: 128, bytes: 16 * 1024 * 1024, pages: 1, records: 10 },
    fetch,
    Date.now,
    () => {
      if (uncertain || rowsRead >= 50_000_000 || rowsWritten >= 50_000)
        throw new SyncDeferredError('TMDB database allowance needs review')
      if (!tmdbGrantAllowed(env, env.TMDB_CATALOG_JOB_ID))
        throw new SyncDeferredError('TMDB refresh grant has expired')
      return { rowsRead, rowsWritten, databaseBytes }
    },
  )
  function measure(result: D1Result) {
    const meta = result.meta
    if (
      !result.success ||
      !Number.isSafeInteger(meta?.rows_read) ||
      meta.rows_read < 0 ||
      !Number.isSafeInteger(meta?.rows_written) ||
      meta.rows_written < 0 ||
      !Number.isFinite(meta?.size_after) ||
      meta.size_after <= 0
    ) {
      uncertain = true
      throw new SyncDeferredError('TMDB database usage could not be measured')
    }
    rowsRead += meta.rows_read
    rowsWritten += meta.rows_written
    databaseBytes = Math.max(databaseBytes, meta.size_after)
  }
  const originals = new WeakMap<D1PreparedStatement, D1PreparedStatement>()
  function wrap(statement: D1PreparedStatement): D1PreparedStatement {
    const proxy = new Proxy(statement, {
      get(target, property) {
        if (property === 'bind') return (...values: unknown[]) => wrap(target.bind(...values))
        if (property === 'first')
          return async (column?: string) => {
            budget.check()
            const result = await target.all<Record<string, unknown>>()
            measure(result)
            const first = result.results[0] ?? null
            return column === undefined || first === null ? first : first[column]
          }
        if (property === 'run' || property === 'all')
          return async () => {
            budget.check()
            const result = await target[property]()
            measure(result)
            return result
          }
        const value: unknown = Reflect.get(target, property)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    originals.set(proxy, statement)
    return proxy
  }
  const database = new Proxy(env.DB, {
    get(target, property) {
      if (property === 'prepare') return (query: string) => wrap(target.prepare(query))
      if (property === 'batch')
        return async (statements: D1PreparedStatement[]) => {
          budget.check()
          // Catalog writes are bounded before dispatch; unexpectedly large
          // provider fan-out stops without partially applying the batch.
          if (statements.length > 1_000)
            throw new SyncDeferredError('TMDB statement batch needs review')
          const results = await target.batch(
            statements.map((value) => originals.get(value) ?? value),
          )
          for (const result of results) measure(result)
          return results
        }
      const value: unknown = Reflect.get(target, property)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  return { env: { ...env, DB: database }, budget }
}
