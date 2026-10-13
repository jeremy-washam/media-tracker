import { afterEach, describe, expect, it, vi } from 'vitest'
import { SqlVideosRepository } from '@media-tracker/db'
import worker from './index'
import { MAINTENANCE_CRON, MAINTENANCE_ROW_LIMIT } from './catalog-maintenance'
import type { Bindings } from './env'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
describe('cache maintenance scheduling', () => {
  it.each(['false', 'true'])(
    'cleans caches without provider requests with SYNC_ENABLED=%s',
    async (sync) => {
      vi.spyOn(console, 'info').mockImplementation(() => undefined)
      const clean = vi
        .spyOn(SqlVideosRepository.prototype, 'maintainYoutubeCatalog')
        .mockResolvedValue({ deletedRows: 4, deletedByTable: { synthetic: 4 }, hasMore: false })
      const fetch = vi.fn(async () => {
        throw new Error('provider fetch must not run')
      })
      vi.stubGlobal('fetch', fetch)
      const tasks: Promise<unknown>[] = []
      const context = {
        waitUntil: (promise: Promise<unknown>) => tasks.push(promise),
      } as unknown as ExecutionContext
      const env = {
        SYNC_ENABLED: sync,
        MAINTENANCE_ENABLED: 'true',
        READWISE_TOKEN: 'synthetic',
        HARDCOVER_TOKEN: 'synthetic',
        LETTERBOXD_USERNAME: 'synthetic',
        SPOTIFY_CLIENT_ID: 'synthetic',
        SPOTIFY_REFRESH_TOKEN: 'synthetic',
        CATALOG_AUTO_REFRESH: 'true',
        YOUTUBE_API_KEY: 'synthetic',
      } as Bindings
      worker.scheduled({ cron: MAINTENANCE_CRON } as ScheduledController, env, context)
      await Promise.all(tasks)
      expect(tasks).toHaveLength(1)
      expect(clean).toHaveBeenCalledWith(expect.any(String), MAINTENANCE_ROW_LIMIT)
      expect(fetch).not.toHaveBeenCalled()
      expect(env.DATABASE_USAGE_OBSERVER).toBeUndefined()
    },
  )
  it('does not run maintenance when explicitly disabled', () => {
    const waitUntil = vi.fn()
    worker.scheduled(
      { cron: MAINTENANCE_CRON } as ScheduledController,
      { SYNC_ENABLED: 'false', MAINTENANCE_ENABLED: 'false' } as Bindings,
      { waitUntil } as unknown as ExecutionContext,
    )
    expect(waitUntil).not.toHaveBeenCalled()
  })
})
