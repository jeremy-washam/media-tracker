import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Bindings } from './env'
import type { SyncJob } from '@media-tracker/contracts'
vi.mock('./tmdb-catalog', () => ({
  processTmdbCatalogRefresh: vi.fn(),
  startTmdbCatalogRefresh: vi.fn(),
}))
vi.mock('./youtube-catalog', () => ({
  processYoutubeCatalogRefresh: vi.fn(),
  startYoutubeCatalogRefresh: vi.fn(),
}))
vi.mock('./operating-budget', async (original) => ({
  ...(await original<typeof import('./operating-budget')>()),
  operatingWorkAllowed: vi.fn(async () => true),
}))
import worker from './index'
import { processTmdbCatalogRefresh } from './tmdb-catalog'
import { processYoutubeCatalogRefresh } from './youtube-catalog'
import { operatingWorkAllowed } from './operating-budget'
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(operatingWorkAllowed).mockResolvedValue(true)
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
function batch() {
  const messages = [
    { source: 'tmdb', operation: 'refresh_tmdb_catalog', catalogJobId: 'job-one' },
    { source: 'tmdb', operation: 'refresh_tmdb_catalog', catalogJobId: 'job-two' },
    { source: 'youtube', operation: 'refresh_youtube_catalog', catalogJobId: 'job-three' },
  ].map((body) => ({
    id: body.catalogJobId,
    body: { ...body, idempotencyKey: 'synthetic' },
    ack: vi.fn(),
    retry: vi.fn(),
  }))
  return { messages, retryAll: vi.fn() }
}
describe('hosted recurring catalog pause gates', () => {
  it.each(['false', 'true'])(
    'uses permanent feature enablement with catalogs=%s',
    async (enabled) => {
      const work = batch()
      await worker.queue(
        work as unknown as MessageBatch<SyncJob>,
        { AUTH_MODE: 'access', SYNC_ENABLED: 'true', CATALOG_AUTO_REFRESH: enabled } as Bindings,
      )
      expect(processTmdbCatalogRefresh).toHaveBeenCalledTimes(enabled === 'true' ? 2 : 0)
      expect(processYoutubeCatalogRefresh).toHaveBeenCalledTimes(enabled === 'true' ? 1 : 0)
      for (const message of work.messages)
        expect(enabled === 'true' ? message.ack : message.retry).toHaveBeenCalledOnce()
    },
  )
  it('holds all queued work when the shared operating gate closes', async () => {
    vi.mocked(operatingWorkAllowed).mockResolvedValue(false)
    const work = batch()
    await worker.queue(
      work as unknown as MessageBatch<SyncJob>,
      { SYNC_ENABLED: 'true', CATALOG_AUTO_REFRESH: 'true' } as Bindings,
    )
    expect(work.retryAll).toHaveBeenCalledWith({ delaySeconds: 43200 })
    expect(processTmdbCatalogRefresh).not.toHaveBeenCalled()
    expect(processYoutubeCatalogRefresh).not.toHaveBeenCalled()
  })
  it('checks again before the next provider request within a delivery', async () => {
    vi.mocked(operatingWorkAllowed).mockResolvedValueOnce(true).mockResolvedValue(false)
    const provider = vi.fn()
    vi.stubGlobal('fetch', provider)
    vi.mocked(processTmdbCatalogRefresh).mockImplementationOnce(async (env) => {
      await env.SYNC_FETCH!('https://synthetic.invalid')
      throw new Error('must not finish')
    })
    const work = batch()
    work.messages = work.messages.slice(0, 1)
    await worker.queue(
      work as unknown as MessageBatch<SyncJob>,
      { SYNC_ENABLED: 'true', CATALOG_AUTO_REFRESH: 'true' } as Bindings,
    )
    expect(provider).not.toHaveBeenCalled()
    expect(work.messages[0]!.retry).toHaveBeenCalledOnce()
  })
})
