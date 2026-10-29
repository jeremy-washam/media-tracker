import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./tmdb-catalog', () => ({
  processTmdbCatalogRefresh: vi.fn(),
  startTmdbCatalogRefresh: vi.fn(),
}))
vi.mock('./youtube-catalog', () => ({
  processYoutubeCatalogRefresh: vi.fn(),
  startYoutubeCatalogRefresh: vi.fn(),
}))
import worker from './index'
import type { Bindings } from './env'
import { processTmdbCatalogRefresh } from './tmdb-catalog'
import { processYoutubeCatalogRefresh } from './youtube-catalog'
import type { SyncJob } from '@media-tracker/contracts'

const jobId = '01K8QYJ6Q7G6J0Z3VTXYP5CXDD'
beforeEach(() => vi.clearAllMocks())
describe('hosted TMDB queue isolation', () => {
  it('runs the reviewed TMDB job while leaving other jobs and YouTube paused', async () => {
    const env = {
      AUTH_MODE: 'access',
      SYNC_ENABLED: 'true',
      CATALOG_AUTO_REFRESH: 'false',
      TMDB_CATALOG_JOB_ID: jobId,
      TMDB_CATALOG_UNTIL: new Date(Date.now() + 3600_000).toISOString(),
      SYNC_BUDGET_UNTIL: new Date(Date.now() + 7200_000).toISOString(),
    } as Bindings
    const messages = [
      { source: 'tmdb', operation: 'refresh_tmdb_catalog', catalogJobId: jobId },
      { source: 'tmdb', operation: 'refresh_tmdb_catalog', catalogJobId: 'not-reviewed' },
      { source: 'youtube', operation: 'refresh_youtube_catalog', catalogJobId: jobId },
    ].map((body) => ({
      id: body.catalogJobId,
      body: { ...body, idempotencyKey: 'test' },
      ack: vi.fn(),
      retry: vi.fn(),
    }))
    await worker.queue({ messages } as unknown as MessageBatch<SyncJob>, env)
    expect(processTmdbCatalogRefresh).toHaveBeenCalledTimes(1)
    expect(processYoutubeCatalogRefresh).not.toHaveBeenCalled()
    expect(messages[0]!.ack).toHaveBeenCalledOnce()
    for (const message of messages.slice(1)) expect(message.retry).toHaveBeenCalledOnce()
  })
  it('does not let the broad legacy flag bypass a hosted grant', async () => {
    const message = {
      id: 'unreviewed',
      body: {
        source: 'tmdb',
        operation: 'refresh_tmdb_catalog',
        catalogJobId: jobId,
        idempotencyKey: 'test',
      },
      ack: vi.fn(),
      retry: vi.fn(),
    }
    await worker.queue(
      { messages: [message] } as unknown as MessageBatch<SyncJob>,
      {
        AUTH_MODE: 'access',
        SYNC_ENABLED: 'true',
        CATALOG_AUTO_REFRESH: 'true',
      } as Bindings,
    )
    expect(processTmdbCatalogRefresh).not.toHaveBeenCalled()
    expect(message.retry).toHaveBeenCalledOnce()
  })
})
