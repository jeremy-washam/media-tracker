import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { YoutubeApiError } from '@media-tracker/connector-youtube'
import { ZodError } from 'zod'
import type { Bindings } from './env'
const mocks = vi.hoisted(() => ({
  acquire: vi.fn(),
  index: vi.fn(),
  youtube: vi.fn(),
  tmdb: vi.fn(),
  spotify: vi.fn(),
  failContent: vi.fn(),
}))
vi.mock('./readwise-content', () => ({
  acquireReadwiseArticleContent: mocks.acquire,
  indexReadwiseArticleContent: mocks.index,
}))
vi.mock('./youtube-catalog', () => ({
  processYoutubeCatalogRefresh: mocks.youtube,
  startYoutubeCatalogRefresh: vi.fn(),
}))
vi.mock('./tmdb-catalog', () => ({
  processTmdbCatalogRefresh: mocks.tmdb,
  startTmdbCatalogRefresh: vi.fn(),
}))
vi.mock('./spotify-catalog', () => ({
  processSpotifyCatalogBackfill: mocks.spotify,
  resumeSpotifyCatalogBackfill: vi.fn(),
  startSpotifyCatalogBackfill: vi.fn(),
  spotifyCatalogJobStatus: vi.fn(),
}))
vi.mock('./env', async (original) => ({
  ...(await original<typeof import('./env')>()),
  createArticlesRepository: () => ({ failContentJob: mocks.failContent }),
}))
import worker from './index'
import { CatalogRetryError } from './catalog-retry'
const jobs = [
  {
    operation: 'acquire_article_content',
    source: 'readwise',
    connectionId: 'connection',
    documentId: 'document',
  },
  {
    operation: 'index_article_content',
    source: 'readwise',
    manifestId: 'manifest',
    nextOrdinal: 0,
  },
  { operation: 'refresh_youtube_catalog', source: 'youtube', catalogJobId: 'catalog' },
  { operation: 'refresh_tmdb_catalog', source: 'tmdb', catalogJobId: 'catalog' },
  { operation: 'refresh_spotify_catalog', source: 'spotify', catalogJobId: 'catalog' },
]
function delivery(body: unknown) {
  return { id: 'synthetic-message', body, ack: vi.fn(), retry: vi.fn() }
}
async function consume(messages: ReturnType<typeof delivery>[]) {
  await worker.queue({ messages } as unknown as MessageBatch<never>, {} as Bindings)
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => vi.restoreAllMocks())
describe('Worker queue delivery outcomes', () => {
  it.each(jobs)('dispatches $operation and acknowledges success', async (body) => {
    const message = delivery({ ...body, idempotencyKey: 'synthetic' })
    await consume([message])
    expect(message.ack).toHaveBeenCalledOnce()
    expect(message.retry).not.toHaveBeenCalled()
    const handler = [mocks.acquire, mocks.index, mocks.youtube, mocks.tmdb, mocks.spotify][
      jobs.indexOf(body)
    ]!
    expect(handler).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ operation: body.operation }),
    )
  })
  it('drops invalid messages but continues later valid deliveries', async () => {
    const invalid = delivery({ operation: 'invalid' }),
      valid = delivery({ ...jobs[2], idempotencyKey: 'synthetic' })
    await consume([invalid, valid])
    expect(invalid.ack).toHaveBeenCalledOnce()
    expect(valid.ack).toHaveBeenCalledOnce()
    expect(mocks.youtube).toHaveBeenCalledOnce()
  })
  it.each([
    new CatalogRetryError(900),
    new TypeError('network reset'),
    new Error('D1 unavailable'),
  ])('retries transient catalog failures: %s', async (error) => {
    mocks.youtube.mockRejectedValueOnce(error)
    const message = delivery({ ...jobs[2], idempotencyKey: 'synthetic' })
    await consume([message])
    expect(message.retry).toHaveBeenCalledWith({
      delaySeconds: error instanceof CatalogRetryError ? 900 : 60,
    })
    expect(message.ack).not.toHaveBeenCalled()
  })
  it.each([new YoutubeApiError(403, null), new ZodError([])])(
    'acknowledges terminal catalog failures after recording them: %s',
    async (error) => {
      mocks.youtube.mockRejectedValueOnce(error)
      const message = delivery({ ...jobs[2], idempotencyKey: 'synthetic' })
      await consume([message])
      expect(message.ack).toHaveBeenCalledOnce()
      expect(message.retry).not.toHaveBeenCalled()
    },
  )
  it('retries failed content even if failure bookkeeping also fails, then handles the next message', async () => {
    mocks.acquire.mockRejectedValueOnce(new Error('R2 unavailable'))
    mocks.failContent.mockRejectedValueOnce(new Error('D1 unavailable'))
    const failed = delivery({ ...jobs[0], idempotencyKey: 'content' }),
      next = delivery({ ...jobs[2], idempotencyKey: 'catalog' })
    await consume([failed, next])
    expect(failed.retry).toHaveBeenCalledOnce()
    expect(next.ack).toHaveBeenCalledOnce()
  })
})

it('preserves a Spotify job lease/backoff delay at the queue boundary', async () => {
  mocks.spotify.mockRejectedValueOnce(new CatalogRetryError(900))
  const message = delivery({ ...jobs[4], idempotencyKey: 'spotify' })
  await consume([message])
  expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 900 })
  expect(message.ack).not.toHaveBeenCalled()
})
