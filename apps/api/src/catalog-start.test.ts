import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Bindings } from './env'
const mocks = vi.hoisted(() => ({ active: vi.fn(), create: vi.fn(), send: vi.fn() }))
vi.mock('./env', () => ({
  createCatalogJobsRepository: () => ({ findActive: mocks.active, create: mocks.create }),
}))
import { startTmdbCatalogRefresh } from './tmdb-catalog'
import { startYoutubeCatalogRefresh } from './youtube-catalog'
const at = '2026-10-29T12:00:00.000Z'
const env = {
  TMDB_API_READ_TOKEN: 'synthetic',
  YOUTUBE_API_KEY: 'synthetic',
  SYNC_QUEUE: { send: mocks.send },
} as unknown as Bindings
beforeEach(() => {
  vi.clearAllMocks()
  mocks.active.mockResolvedValue(null)
})
describe.each(['tmdb', 'youtube'] as const)('%s daily durable catalog admission', (provider) => {
  const start = provider === 'tmdb' ? startTmdbCatalogRefresh : startYoutubeCatalogRefresh
  it.each(['failed', 'succeeded'])(
    'reuses its %s daily job without enqueueing a new scan',
    async (state) => {
      mocks.create.mockResolvedValue({ id: `catalog:${provider}:2026-10-29`, state })
      await start(env, at)
      await start(env, at)
      expect(mocks.create).toHaveBeenCalledWith(`catalog:${provider}:2026-10-29`, provider, at)
      expect(mocks.send).not.toHaveBeenCalled()
    },
  )
  it('resumes the durable cursor rather than creating another job', async () => {
    mocks.active.mockResolvedValue({ id: 'existing', cursor: 'media-100', state: 'pending' })
    await start(env, at)
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ catalogJobId: 'existing', catalogCursor: 'media-100' }),
    )
  })
})
