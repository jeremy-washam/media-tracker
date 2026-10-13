import { afterEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { D1DatabaseClient } from '@media-tracker/db'
import type { AppEnv, Bindings } from './env'
import { requestContext, requestLogger } from './middleware'
import { jobUsage } from './usage-metrics'

function gate() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('scoped database usage', () => {
  it('isolates concurrent HTTP totals, reports unknown first costs, and omits private identifiers', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const originalObserver = vi.fn()
    const gates = { alpha: gate(), beta: gate() }
    const entered = { alpha: gate(), beta: gate() }
    const env = {
      DATABASE_USAGE_OBSERVER: originalObserver,
      DB: {
        prepare() {
          let id: 'alpha' | 'beta'
          return {
            bind(value: string) {
              id = value as typeof id
              return this
            },
            async all() {
              entered[id].resolve()
              await gates[id].promise
              return {
                success: true,
                results: [],
                meta: { rows_read: id === 'alpha' ? 13 : 21, rows_written: 0 },
              }
            },
            async first() {
              return null
            },
            async run() {
              return { success: true }
            },
          }
        },
      },
    } as unknown as Bindings
    const app = new Hono<AppEnv>()
    app.use('*', requestContext, requestLogger)
    app.get('/synthetic/:privateId', async (context) => {
      const client = new D1DatabaseClient(context.env.DB, context.get('databaseUsageObserver'))
      await client.prepare('synthetic SQL').bind(context.req.param('privateId')).all()
      await client.prepare('synthetic SQL').first()
      return context.json({ ok: true })
    })
    const alpha = app.request(
      '/synthetic/alpha?q=private-query',
      { headers: { 'x-request-id': 'request-alpha' } },
      env,
    )
    const beta = app.request(
      '/synthetic/beta?q=private-query',
      { headers: { 'x-request-id': 'request-beta' } },
      env,
    )
    await Promise.all([entered.alpha.promise, entered.beta.promise])
    gates.beta.resolve()
    expect((await beta).status).toBe(200)
    gates.alpha.resolve()
    expect((await alpha).status).toBe(200)
    const reports = info.mock.calls.map(([value]) => JSON.parse(value as string))
    expect(reports).toHaveLength(2)
    for (const [id, reads] of [
      ['alpha', 13],
      ['beta', 21],
    ] as const) {
      expect(reports.find((report) => report.requestId === `request-${id}`)).toMatchObject({
        path: '/synthetic/:privateId',
        databaseUsage: {
          statements: 2,
          measuredStatements: 1,
          unmeasuredStatements: 1,
          rowsRead: reads,
          rowsWritten: 0,
          failedOperations: 0,
        },
      })
    }
    expect(JSON.stringify(reports)).not.toContain('private-query')
    expect(JSON.stringify(reports)).not.toContain('/synthetic/alpha')
    expect(JSON.stringify(reports)).not.toContain('synthetic SQL')
    expect(env.DATABASE_USAGE_OBSERVER).toBe(originalObserver)
    expect(originalObserver).not.toHaveBeenCalled()
  })

  it('keeps background job scopes independent and identifies unmeasured operations', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const env = {} as Bindings
    const first = jobUsage(env, 'first_job')
    const second = jobUsage(env, 'second_job')
    first.env.DATABASE_USAGE_OBSERVER?.({
      operation: 'batch',
      statementCount: 3,
      measuredStatements: 2,
      rowsRead: 17,
      rowsWritten: 4,
      elapsedMs: 1,
      success: true,
    })
    second.env.DATABASE_USAGE_OBSERVER?.({
      operation: 'first',
      statementCount: 1,
      measuredStatements: 0,
      rowsRead: 0,
      rowsWritten: 0,
      elapsedMs: 1,
      success: false,
    })
    second.report()
    first.report()
    const reports = info.mock.calls.map(([value]) => JSON.parse(value as string))
    expect(reports).toEqual([
      expect.objectContaining({
        scope: 'second_job',
        statements: 1,
        measuredStatements: 0,
        unmeasuredStatements: 1,
        rowsRead: 0,
        rowsWritten: 0,
        failedOperations: 1,
      }),
      expect.objectContaining({
        scope: 'first_job',
        statements: 3,
        measuredStatements: 2,
        unmeasuredStatements: 1,
        rowsRead: 17,
        rowsWritten: 4,
        failedOperations: 0,
      }),
    ])
    expect(env.DATABASE_USAGE_OBSERVER).toBeUndefined()
  })

  it('does not replace a job failure when reporting throws', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {
      throw new Error('logging failed')
    })
    const usage = jobUsage({} as Bindings, 'synthetic_job')
    const failure = new Error('persistence failed')
    async function execute() {
      try {
        throw failure
      } finally {
        usage.report()
      }
    }
    await expect(execute()).rejects.toBe(failure)
    expect(() => usage.report()).not.toThrow()
  })
})
