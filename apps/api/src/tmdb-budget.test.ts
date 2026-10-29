import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Bindings } from './env'
import { boundedTmdbEnvironment } from './tmdb-budget'

const jobId = '01K8QYJ6Q7G6J0Z3VTXYP5CXDD'
function bindings(changes: Partial<Bindings> = {}) {
  return {
    AUTH_MODE: 'access',
    SYNC_ENABLED: 'true',
    TMDB_CATALOG_JOB_ID: jobId,
    TMDB_CATALOG_UNTIL: new Date(Date.now() + 3600_000).toISOString(),
    SYNC_BUDGET_UNTIL: new Date(Date.now() + 7200_000).toISOString(),
    ...changes,
  } as Bindings
}
function database(meta: Record<string, number> = {}) {
  const result = () => ({
    success: true,
    results: [{ id: 'one' }],
    meta: {
      rows_read: 1,
      rows_written: 0,
      size_after: 1_200_000_000,
      ...meta,
    },
  })
  const all = vi.fn(async () => result())
  const statement = { bind: vi.fn(), all, run: all, first: vi.fn() }
  statement.bind.mockReturnValue(statement)
  const batch = vi.fn(async (statements: unknown[]) => statements.map(result))
  return {
    db: { prepare: vi.fn(() => statement), batch } as unknown as D1Database,
    statement,
    all,
    batch,
  }
}
afterEach(() => vi.unstubAllGlobals())

describe('bounded TMDB work', () => {
  it('measures first() mutations, bound statements and batches at the native boundary', async () => {
    const native = database({ rows_written: 25_000 })
    const bounded = boundedTmdbEnvironment(bindings({ DB: native.db }))
    expect(await bounded.env.DB.prepare('claim').bind('id').first('id')).toBe('one')
    await bounded.env.DB.batch([bounded.env.DB.prepare('write')])
    await expect(bounded.env.DB.prepare('must not run').all()).rejects.toThrow('allowance')
    expect(native.all).toHaveBeenCalledTimes(1)
    expect(native.batch).toHaveBeenCalledWith([native.statement])
  })

  it('fails closed on unmeasured statements and oversized provider fan-out', async () => {
    const native = database({ rows_read: NaN })
    const bounded = boundedTmdbEnvironment(bindings({ DB: native.db }))
    await expect(bounded.env.DB.prepare('unmeasured').all()).rejects.toThrow(
      'could not be measured',
    )
    await expect(bounded.env.DB.prepare('later').all()).rejects.toThrow('allowance')
    const fresh = database()
    const next = boundedTmdbEnvironment(bindings({ DB: fresh.db }))
    await expect(
      next.env.DB.batch(Array.from({ length: 1001 }, () => next.env.DB.prepare('x'))),
    ).rejects.toThrow('batch needs review')
    expect(fresh.batch).not.toHaveBeenCalled()
  })

  it('stops before another read after the storage or read threshold is reached', async () => {
    for (const meta of [{ size_after: 3_000_000_000 }, { rows_read: 50_000_000 }]) {
      const native = database(meta)
      const bounded = boundedTmdbEnvironment(bindings({ DB: native.db }))
      await bounded.env.DB.prepare('measure').all()
      await expect(bounded.env.DB.prepare('later').all()).rejects.toThrow(/storage|allowance/)
      expect(native.all).toHaveBeenCalledTimes(1)
    }
  })

  it('counts failed provider requests against the same invocation allowance', async () => {
    const request = vi.fn(async () => {
      throw new Error('network failure')
    })
    vi.stubGlobal('fetch', request)
    const bounded = boundedTmdbEnvironment(bindings({ DB: database().db }))
    for (let index = 0; index < 128; index++)
      await expect(
        bounded.budget.fetch('https://api.themoviedb.org/3/configuration'),
      ).rejects.toThrow('network failure')
    await expect(
      bounded.budget.fetch('https://api.themoviedb.org/3/configuration'),
    ).rejects.toThrow('request allowance')
    expect(request).toHaveBeenCalledTimes(128)
  })
})
