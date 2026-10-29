import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { Readable } from 'node:stream'
import { Miniflare, Response as RuntimeResponse } from 'miniflare'
import { strToU8, zipSync } from 'fflate'

const root = fileURLToPath(new URL('../../', import.meta.url))

export const runtimeBookTitle = 'A Runtime Orchard'
export const runtimeMovieTitle = 'Runtime River'
export const runtimePodcastTitle = 'Runtime Episode'
export const runtimeTrackTitle = 'Runtime Track'
export const runtimeVideoTitle = 'Runtime Video'

export interface WorkerRuntime {
  mf: Miniflare
  url: URL
  database: Awaited<ReturnType<Miniflare['getD1Database']>>
  api(path: string, init?: Parameters<Miniflare['dispatchFetch']>[1]): Promise<RuntimeResponse>
  logs: string[]
  outboundRequests: string[]
  dispose(): Promise<void>
}

export function spotifyArchive(count = 2) {
  const rows = Array.from({ length: count }, (_, index) => ({
    ts: `2026-01-${String((index % 28) + 1).padStart(2, '0')}T12:00:00Z`,
    username: 'runtime-fixture',
    platform: 'synthetic',
    ms_played: 12_000,
    episode_name: index === 0 ? runtimePodcastTitle : null,
    episode_show_name: index === 0 ? 'Runtime Show' : null,
    spotify_episode_uri: index === 0 ? 'spotify:episode:runtimeEpisode' : null,
    master_metadata_track_name:
      index === 0 ? null : count === 2 ? runtimeTrackTitle : `Resume Track ${index}`,
    master_metadata_album_artist_name: index === 0 ? null : 'Runtime Artist',
    master_metadata_album_album_name: index === 0 ? null : 'Runtime Album',
    spotify_track_uri: index === 0 ? null : `spotify:track:runtimeTrack${index}`,
    reason_start: 'clickrow',
    reason_end: 'endplay',
    skipped: false,
  }))
  return zipSync(
    { 'Streaming_History_Audio_2026.json': strToU8(JSON.stringify(rows)) },
    { mtime: new Date('2026-01-01T00:00:00Z') },
  )
}

export function youtubeArchive(count = 3) {
  const entries = Array.from(
    { length: count },
    (_, index) => `<div class="outer-cell"><div class="content-cell">
Watched <a href="https://www.youtube.com/watch?v=runtimeV${String(index).padStart(3, '0')}">${runtimeVideoTitle} ${index}</a><br>
<a href="https://www.youtube.com/channel/UC1234567890abcdefghijAB">Runtime Channel</a><br>
Jan ${(index % 28) + 1}, 2026, 12:00:00 PM UTC
</div></div>`,
  )
  return zipSync(
    {
      'Takeout/YouTube and YouTube Music/history/watch-history.html': strToU8(entries.join('\n')),
      'Takeout/YouTube and YouTube Music/subscriptions/subscriptions.csv': strToU8(
        'Channel Id,Channel Url,Channel Title\nUC1234567890abcdefghijAB,https://www.youtube.com/channel/UC1234567890abcdefghijAB,Runtime Channel\n',
      ),
    },
    { mtime: new Date('2026-01-01T00:00:00Z') },
  )
}

export function letterboxdArchive() {
  return zipSync({
    'watched.csv': strToU8(
      `Date,Name,Year,Letterboxd URI\n2026-01-02,${runtimeMovieTitle},2025,https://letterboxd.com/film/runtime-river/\n`,
    ),
    'diary.csv': strToU8(
      `Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2026-01-02,${runtimeMovieTitle},2025,https://letterboxd.com/runtime/film/runtime-river/,4,,,2026-01-01\n`,
    ),
    'ratings.csv': strToU8('Date,Name,Year,Letterboxd URI,Rating\n'),
    'reviews.csv': strToU8(
      'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date\n',
    ),
    'watchlist.csv': strToU8('Date,Name,Year,Letterboxd URI\n'),
    'likes/films.csv': strToU8('Date,Name,Year,Letterboxd URI\n'),
  })
}

/** A disposable production Worker with synthetic upstreams. It never reads .env or .wrangler state. */
export async function createWorkerRuntime(
  options: { seed?: boolean; paused?: boolean } = {},
): Promise<WorkerRuntime> {
  const readerPage = JSON.parse(
    await readFile(
      new URL('../../packages/test-fixtures/readwise/archive-page.json', import.meta.url),
      'utf8',
    ),
  ) as {
    results: Array<Record<string, unknown>>
  }
  const logs: string[] = []
  const outboundRequests: string[] = []
  const mf = new Miniflare({
    name: 'imladris-synthetic-runtime',
    host: '127.0.0.1',
    port: 0,
    cf: false,
    modules: true,
    scriptPath: `${root}apps/api/dist/production/index.js`,
    compatibilityDate: '2026-07-18',
    compatibilityFlags: ['nodejs_compat'],
    bindings: {
      AUTH_MODE: 'local',
      SYNC_ENABLED: options.paused ? 'false' : 'true',
      MAINTENANCE_ENABLED: 'false',
      CATALOG_AUTO_REFRESH: 'false',
      READWISE_TOKEN: 'synthetic-runtime-token',
      HARDCOVER_TOKEN: 'synthetic-runtime-token',
    },
    d1Databases: ['DB'],
    d1Persist: false,
    r2Buckets: ['RAW_BUCKET'],
    r2Persist: false,
    queueProducers: { SYNC_QUEUE: 'runtime-sync' },
    queueConsumers: {
      'runtime-sync': { maxBatchSize: 1, maxBatchTimeout: 0, maxRetries: 1, retryDelay: 0 },
    },
    assets: {
      directory: `${root}apps/web/dist-production`,
      binding: 'ASSETS',
      routerConfig: { has_user_worker: true, invoke_user_worker_ahead_of_assets: true },
      assetConfig: { not_found_handling: 'single-page-application' },
    },
    handleRuntimeStdio(stdout: Readable, stderr: Readable) {
      for (const stream of [stdout, stderr])
        stream.on('data', (chunk: Buffer) => logs.push(String(chunk)))
    },
    async outboundService(request: { url: string; json(): Promise<unknown> }) {
      const url = new URL(request.url)
      outboundRequests.push(url.href)
      if (url.hostname === 'readwise.io') {
        if (url.pathname === '/api/v2/export/')
          return RuntimeResponse.json({ count: 0, nextPageCursor: null, results: [] })
        if (url.pathname === '/api/v3/list/') {
          const id = url.searchParams.get('id')
          const results = id
            ? readerPage.results
                .filter((item) => item.id === id)
                .map((item) => ({
                  ...item,
                  html_content:
                    '<article><p>The runtime orchard preserves searchable evidence.</p></article>',
                }))
            : readerPage.results.map((item) => ({ ...item, image_url: null }))
          return RuntimeResponse.json({ count: results.length, nextPageCursor: null, results })
        }
      }
      if (url.hostname === 'api.hardcover.app' && url.pathname === '/v1/graphql') {
        const body = (await request.json()) as { query: string }
        if (body.query.includes('MediaTrackerMe'))
          return RuntimeResponse.json({ data: { me: [{ id: 42 }] } })
        if (body.query.includes('LibraryEditions'))
          return RuntimeResponse.json({ data: { editions: [] } })
        if (body.query.includes('LibraryBooks'))
          return RuntimeResponse.json({
            data: {
              user_books: [
                {
                  id: 501,
                  book_id: 701,
                  edition_id: null,
                  status_id: 2,
                  read_count: 1,
                  rating: 4.5,
                  review: 'Synthetic retained review.',
                  date_added: '2026-01-01',
                  updated_at: '2026-01-02T12:00:00Z',
                  book: {
                    id: 701,
                    title: runtimeBookTitle,
                    release_date: '2020-01-01',
                    release_year: 2020,
                    contributions: [
                      {
                        author: { id: 11, name: 'Runtime Author' },
                        contributor_role: { id: 1, name: 'Author', primary: true },
                      },
                    ],
                  },
                  user_book_reads: [
                    { id: 901, finished_at: '2024-02-03', finished_at_precision: 3 },
                  ],
                },
              ],
            },
          })
      }
      throw new Error(
        `Unexpected outbound request in synthetic runtime: ${url.origin}${url.pathname}`,
      )
    },
  })
  try {
    const url = await mf.ready
    const database = await mf.getD1Database('DB')
    // D1 exec splits lines, not complete SQL constructs. A prepared run preserves
    // multi-line triggers and makes the same migration statements execute in workerd.
    const { DatabaseSync } = await import('node:sqlite')
    const parser = new DatabaseSync(':memory:')
    try {
      const directory = new URL('../../packages/db/migrations/', import.meta.url)
      for (const name of (await readdir(directory))
        .filter((name) => name.endsWith('.sql'))
        .sort()) {
        const sql = await readFile(new URL(name, directory), 'utf8')
        // SQLite identifies complete statements, including multi-line triggers.
        let pending = ''
        for (const line of sql.split('\n')) {
          pending += `${line}\n`
          if (!line.trimEnd().endsWith(';')) continue
          if (!pending.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, '').trim()) {
            pending = ''
            continue
          }
          try {
            parser.prepare(pending)
          } catch (error) {
            if (error instanceof Error && error.message.includes('incomplete input')) continue
          }
          // D1 always enforces foreign keys and strips SQLite's enabling pragma.
          if (!/^\s*PRAGMA foreign_keys\s*=\s*ON;\s*$/i.test(pending)) {
            try {
              await database.prepare(pending).run()
            } catch (error) {
              throw new Error(`Runtime migration failed: ${name}\n${pending}`, { cause: error })
            }
          }
          parser.exec(pending)
          pending = ''
        }
        if (pending.trim() && !pending.trim().startsWith('--'))
          throw new Error(`Incomplete migration ${name}`)
      }
    } finally {
      parser.close()
    }
    const api = async (path: string, init?: Parameters<typeof mf.dispatchFetch>[1]) => {
      const response = await mf.dispatchFetch(new URL(path, url), init)
      if (!response.ok)
        throw new Error(
          `${path}: ${response.status} ${await response.text()}\n${logs.slice(-8).join('')}`,
        )
      // Drain the dispatch socket even when callers only inspect the status.
      return new RuntimeResponse(await response.arrayBuffer(), response)
    }
    if (options.seed !== false && !options.paused) {
      for (const path of ['/api/connections/hardcover/sync', '/api/connections/readwise/sync'])
        await api(path, { method: 'POST' })
      for (const [path, archive] of [
        ['/api/connections/letterboxd/import', letterboxdArchive()],
        ['/api/connections/spotify/import', spotifyArchive()],
        [
          '/api/connections/youtube/import?connectionKey=runtime&connectionLabel=Runtime',
          youtubeArchive(),
        ],
      ] as const)
        await api(path, { method: 'POST', body: archive })
    }
    return { mf, url, database, api, logs, outboundRequests, dispose: () => mf.dispose() }
  } catch (error) {
    await mf.dispose()
    throw error
  }
}
