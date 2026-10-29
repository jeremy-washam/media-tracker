import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  BooksResponseSchema,
  MoviesResponseSchema,
  ArticlesResponseSchema,
  PodcastsResponseSchema,
  MusicResponseSchema,
  VideosResponseSchema,
} from '../../packages/contracts/src/index'
import {
  createWorkerRuntime,
  spotifyArchive,
  youtubeArchive,
  type WorkerRuntime,
} from '../support/worker-runtime'
import {
  D1DatabaseClient,
  SqlCatalogJobsRepository,
  fenceCatalogDatabase,
  CatalogLeaseLostError,
} from '../../packages/db/src/index'

let runtime: WorkerRuntime
beforeAll(async () => {
  runtime = await createWorkerRuntime()
})
afterAll(async () => {
  await runtime?.dispose()
})

describe('compiled Worker with real local bindings', () => {
  it('serves contract-valid nonempty collections across all six media families', async () => {
    for (const [path, schema] of [
      ['/api/library/books', BooksResponseSchema],
      ['/api/library/movies', MoviesResponseSchema],
      ['/api/library/articles', ArticlesResponseSchema],
      ['/api/library/podcasts', PodcastsResponseSchema],
      ['/api/library/music', MusicResponseSchema],
      ['/api/library/videos', VideosResponseSchema],
    ] as const) {
      const value = schema.parse(await (await runtime.api(path)).json())
      expect(value.data.length, path).toBeGreaterThan(0)
      const filtered = schema.parse(
        await (await runtime.api(`${path}?q=doesnotexistinanyfixture`)).json(),
      )
      expect(filtered.data, path).toEqual([])
    }
  })

  it('filters before paginating and rejects a cursor reused for another query', async () => {
    const ids: string[] = []
    let cursor: string | null = null
    do {
      const params = new URLSearchParams({ limit: '1', sort: 'title', q: 'Runtime Video' })
      if (cursor) params.set('cursor', cursor)
      const page = VideosResponseSchema.parse(
        await (await runtime.api(`/api/library/videos?${params}`)).json(),
      )
      ids.push(...page.data.map((item) => item.id))
      if (cursor === null && page.nextCursor) {
        const changed = new URLSearchParams({
          limit: '1',
          sort: 'title',
          q: 'changed',
          cursor: page.nextCursor,
        })
        const rejected = await runtime.mf.dispatchFetch(
          new URL(`/api/library/videos?${changed}`, runtime.url),
        )
        expect(rejected.status).toBe(400)
        await rejected.arrayBuffer()
      }
      cursor = page.nextCursor
    } while (cursor)
    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(3)
  })

  it('retains exact imported bytes, source evidence and foreign-key integrity', async () => {
    const row = await runtime.database
      .prepare(
        "SELECT r.storage_key,r.sha256 FROM raw_objects r JOIN connections c ON c.id=r.connection_id WHERE c.source='spotify' AND r.kind='export' LIMIT 1",
      )
      .first<{ storage_key: string; sha256: string }>()
    expect(row).not.toBeNull()
    const bucket = await runtime.mf.getR2Bucket('RAW_BUCKET')
    const object = await bucket.get(row!.storage_key)
    expect(object).not.toBeNull()
    const uploaded = Buffer.from(spotifyArchive())
    const stored = Buffer.from(await object!.arrayBuffer())
    expect(stored).toEqual(uploaded)
    expect(createHash('sha256').update(uploaded).digest('hex')).toBe(row!.sha256)
    const evidence = await runtime.database
      .prepare('SELECT COUNT(*) count FROM archive_entry_evidence')
      .first<{ count: number }>()
    expect(evidence!.count).toBeGreaterThan(0)
    expect((await runtime.database.prepare('PRAGMA foreign_key_check').all()).results).toEqual([])
  })

  it('makes a repeated source import idempotent through the HTTP route', async () => {
    const counts = async () =>
      runtime.database
        .prepare(
          'SELECT (SELECT COUNT(*) FROM archive_entries) archive,(SELECT COUNT(*) FROM source_records) records',
        )
        .first()
    const before = await counts()
    const response = await runtime.api('/api/connections/spotify/import', {
      method: 'POST',
      body: spotifyArchive(),
    })
    expect(await response.json()).toMatchObject({ alreadyImported: true, completed: true })
    expect(await counts()).toEqual(before)
  })

  it('resumes a partial import from durable R2/D1 state without duplicating records', async () => {
    const path = '/api/connections/youtube/import?connectionKey=resume&connectionLabel=Resume'
    const first = (await (
      await runtime.api(path, { method: 'POST', body: youtubeArchive(105) })
    ).json()) as {
      completed: boolean
      nextOffset: number
      importId: string
    }
    expect(first.completed).toBe(false)
    expect(first.nextOffset).toBe(100)
    const connection = await runtime.database
      .prepare("SELECT id FROM connections WHERE source='youtube' AND label='Resume'")
      .first<{ id: string }>()
    const continuation = `/api/connections/youtube/import/${first.importId}/continue?connectionId=${connection!.id}`
    expect(await (await runtime.api(continuation, { method: 'POST' })).json()).toMatchObject({
      completed: true,
    })
    const count = async () =>
      runtime.database
        .prepare('SELECT COUNT(*) count FROM archive_entries WHERE connection_id=?')
        .bind(connection!.id)
        .first<{ count: number }>()
    expect((await count())!.count).toBe(105)
    await runtime.api(continuation, { method: 'POST' })
    expect((await count())!.count).toBe(105)
  })

  it('rolls back a failed native D1 batch instead of committing its earlier write', async () => {
    await runtime.database.prepare('CREATE TABLE runtime_atomicity(id TEXT PRIMARY KEY)').run()
    await runtime.database.prepare("INSERT INTO runtime_atomicity VALUES('existing')").run()
    await expect(
      runtime.database.batch([
        runtime.database.prepare("INSERT INTO runtime_atomicity VALUES('must-rollback')"),
        runtime.database.prepare("INSERT INTO runtime_atomicity VALUES('existing')"),
      ]),
    ).rejects.toThrow()
    expect(
      (await runtime.database.prepare('SELECT id FROM runtime_atomicity').all()).results,
    ).toEqual([{ id: 'existing' }])
  })

  it('atomically fences stale publication against real D1 constraints', async () => {
    const database = new D1DatabaseClient(runtime.database)
    const jobs = new SqlCatalogJobsRepository(database)
    await jobs.create('runtime-fence', 'tmdb', '2026-01-01T00:00:00.000Z')
    const old = await jobs.reserve(
      'runtime-fence',
      null,
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:05:00.000Z',
    )
    const current = await jobs.reserve(
      'runtime-fence',
      null,
      '2026-01-01T00:06:00.000Z',
      '2026-01-01T00:11:00.000Z',
    )
    expect(current).toBeGreaterThan(old!)
    const stale = fenceCatalogDatabase(database, {
      jobId: 'runtime-fence',
      token: old!,
      kind: 'catalog',
    })
    await expect(
      stale.prepare("UPDATE media_items SET title='stale publication'").run(),
    ).rejects.toBeInstanceOf(CatalogLeaseLostError)
    expect(
      await runtime.database
        .prepare("SELECT COUNT(*) n FROM media_items WHERE title='stale publication'")
        .first(),
    ).toEqual({ n: 0 })
    expect(
      await runtime.database.prepare('SELECT COUNT(*) n FROM catalog_write_guards').first(),
    ).toEqual({ n: 0 })
    expect(await jobs.complete('runtime-fence', current!, '2026-01-01T00:07:00.000Z')).toBe(true)
  })

  it('delivers Reader acquire/index work through the queue and exposes searchable text', async () => {
    await expect
      .poll(
        async () =>
          (await runtime.database
            .prepare("SELECT COUNT(*) count FROM article_content_manifests WHERE state='ready'")
            .first<{ count: number }>())!.count,
        { timeout: 20_000 },
      )
      .toBeGreaterThan(0)
    const ready = await runtime.database
      .prepare("SELECT COUNT(*) count FROM article_content_manifests WHERE state='ready'")
      .first<{ count: number }>()
    expect(ready!.count).toBeGreaterThan(0)
    const result = ArticlesResponseSchema.parse(
      await (await runtime.api('/api/library/articles?q=orchard')).json(),
    )
    expect(result.data.some((item) => item.title === 'A synthetic article')).toBe(true)
    expect(
      runtime.outboundRequests.every((value) =>
        ['readwise.io', 'api.hardcover.app'].includes(new URL(value).hostname),
      ),
    ).toBe(true)
  })

  it('serves the production SPA and assets while preserving API errors', async () => {
    const page = await runtime.api('/library/books/archive')
    const html = await page.text()
    expect(page.headers.get('content-type')).toContain('text/html')
    const asset = /src="([^"]+\.js)"/.exec(html)?.[1]
    expect(asset).toBeTruthy()
    expect((await runtime.api(asset!)).headers.get('content-type')).toMatch(/javascript/)
    const missing = await runtime.mf.dispatchFetch(new URL('/api/does-not-exist', runtime.url))
    expect(missing.status).toBe(404)
    await missing.arrayBuffer()
    expect(html).not.toContain('library-review')
  })
})
