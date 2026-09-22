import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SpotifyApiError } from '@media-tracker/connector-spotify'
import type { Bindings } from './env'

const mocks = vi.hoisted(() => ({
  job: {
    id: 'job-1',
    connectionId: 'connection-1',
    syncRunId: 'run-1',
    state: 'pending',
    phase: 'tracks',
    requestedCount: 0,
    returnedCount: 0,
    unavailableCount: 0,
    nextAttemptAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  reserve: vi.fn(),
  advance: vi.fn(),
  defer: vi.fn(),
  fail: vi.fn(),
  fetchTrack: vi.fn(),
  candidates: vi.fn(),
  backlog: vi.fn(),
  applyTrack: vi.fn(),
  unavailable: vi.fn(),
  rebuildMusic: vi.fn(),
  rawCommit: vi.fn(),
  rawFind: vi.fn(),
  send: vi.fn(),
  put: vi.fn(),
}))

vi.mock('./env', () => ({
  createSpotifyCatalogJobsRepository: () => ({
    find: async () => mocks.job,
    reserve: mocks.reserve,
    advance: mocks.advance,
    defer: mocks.defer,
    fail: mocks.fail,
  }),
  createSpotifyLibraryRepository: () => ({
    listTracksNeedingMetadata: mocks.candidates,
    catalogBacklogCounts: mocks.backlog,
    applyTrackMetadata: mocks.applyTrack,
    markTrackMetadataUnavailable: mocks.unavailable,
    rebuildMusicSearch: mocks.rebuildMusic,
  }),
  createLedgerRepository: () => ({ findRawObject: mocks.rawFind, commit: mocks.rawCommit }),
}))
vi.mock('./spotify-credentials', () => ({
  refreshStoredSpotifyToken: async () => ({ accessToken: 'secret' }),
}))
vi.mock('@media-tracker/connector-spotify', async (original) => ({
  ...(await original<typeof import('@media-tracker/connector-spotify')>()),
  fetchSpotifyTrackResponse: mocks.fetchTrack,
}))

import { processSpotifyCatalogBackfill } from './spotify-catalog'

describe('Spotify catalog backfill', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.reserve.mockResolvedValue(true)
    mocks.rawFind.mockResolvedValue(null)
    mocks.candidates.mockResolvedValue([
      { mediaItemId: 'song-1', trackId: 'track1', trackUri: 'spotify:track:track1' },
      { mediaItemId: 'song-2', trackId: 'track2', trackUri: 'spotify:track:track2' },
    ])
    mocks.fetchTrack.mockImplementation(async ({ id }: { id: string }) => {
      if (id === 'track2') throw new SpotifyApiError('rate limited', 429, 17)
      return {
        bytes: new TextEncoder().encode(
          JSON.stringify({
            id: 'track1',
            uri: 'spotify:track:track1',
            name: 'Synthetic Track',
            artists: [],
            duration_ms: 1000,
          }),
        ),
        contentType: 'application/json',
      }
    })
  })

  it('persists the first response and defers after a partial 429 batch', async () => {
    const env = {
      RAW_BUCKET: { put: mocks.put },
      SYNC_QUEUE: { send: mocks.send },
    } as unknown as Bindings
    await processSpotifyCatalogBackfill(env, {
      idempotencyKey: 'catalog:spotify:job-1',
      source: 'spotify',
      operation: 'refresh_spotify_catalog',
      catalogJobId: 'job-1',
    })
    expect(mocks.put).toHaveBeenCalledOnce()
    expect(mocks.rawCommit).toHaveBeenCalledTimes(2)
    expect(mocks.applyTrack).toHaveBeenCalledOnce()
    expect(mocks.advance).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({
        requested: 1,
        returned: 1,
        unavailable: 0,
      }),
    )
    expect(mocks.defer).toHaveBeenCalledWith(
      'job-1',
      expect.any(String),
      expect.any(String),
      'spotify_http_429',
    )
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ catalogJobId: 'job-1' }),
      expect.objectContaining({ delaySeconds: 900 }),
    )
    expect(mocks.unavailable).not.toHaveBeenCalled()
  })

  it('switches to episode work when the track batch has no candidates', async () => {
    mocks.candidates.mockResolvedValue([])
    mocks.backlog.mockResolvedValue({ tracks: 0, episodes: 20 })
    const env = { SYNC_QUEUE: { send: mocks.send } } as unknown as Bindings
    await processSpotifyCatalogBackfill(env, {
      idempotencyKey: 'catalog:spotify:job-1',
      source: 'spotify',
      operation: 'refresh_spotify_catalog',
      catalogJobId: 'job-1',
    })
    expect(mocks.advance).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({
        phase: 'episodes',
        requested: 0,
      }),
    )
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ catalogJobId: 'job-1' }))
  })
})
