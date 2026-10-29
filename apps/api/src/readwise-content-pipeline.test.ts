import worker from './index'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SyncJob } from '@media-tracker/contracts'
import { acquireReadwiseArticleContent, indexReadwiseArticleContent } from './readwise-content'
import { createArticlesRepository } from './env'
import type { Bindings } from './env'
import { TestBucket, TestDatabase, seedReaderArticle } from './testing/storage'

let database: TestDatabase, bucket: TestBucket, bindings: Bindings, key: string
let jobs: SyncJob[]
const send = vi.fn(async (job: SyncJob) => {
  jobs.push(job)
})
const html = `<p>${'quasar '.repeat(11000)}</p>`
beforeEach(() => {
  database = new TestDatabase()
  bucket = new TestBucket()
  jobs = []
  send.mockReset()
  send.mockImplementation(async (job) => {
    jobs.push(job)
  })
  key = seedReaderArticle(database).key
  bindings = {
    DB: database,
    RAW_BUCKET: bucket,
    READWISE_TOKEN: 'synthetic',
    SYNC_QUEUE: { send },
  } as unknown as Bindings
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({ results: [{ id: 'doc-1', category: 'article', html_content: html }] }),
    ),
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  database.sqlite.close()
})
async function acquire() {
  await acquireReadwiseArticleContent(bindings, {
    source: 'readwise',
    operation: 'acquire_article_content',
    connectionId: 'readwise-1',
    documentId: 'doc-1',
    idempotencyKey: key,
  })
  return jobs.shift()!
}
function state() {
  return database.sqlite.prepare('SELECT state FROM article_content_manifests').get()
}
async function finish(job: SyncJob) {
  await indexReadwiseArticleContent(bindings, job)
  while (jobs.length) await indexReadwiseArticleContent(bindings, jobs.shift()!)
}

describe('Reader acquisition and queued indexing', () => {
  it('publishes search content only after every chunk commits and safely replays old deliveries', async () => {
    const first = await acquire()
    expect(state()).toEqual({ state: 'pending' })
    await indexReadwiseArticleContent(bindings, first)
    expect(state()).toEqual({ state: 'pending' })
    expect(database.sqlite.prepare('SELECT COUNT(*) n FROM article_content_chunks').get()).toEqual({
      n: 12,
    })
    const repository = createArticlesRepository(bindings.DB)
    expect(await repository.findArticleTextExcerptTarget('article-1', 'quasar')).toBeNull()
    const next = jobs.shift()!
    await indexReadwiseArticleContent(bindings, first)
    jobs = []
    await finish(next)
    expect(state()).toEqual({ state: 'ready' })
    expect(await repository.findArticleTextExcerptTarget('article-1', 'quasar')).not.toBeNull()
    const count = database.sqlite.prepare('SELECT COUNT(*) n FROM article_content_chunks').get()
    await finish(first)
    expect(database.sqlite.prepare('SELECT COUNT(*) n FROM article_content_chunks').get()).toEqual(
      count,
    )
    expect(database.sqlite.prepare('SELECT status FROM article_content_jobs').get()).toEqual({
      status: 'completed',
    })
  })
  it.each(['chunk', 'enqueue', 'finalize'] as const)(
    'recovers after %s interruption without publishing partial content',
    async (stage) => {
      const first = await acquire()
      if (stage === 'chunk') database.failNext = /INSERT INTO article_content_search_map/
      if (stage === 'enqueue') send.mockRejectedValueOnce(new Error('Synthetic Queue interruption'))
      if (stage === 'finalize') {
        await indexReadwiseArticleContent(bindings, first)
        const next = jobs.shift()!
        database.failNext = /UPDATE article_content_manifests SET/
        await expect(indexReadwiseArticleContent(bindings, next)).rejects.toThrow(
          'Synthetic database interruption',
        )
        expect(state()).toEqual({ state: 'pending' })
        await finish(next)
      } else {
        await expect(indexReadwiseArticleContent(bindings, first)).rejects.toThrow('Synthetic')
        expect(state()).toEqual({ state: 'pending' })
        await finish(first)
      }
      expect(state()).toEqual({ state: 'ready' })
      const counts = database.sqlite
        .prepare(
          'SELECT COUNT(*) n,COUNT(DISTINCT ordinal) unique_ordinals FROM article_content_chunks',
        )
        .get()
      expect(counts?.n).toBe(counts?.unique_ordinals)
    },
  )
  it('retains a staged manifest when extracted R2 text is temporarily unavailable', async () => {
    const first = await acquire()
    const textEntry = [...bucket.objects.entries()].find(([name]) =>
      name.startsWith('content/readwise/text/'),
    )!
    bucket.objects.delete(textEntry[0])
    await expect(indexReadwiseArticleContent(bindings, first)).rejects.toThrow('missing')
    expect(state()).toEqual({ state: 'pending' })
    bucket.objects.set(...textEntry)
    await finish(first)
    expect(state()).toEqual({ state: 'ready' })
  })
  it('retries acquisition after its initial indexing enqueue fails and retains both attempts', async () => {
    send.mockRejectedValueOnce(new Error('Synthetic Queue interruption'))
    await expect(acquire()).rejects.toThrow('Synthetic Queue interruption')
    expect(state()).toEqual({ state: 'pending' })
    await finish(await acquire())
    expect(state()).toEqual({ state: 'ready' })
    expect(
      database.sqlite.prepare('SELECT COUNT(*) n FROM article_content_raw_acquisitions').get(),
    ).toEqual({ n: 2 })
  })
})

it('keeps delayed old-source indexing from replacing newer content', async () => {
  const old = await acquire()
  const manifestId = old.manifestId!
  database.sqlite
    .prepare('UPDATE readwise_documents SET updated_at_source=?')
    .run('2026-10-01T00:00:00.000Z')
  await finish(old)
  expect(
    database.sqlite
      .prepare('SELECT state FROM article_content_manifests WHERE id=?')
      .get(manifestId),
  ).toEqual({ state: 'expired' })
  expect(
    await createArticlesRepository(bindings.DB).findArticleTextExcerptTarget('article-1', 'quasar'),
  ).toBeNull()
})

it.each([-1, 1000000])(
  'rejects an invalid indexing ordinal %s without promoting content',
  async (nextOrdinal) => {
    const first = await acquire()
    await expect(indexReadwiseArticleContent(bindings, { ...first, nextOrdinal })).rejects.toThrow(
      'ordinal',
    )
    expect(state()).toEqual({ state: 'pending' })
  },
)

it('does not publish a last batch delivered before its earlier chunk range', async () => {
  const first = await acquire()
  await expect(
    indexReadwiseArticleContent(bindings, { ...first, nextOrdinal: 12 }),
  ).rejects.toThrow('chunk range is incomplete')
  expect(state()).toEqual({ state: 'pending' })
  await finish(first)
  expect(state()).toEqual({ state: 'ready' })
})

it('resumes indexing after the real Worker records a failed content delivery', async () => {
  const first = await acquire()
  const delivery = (body: SyncJob) => ({ id: 'synthetic', body, ack: vi.fn(), retry: vi.fn() })
  database.failNext = /INSERT INTO article_content_search_map/
  const failed = delivery(first)
  await worker.queue({ messages: [failed] } as unknown as MessageBatch<SyncJob>, bindings)
  expect(failed.retry).toHaveBeenCalledOnce()
  expect(state()).toEqual({ state: 'failed' })
  const retry = delivery(first)
  await worker.queue({ messages: [retry] } as unknown as MessageBatch<SyncJob>, bindings)
  expect(retry.ack).toHaveBeenCalledOnce()
  expect(retry.retry).not.toHaveBeenCalled()
  while (jobs.length) {
    const continuation = delivery(jobs.shift()!)
    await worker.queue({ messages: [continuation] } as unknown as MessageBatch<SyncJob>, bindings)
    expect(continuation.ack).toHaveBeenCalledOnce()
  }
  expect(state()).toEqual({ state: 'ready' })
  expect(database.sqlite.prepare('SELECT status FROM article_content_jobs').get()).toEqual({
    status: 'completed',
  })
})
