import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from './index'
import type { Bindings } from './env'

const controls = vi.hoisted(() => ({ failReadwise: false, environments: [] as unknown[] }))

function observation(env: Bindings, reads: number, success = true) {
  controls.environments.push(env)
  env.DATABASE_USAGE_OBSERVER?.({
    operation: 'batch',
    statementCount: 2,
    measuredStatements: 2,
    rowsRead: reads,
    rowsWritten: 1,
    elapsedMs: 1,
    success,
  })
}

vi.mock('./letterboxd-rss-sync', () => ({
  syncLetterboxdRss: vi.fn(async (env: Bindings) => {
    observation(env, 11)
    return { syncRunId: 'synthetic', unchanged: false, feedEntries: 1, unresolvedRecords: 0 }
  }),
}))
vi.mock('./readwise-sync', () => ({
  syncReadwiseArchive: vi.fn(async (env: Bindings) => {
    observation(env, 23, !controls.failReadwise)
    if (controls.failReadwise) throw new Error('synthetic provider failure')
    return { syncRunId: 'synthetic', pages: 1, archiveItems: 1 }
  }),
}))
vi.mock('./spotify-catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./spotify-catalog')>()),
  resumeSpotifyCatalogBackfill: vi.fn(async (env: Bindings) => {
    observation(env, 37)
  }),
}))

beforeEach(() => {
  controls.failReadwise = false
  controls.environments = []
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('scheduled provider usage attribution', () => {
  it.each([false, true])(
    'isolates provider totals and reports failures with failed=%s',
    async (failed) => {
      controls.failReadwise = failed
      const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const fetch = vi.fn(async () => {
        throw new Error('real provider requests forbidden')
      })
      vi.stubGlobal('fetch', fetch)
      const originalObserver = vi.fn()
      const env = {
        SYNC_ENABLED: 'true',
        LETTERBOXD_USERNAME: 'synthetic',
        READWISE_TOKEN: 'synthetic',
        DATABASE_USAGE_OBSERVER: originalObserver,
      } as unknown as Bindings
      const pending: Promise<unknown>[] = []
      worker.scheduled({ cron: '0 * * * *' } as ScheduledController, env, {
        waitUntil: (promise: Promise<unknown>) => pending.push(promise),
      } as unknown as ExecutionContext)
      await Promise.all(pending)
      const reports = info.mock.calls
        .map(([value]) => JSON.parse(value as string))
        .filter((entry) => entry.event === 'job.database_usage')
      expect(reports).toEqual([
        expect.objectContaining({
          scope: 'sync_letterboxd',
          rowsRead: 11,
          rowsWritten: 1,
          failedOperations: 0,
        }),
        expect.objectContaining({
          scope: 'sync_readwise',
          rowsRead: 23,
          rowsWritten: 1,
          failedOperations: failed ? 1 : 0,
        }),
        expect.objectContaining({
          scope: 'scheduled_spotify_catalog',
          rowsRead: 37,
          rowsWritten: 1,
          failedOperations: 0,
        }),
      ])
      expect(controls.environments).toHaveLength(3)
      expect(new Set(controls.environments).size).toBe(3)
      expect(controls.environments).not.toContain(env)
      expect(env.DATABASE_USAGE_OBSERVER).toBe(originalObserver)
      expect(originalObserver).not.toHaveBeenCalled()
      expect(fetch).not.toHaveBeenCalled()
      expect(pending).toHaveLength(1)
    },
  )
})
