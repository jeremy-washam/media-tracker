import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Bindings } from './env'
const mocks = vi.hoisted(() => ({ tmdb: vi.fn(), youtube: vi.fn(), spotify: vi.fn() }))
vi.mock('./tmdb-catalog', () => ({
  startTmdbCatalogRefresh: mocks.tmdb,
  processTmdbCatalogRefresh: vi.fn(),
}))
vi.mock('./youtube-catalog', () => ({
  startYoutubeCatalogRefresh: mocks.youtube,
  processYoutubeCatalogRefresh: vi.fn(),
}))
vi.mock('./spotify-catalog', () => ({
  resumeSpotifyCatalogBackfill: mocks.spotify,
  processSpotifyCatalogBackfill: vi.fn(),
  startSpotifyCatalogBackfill: vi.fn(),
  spotifyCatalogJobStatus: vi.fn(),
}))
import worker from './index'
beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => vi.restoreAllMocks())
it.each(['tmdb', 'youtube'] as const)(
  'continues scheduled catalog work after %s dispatch fails',
  async (failing) => {
    mocks[failing].mockRejectedValueOnce(new Error('Synthetic Queue failure'))
    const pending: Promise<unknown>[] = []
    worker.scheduled(
      { cron: '0 * * * *' } as ScheduledController,
      {
        CATALOG_AUTO_REFRESH: 'true',
        TMDB_API_READ_TOKEN: 'synthetic',
        YOUTUBE_API_KEY: 'synthetic',
      } as Bindings,
      {
        waitUntil: (promise: Promise<unknown>) => pending.push(promise),
      } as unknown as ExecutionContext,
    )
    await Promise.all(pending)
    expect(mocks.tmdb).toHaveBeenCalledOnce()
    expect(mocks.youtube).toHaveBeenCalledOnce()
    expect(mocks.spotify).toHaveBeenCalledOnce()
  },
)
