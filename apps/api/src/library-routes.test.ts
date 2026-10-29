import { z } from 'zod'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import app from './app'
import { createArticlesRepository, type Bindings } from './env'
import { TestDatabase, TestBucket, seedReaderArticle } from './testing/storage'
import { syncHardcover } from './hardcover-sync'
import { importLetterboxdExport } from './letterboxd-import'
import { importSpotifyExtendedHistory } from './spotify-import'
import { importYoutubeTakeout } from './youtube-import'
let database: TestDatabase, bindings: Bindings
beforeEach(() => {
  database = new TestDatabase()
  bindings = {
    DB: database,
    RAW_BUCKET: new TestBucket(),
    HARDCOVER_TOKEN: 'synthetic',
    SYNC_QUEUE: { send: vi.fn(), sendBatch: vi.fn() },
  } as unknown as Bindings
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  database.sqlite.close()
})
async function get(path: string) {
  const response = await app.request(path, undefined, bindings)
  return {
    status: response.status,
    body: z
      .object({
        data: z.array(z.object({ id: z.string().optional() }).passthrough()).default([]),
        error: z.object({ code: z.string() }).optional(),
      })
      .passthrough()
      .parse(await response.json()),
  }
}
async function seed() {
  seedReaderArticle(database)
  await createArticlesRepository(bindings.DB).rebuildProjection({
    connectionId: 'readwise-1',
    syncRunId: 'run-1',
    rebuiltAt: '2026-09-20T12:00:00.000Z',
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      const query = JSON.parse(String(init?.body)).query as string
      return query.includes('MediaTrackerMe')
        ? Response.json({ data: { me: [{ id: 1 }] } })
        : Response.json({
            data: {
              user_books: [
                {
                  id: 501,
                  book_id: 701,
                  edition_id: null,
                  status_id: 3,
                  read_count: 1,
                  book: { id: 701, title: 'Needle Book' },
                  user_book_reads: [],
                },
              ],
            },
          })
    }),
  )
  await syncHardcover(bindings)
  await importLetterboxdExport(
    bindings,
    zipSync({
      'diary.csv': strToU8('Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n'),
      'ratings.csv': strToU8('Date,Name,Year,Letterboxd URI,Rating\n'),
      'reviews.csv': strToU8(
        'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date\n',
      ),
      'likes/films.csv': strToU8('Date,Name,Year,Letterboxd URI\n'),
      'watchlist.csv': strToU8('Date,Name,Year,Letterboxd URI\n'),
      'watched.csv': strToU8(
        'Date,Name,Year,Letterboxd URI\n2026-01-01,Needle Movie,2020,https://letterboxd.com/film/needle/\n',
      ),
    }),
  )
  await importSpotifyExtendedHistory(
    bindings,
    zipSync({
      'Streaming_History_Audio_2026.json': strToU8(
        JSON.stringify([
          {
            ts: '2026-01-01T00:00:00Z',
            ms_played: 100,
            spotify_episode_uri: 'spotify:episode:episode123',
            episode_name: 'Needle Podcast',
          },
          {
            ts: '2026-01-01T00:00:00Z',
            ms_played: 100,
            spotify_track_uri: 'spotify:track:track123',
            master_metadata_track_name: 'Needle Song',
          },
        ]),
      ),
    }),
  )
  await importYoutubeTakeout(
    bindings,
    zipSync({
      'Takeout/YouTube and YouTube Music/history/watch-history.html': strToU8(
        '<div class="outer-cell"><div class="content-cell">Watched&nbsp;<a href="https://www.youtube.com/watch?v=abcdefghijk">Needle Video</a><br>Jan 1, 2026, 12:00:00 PM UTC</div></div>',
      ),
    }),
  )
}
describe('media-specific HTTP routes with real ingestion and SQL', () => {
  it('passes nonempty collection filters and detail/history identifiers through all six families', async () => {
    await seed()
    for (const [family, query, detailKind] of [
      ['books', 'section=archive&q=Needle', ''],
      ['movies', 'section=archive&q=Needle', ''],
      ['articles', 'section=queue&q=Example', ''],
      ['podcasts', 'section=archive&q=Needle', 'episodes/'],
      ['music', 'section=tracks&q=Needle', 'tracks/'],
      ['videos', 'section=archive&q=Needle', ''],
    ] as const) {
      const result = await get(`/api/library/${family}?${query}`)
      expect(result.status, `${family} collection`).toBe(200)
      expect(result.body.data, `${family} data`).toHaveLength(1)
      const id = z.string().parse(result.body.data[0]?.id)
      const detail = await get(`/api/library/${family}/${detailKind}${id}`)
      expect(detail.status, `${family} detail`).toBe(200)
      const history = await get(`/api/library/${family}/${detailKind}${id}/history?limit=1`)
      expect(history.status, `${family} history`).toBe(200)
      const noMatch = await get(
        `/api/library/${family}?${query.replace(/q=[^&]+/, 'q=absentword')}`,
      )
      expect(noMatch.body.data, `${family} nonmatching filter`).toEqual([])
    }
  })
  it.each(['books', 'movies', 'articles', 'podcasts', 'music', 'videos'])(
    'rejects malformed %s cursors through the error contract',
    async (family) => {
      const result = await get(`/api/library/${family}?cursor=not-a-cursor`)
      expect(result.status).toBe(400)
      expect(result.body.error?.code).toBe('BAD_REQUEST')
    },
  )
  it('returns Article missing-detail errors and empty annotation collections', async () => {
    seedReaderArticle(database)
    const missing = await get('/api/library/articles/no-such-item')
    expect(missing.status).toBe(404)
    const highlights = await get('/api/library/articles/article-1/highlights')
    expect(highlights.status).toBe(200)
    expect(highlights.body.data).toEqual([])
  })
})
