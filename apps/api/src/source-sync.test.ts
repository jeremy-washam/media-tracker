import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SqlSourceSyncAdmission } from '@media-tracker/db'
import app from './app'
import worker from './index'
import type { Bindings } from './env'
import { runSourceSync, sourceSyncAllowed } from './source-sync'
import { syncReadwiseArchive } from './readwise-sync'
import type { SyncJob } from '@media-tracker/contracts'

vi.mock('./readwise-sync', async (original) => ({
  ...(await original<typeof import('./readwise-sync')>()),
  syncReadwiseArchive: vi.fn(async () => ({
    syncRunId: 'synthetic',
    pages: 1,
    sourceRecords: 1,
    archiveItems: 1,
  })),
}))

beforeEach(() => {
  vi.spyOn(SqlSourceSyncAdmission.prototype, 'withinAllowance').mockResolvedValue(true)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const hosted = () =>
  ({
    AUTH_MODE: 'access',
    DB: {
      prepare: () => ({
        all: async () => ({ meta: { size_after: 1_000_000 }, success: true, results: [] }),
      }),
    },
    SYNC_ENABLED: 'true',
    SYNC_SOURCES: 'readwise',
    SYNC_BUDGET_UNTIL: new Date(Date.now() + 3600_000).toISOString(),
  }) as unknown as Bindings

describe('source sync entry points', () => {
  it.each([undefined, 0, Number.NaN, 3_000_000_000])(
    'defers provider work when native storage size is %s',
    async (size) => {
      const operation = vi.fn()
      const env = hosted()
      env.DB = {
        prepare: () => ({ all: async () => ({ meta: { size_after: size } }) }),
      } as unknown as D1Database
      await expect(runSourceSync(env, 'readwise', operation)).rejects.toThrow('storage headroom')
      expect(operation).not.toHaveBeenCalled()
    },
  )
  it('defers before provider work when the lifetime allocation is exhausted', async () => {
    vi.mocked(SqlSourceSyncAdmission.prototype.withinAllowance).mockResolvedValue(false)
    vi.spyOn(SqlSourceSyncAdmission.prototype, 'acquire').mockResolvedValue(true)
    const release = vi.spyOn(SqlSourceSyncAdmission.prototype, 'release').mockResolvedValue()
    const operation = vi.fn()
    await expect(runSourceSync(hosted(), 'readwise', operation)).rejects.toThrow(
      'usage is exhausted',
    )
    expect(operation).not.toHaveBeenCalled()
    expect(release).toHaveBeenCalledOnce()
  })

  it('uses only the remainder of a failed reservation for one explicit retry', async () => {
    vi.spyOn(SqlSourceSyncAdmission.prototype, 'acquire').mockResolvedValue(true)
    vi.spyOn(SqlSourceSyncAdmission.prototype, 'reserve').mockResolvedValue(false)
    vi.spyOn(SqlSourceSyncAdmission.prototype, 'retryable').mockResolvedValue({
      started_at: Date.now() - 60_000,
      reservation_json: JSON.stringify({ requests: 2, pages: 1, records: 50, bytes: 1024 }),
      usage_json: JSON.stringify({ requests: 1, pages: 0, records: 0, bytes: 20, rowsWritten: 6 }),
    })
    vi.spyOn(SqlSourceSyncAdmission.prototype, 'claimRetry').mockResolvedValue(true)
    const finish = vi.spyOn(SqlSourceSyncAdmission.prototype, 'finish').mockResolvedValue()
    vi.spyOn(SqlSourceSyncAdmission.prototype, 'release').mockResolvedValue()
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    await runSourceSync({ ...hosted(), SYNC_RETRY_SOURCE: 'readwise' }, 'readwise', async (env) => {
      expect(env.SYNC_BUDGET?.limits).toEqual({ requests: 1, pages: 1, records: 50, bytes: 1004 })
      env.SYNC_BUDGET?.page(3)
    })
    expect(JSON.parse(finish.mock.calls[0]![4])).toMatchObject({
      requests: 1,
      pages: 1,
      records: 3,
      bytes: 20,
      rowsWritten: 6,
    })
  })
  it('records partial provider results as an unsuccessful admission', async () => {
    vi.spyOn(SqlSourceSyncAdmission.prototype, 'acquire').mockResolvedValue(true)
    vi.spyOn(SqlSourceSyncAdmission.prototype, 'reserve').mockResolvedValue(true)
    const finish = vi.spyOn(SqlSourceSyncAdmission.prototype, 'finish').mockResolvedValue()
    vi.spyOn(SqlSourceSyncAdmission.prototype, 'release').mockResolvedValue()
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    await runSourceSync(hosted(), 'readwise', async () => ({
      partialFailures: ['synthetic_surface'],
    }))
    expect(finish.mock.calls[0]?.[3]).toBe('failed')
  })
  it.each(['admitted', 'daily_limit', 'busy'] as const)(
    'handles queued source work with %s admission',
    async (mode) => {
      vi.mocked(syncReadwiseArchive).mockClear()
      vi.spyOn(SqlSourceSyncAdmission.prototype, 'acquire').mockResolvedValue(mode !== 'busy')
      vi.spyOn(SqlSourceSyncAdmission.prototype, 'reserve').mockResolvedValue(
        mode !== 'daily_limit',
      )
      vi.spyOn(SqlSourceSyncAdmission.prototype, 'finish').mockResolvedValue()
      vi.spyOn(SqlSourceSyncAdmission.prototype, 'release').mockResolvedValue()
      vi.spyOn(console, 'info').mockImplementation(() => undefined)
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const ack = vi.fn(),
        retry = vi.fn()
      const body: SyncJob = {
        operation: 'sync_source',
        source: 'readwise',
        idempotencyKey: 'synthetic',
      }
      await worker.queue(
        { messages: [{ body, id: 'synthetic', ack, retry }] } as unknown as MessageBatch<SyncJob>,
        hosted(),
      )
      expect(syncReadwiseArchive).toHaveBeenCalledTimes(mode === 'admitted' ? 1 : 0)
      expect(ack).toHaveBeenCalledTimes(mode === 'busy' ? 0 : 1)
      expect(retry).toHaveBeenCalledTimes(mode === 'busy' ? 1 : 0)
    },
  )

  it('dispatches source jobs without running providers inside cron', async () => {
    vi.spyOn(SqlSourceSyncAdmission.prototype, 'available').mockResolvedValue(true)
    const sendBatch = vi.fn().mockResolvedValue(undefined)
    const pending: Promise<unknown>[] = []
    worker.scheduled(
      { cron: '0 * * * *' } as ScheduledController,
      { ...hosted(), SYNC_QUEUE: { sendBatch } } as unknown as Bindings,
      {
        waitUntil: (promise: Promise<unknown>) => pending.push(promise),
      } as unknown as ExecutionContext,
    )
    await Promise.all(pending)
    expect(sendBatch).toHaveBeenCalledWith([
      { body: expect.objectContaining({ source: 'readwise', operation: 'sync_source' }) },
    ])
  })
  it('fails closed for missing, expired or unrelated grants before touching providers or storage', async () => {
    const operation = vi.fn()
    const env = hosted()
    expect(sourceSyncAllowed(env, 'readwise')).toBe(true)
    expect(sourceSyncAllowed(env, 'spotify')).toBe(false)
    await expect(runSourceSync(env, 'spotify', operation)).rejects.toThrow('paused')
    env.SYNC_BUDGET_UNTIL = new Date(Date.now() - 1000).toISOString()
    await expect(runSourceSync(env, 'readwise', operation)).rejects.toThrow('expired')
    const response = await app.request('/api/connections/readwise/sync', { method: 'POST' }, env)
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ error: { code: 'SERVICE_UNAVAILABLE' } })
    expect(operation).not.toHaveBeenCalled()
  })

  it('persists actual aggregate usage and releases a failed attempt without logging private data', async () => {
    const acquire = vi.spyOn(SqlSourceSyncAdmission.prototype, 'acquire').mockResolvedValue(true)
    const reserve = vi.spyOn(SqlSourceSyncAdmission.prototype, 'reserve').mockResolvedValue(true)
    const finish = vi.spyOn(SqlSourceSyncAdmission.prototype, 'finish').mockResolvedValue()
    const release = vi.spyOn(SqlSourceSyncAdmission.prototype, 'release').mockResolvedValue()
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const env = hosted()
    await expect(
      runSourceSync(env, 'readwise', async (guarded) => {
        expect(guarded.SYNC_BUDGET).toBeDefined()
        expect(guarded.SYNC_FETCH).toBe(guarded.SYNC_BUDGET?.fetch)
        guarded.SYNC_BUDGET!.page(3)
        guarded.DATABASE_USAGE_OBSERVER!({
          operation: 'run',
          statementCount: 1,
          measuredStatements: 1,
          rowsRead: 3,
          rowsWritten: 5,
          elapsedMs: 1,
          success: true,
        })
        throw new Error('synthetic failure')
      }),
    ).rejects.toThrow('synthetic failure')
    expect(acquire).toHaveBeenCalledOnce()
    expect(reserve.mock.calls[0]?.[2]).toContain('requests')
    expect(finish.mock.calls[0]?.[3]).toBe('failed')
    expect(JSON.parse(finish.mock.calls[0]![4])).toMatchObject({
      pages: 1,
      records: 3,
      rowsRead: 3,
      rowsWritten: 5,
    })
    expect(release).toHaveBeenCalledOnce()
    expect(env.SYNC_BUDGET).toBeUndefined()
  })

  it('stops cron from resuming disabled Spotify catalog backlogs', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('provider forbidden'))
    vi.stubGlobal('fetch', fetcher)
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const pending: Promise<unknown>[] = []
    worker.scheduled(
      { cron: '0 * * * *' } as ScheduledController,
      { ...hosted(), SYNC_SOURCES: '', SPOTIFY_CATALOG_ENABLED: 'false' },
      {
        waitUntil: (promise: Promise<unknown>) => pending.push(promise),
      } as unknown as ExecutionContext,
    )
    await Promise.all(pending)
    expect(fetcher).not.toHaveBeenCalled()
    expect(pending).toHaveLength(1)
  })
})
