import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { importSpotifyExtendedHistory } from './spotify-import'
import { syncSpotifySavedEpisodes } from './spotify-sync'
import { TestBucket, TestDatabase } from './testing/storage'
import { SyncBudget, SyncDeferredError } from './sync-budget'
import type { Bindings } from './env'

const episode = {
  id: 'episode123',
  uri: 'spotify:episode:episode123',
  name: 'Synthetic episode',
  duration_ms: 10000,
  show: null,
  resume_point: { fully_played: false, resume_position_ms: 1000 },
}
let database: TestDatabase, bucket: TestBucket, bindings: Bindings
function provider(
  options: {
    saved?: boolean
    player?: boolean
    malformed?: string
    badCatalog?: string
    checkpointFailure?: boolean
  } = {},
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/api/token'))
        return Response.json({ access_token: 'synthetic', expires_in: 3600, token_type: 'Bearer' })
      if (url.includes('/me/episodes'))
        return Response.json({
          items: options.saved === false ? [] : [{ added_at: '2026-01-01T00:00:00Z', episode }],
          limit: 50,
          offset: 0,
          next: null,
          total: options.saved === false ? 0 : 1,
        })
      if (options.malformed && !url.includes('/tracks?'))
        return new Response(options.malformed, { headers: { 'content-type': 'application/json' } })
      if (url.includes('/me/shows'))
        return Response.json({ items: [], limit: 50, offset: 0, next: null, total: 0 })
      if (url.includes('/recently-played')) return Response.json({ items: [] })
      if (url.includes('/me/player')) {
        if (options.checkpointFailure) database.failNext = /INSERT INTO sync_cursors/
        return options.player === false
          ? new Response(null, { status: 204 })
          : Response.json({
              currently_playing_type: 'episode',
              is_playing: true,
              progress_ms: 1000,
              item: episode,
            })
      }
      return options.badCatalog ? new Response(options.badCatalog) : Response.json({ tracks: [] })
    }),
  )
}
beforeEach(() => {
  database = new TestDatabase()
  bucket = new TestBucket()
  bindings = {
    DB: database,
    RAW_BUCKET: bucket,
    SPOTIFY_CLIENT_ID: 'synthetic',
    SPOTIFY_REFRESH_TOKEN: 'synthetic',
    TOKEN_ENCRYPTION_KEY: btoa('x'.repeat(32)),
  } as unknown as Bindings
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  database.sqlite.close()
})

describe('Spotify sync reliability', () => {
  it.each(['saved', 'export', 'legacy'] as const)(
    'reuses canonical parents for a positive player after %s ingestion',
    async (origin) => {
      if (origin !== 'saved')
        await importSpotifyExtendedHistory(
          bindings,
          zipSync({
            'Streaming_History_Audio_2026.json': strToU8(
              JSON.stringify([
                { ts: '2026-01-01T00:00:00Z', ms_played: 100, spotify_episode_uri: episode.uri },
              ]),
            ),
          }),
        )
      if (origin === 'legacy') {
        // Established provider identities need not have the current deterministic IDs.
        database.sqlite.exec('PRAGMA foreign_keys=OFF')
        database.sqlite.exec(
          "UPDATE media_items SET id='legacy-media'; UPDATE external_identities SET media_item_id='legacy-media'; UPDATE archive_entries SET media_item_id='legacy-media'; UPDATE spotify_podcast_episodes SET media_item_id='legacy-media'; UPDATE spotify_podcast_playback_observations SET media_item_id='legacy-media'",
        )
        database.sqlite.exec('PRAGMA foreign_keys=ON')
      }
      provider()
      const first = await syncSpotifySavedEpisodes(bindings)
      const second = await syncSpotifySavedEpisodes(bindings)
      expect(first.partialFailures).toEqual([])
      expect(second.partialFailures).toEqual([])
      expect(second.playerObserved).toBe(true)
      expect(database.sqlite.prepare('SELECT COUNT(*) n FROM archive_entries').get()).toEqual({
        n: 1,
      })
      expect(
        database.sqlite.prepare('SELECT COUNT(*) n FROM spotify_player_observations').get(),
      ).toEqual({ n: 2 })
      const counts = database.sqlite
        .prepare('SELECT source_record_count FROM sync_runs WHERE id=?')
        .get(second.syncRunId)
      expect(counts).toEqual({ source_record_count: 2 })
    },
  )
  it.each(['{"malformed":', '{"items":"invalid","progress_ms":"invalid"}'])(
    'retains malformed optional responses and records durable partial completion: %s',
    async (malformed) => {
      provider({ malformed })
      const result = await syncSpotifySavedEpisodes(bindings)
      expect(result.partialFailures).toEqual(['saved_shows', 'player', 'recent_tracks'])
      expect(
        [...bucket.objects.values()].some((bytes) => new TextDecoder().decode(bytes) === malformed),
      ).toBe(true)
      expect(
        database.sqlite
          .prepare("SELECT COUNT(*) n FROM raw_objects WHERE processing_status='failed'")
          .get(),
      ).toEqual({ n: 3 })
      expect(
        database.sqlite
          .prepare('SELECT status,failed_record_count FROM sync_runs WHERE id=?')
          .get(result.syncRunId),
      ).toEqual({ status: 'partially_succeeded', failed_record_count: 3 })
      expect(database.sqlite.prepare('SELECT status FROM connections').get()).toEqual({
        status: 'degraded',
      })
      expect(
        database.sqlite
          .prepare("SELECT COUNT(*) n FROM sync_cursors WHERE name='saved-episodes'")
          .get(),
      ).toEqual({ n: 1 })
    },
  )
  it('records optional checkpoint failures after the primary scan commits', async () => {
    provider()
    await syncSpotifySavedEpisodes(bindings)
    // Fail an optional cursor update, not the completed primary saved-episode scan.
    database.failWhen = (query, values) =>
      query.includes('INSERT INTO sync_cursors') && values.includes('current-player')
    const result = await syncSpotifySavedEpisodes(bindings)
    expect(result.partialFailures).toContain('current-player_checkpoint')
    expect(
      database.sqlite
        .prepare('SELECT status,failed_record_count,error_message FROM sync_runs WHERE id=?')
        .get(result.syncRunId),
    ).toEqual({
      status: 'partially_succeeded',
      failed_record_count: 1,
      error_message: 'current-player_checkpoint',
    })
  })
})

it('retains malformed opportunistic track-catalog bytes before parsing', async () => {
  await importSpotifyExtendedHistory(
    bindings,
    zipSync({
      'Streaming_History_Audio_2026.json': strToU8(
        JSON.stringify([
          {
            ts: '2026-01-01T00:00:00Z',
            ms_played: 100,
            spotify_track_uri: 'spotify:track:track123',
          },
        ]),
      ),
    }),
  )
  provider({ badCatalog: '{"bad_catalog":' })
  const result = await syncSpotifySavedEpisodes(bindings)
  expect(result.partialFailures).toEqual(['track_catalog'])
  expect(
    [...bucket.objects.values()].some(
      (bytes) => new TextDecoder().decode(bytes) === '{"bad_catalog":',
    ),
  ).toBe(true)
  expect(
    database.sqlite
      .prepare("SELECT COUNT(*) n FROM raw_objects WHERE processing_status='failed'")
      .get(),
  ).toEqual({ n: 1 })
})

it('routes every Spotify surface through the injected fetch and charges parsed pages', async () => {
  provider()
  const fetcher = vi.mocked(fetch)
  const budget = new SyncBudget({ requests: 8, bytes: 100000, pages: 4, records: 10 }, fetcher)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('Unbudgeted provider request forbidden')
    }),
  )
  const result = await syncSpotifySavedEpisodes({
    ...bindings,
    SYNC_FETCH: budget.fetch,
    SYNC_BUDGET: budget,
    SPOTIFY_CATALOG_ENABLED: 'false',
  })
  expect(result.partialFailures).toEqual([])
  expect(budget.usage).toMatchObject({ requests: 5, pages: 4, records: 2 })
  expect(fetcher).toHaveBeenCalledTimes(5)
})

it.each([2, 3])(
  'retains accepted raw evidence and avoids the complete cursor when page allowance %s is exhausted',
  async (pages) => {
    provider()
    const budget = new SyncBudget({ requests: 8, bytes: 100000, pages, records: 10 }, fetch)
    await expect(
      syncSpotifySavedEpisodes({
        ...bindings,
        SYNC_FETCH: budget.fetch,
        SYNC_BUDGET: budget,
        SPOTIFY_CATALOG_ENABLED: 'false',
      }),
    ).rejects.toBeInstanceOf(SyncDeferredError)
    expect(budget.usage.pages).toBe(pages)
    expect(database.sqlite.prepare('SELECT COUNT(*) n FROM raw_objects').get()).toEqual({
      n: pages + 1,
    })
    expect(database.sqlite.prepare('SELECT COUNT(*) n FROM sync_cursors').get()).toEqual({ n: 0 })
    expect(
      database.sqlite.prepare('SELECT status,source_record_count FROM sync_runs').get(),
    ).toEqual({ status: 'failed', source_record_count: pages === 2 ? 1 : 2 })
  },
)
