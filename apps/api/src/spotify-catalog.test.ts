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
    attemptCount: 0,
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
  complete: vi.fn(),
  saveRun: vi.fn(),
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
    complete: mocks.complete,
  }),
  createSpotifyLibraryRepository: () => ({
    listTracksNeedingMetadata: mocks.candidates,
    catalogBacklogCounts: mocks.backlog,
    applyTrackMetadata: mocks.applyTrack,
    markTrackMetadataUnavailable: mocks.unavailable,
    rebuildMusicSearch: mocks.rebuildMusic,
  }),
  createLedgerRepository: () => ({
    findRawObject: mocks.rawFind,
    commit: mocks.rawCommit,
    saveSyncRun: mocks.saveRun,
  }),
}))
vi.mock('./spotify-credentials', () => ({
  refreshStoredSpotifyToken: async () => ({ accessToken: 'secret' }),
}))
vi.mock('@media-tracker/connector-spotify', async (original) => ({
  ...(await original<typeof import('@media-tracker/connector-spotify')>()),
  fetchSpotifyTrackResponse: mocks.fetchTrack,
}))

import { processSpotifyCatalogBackfill } from './spotify-catalog'
import { CatalogRetryError } from './catalog-retry'

describe('Spotify catalog backfill', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.job.attemptCount = 0
    mocks.reserve.mockResolvedValue(1)
    mocks.advance.mockResolvedValue(true)
    mocks.defer.mockResolvedValue(true)
    mocks.fail.mockResolvedValue(true)
    mocks.complete.mockResolvedValue(true)
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

  it('does not relabel stale cached API evidence as a fresh provider observation', async () => {
    mocks.rawFind.mockResolvedValue({
      acquiredAt: '2020-01-01T00:00:00.000Z',
      storageKey: 'raw/old.json',
    })
    await processSpotifyCatalogBackfill(
      { SYNC_QUEUE: { send: mocks.send } } as unknown as Bindings,
      {
        idempotencyKey: 'catalog:spotify:job-1',
        source: 'spotify',
        operation: 'refresh_spotify_catalog',
        catalogJobId: 'job-1',
      },
    )
    expect(mocks.fail).toHaveBeenCalledWith(
      'job-1',
      1,
      expect.any(String),
      'StaleCatalogResponseError',
      { requested: 0, returned: 0, unavailable: 0 },
    )
    expect(mocks.fetchTrack).not.toHaveBeenCalled()
    expect(mocks.applyTrack).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('stops persistent failures instead of perpetually self-enqueueing', async () => {
    mocks.job.attemptCount = 8
    await processSpotifyCatalogBackfill(
      { SYNC_QUEUE: { send: mocks.send } } as unknown as Bindings,
      {
        idempotencyKey: 'catalog:spotify:job-1',
        source: 'spotify',
        operation: 'refresh_spotify_catalog',
        catalogJobId: 'job-1',
      },
    )
    expect(mocks.fail).toHaveBeenCalledWith('job-1', 1, expect.any(String), 'retry_limit')
    expect(mocks.candidates).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
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
    expect(mocks.advance).not.toHaveBeenCalled()
    expect(mocks.defer).toHaveBeenCalledWith(
      'job-1',
      1,
      expect.any(String),
      expect.any(String),
      'spotify_http_429',
      { requested: 1, returned: 1, unavailable: 0 },
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
      1,
      expect.objectContaining({
        phase: 'episodes',
        requested: 0,
      }),
    )
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ catalogJobId: 'job-1' }))
  })
  const env = {
    RAW_BUCKET: { put: mocks.put },
    SYNC_QUEUE: { send: mocks.send },
  } as unknown as Bindings
  const job = {
    idempotencyKey: 'catalog:spotify:job-1',
    source: 'spotify' as const,
    operation: 'refresh_spotify_catalog' as const,
    catalogJobId: 'job-1',
  }
  it('delegates completion and its terminal run summary to one repository transition', async () => {
    mocks.candidates.mockResolvedValue([])
    mocks.backlog.mockResolvedValue({ tracks: 0, episodes: 0 })
    await processSpotifyCatalogBackfill(env, job)
    expect(mocks.complete).toHaveBeenCalledWith('job-1', 1, expect.any(String))
    expect(mocks.saveRun).not.toHaveBeenCalled()
    expect(mocks.defer).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it('defers a failed completion transaction without writing a premature terminal summary', async () => {
    mocks.candidates.mockResolvedValue([])
    mocks.backlog.mockResolvedValue({ tracks: 0, episodes: 0 })
    mocks.complete.mockRejectedValueOnce(new Error('Synthetic atomic database interruption'))
    await processSpotifyCatalogBackfill(env, job)
    expect(mocks.saveRun).not.toHaveBeenCalled()
    expect(mocks.defer).toHaveBeenCalledWith(
      'job-1',
      1,
      expect.any(String),
      expect.any(String),
      'Error',
      { requested: 0, returned: 0, unavailable: 0 },
    )
    expect(mocks.send).toHaveBeenCalledOnce()
  })
  it('retries rejected completion ownership without mutating the replacement attempt', async () => {
    mocks.candidates.mockResolvedValue([])
    mocks.backlog.mockResolvedValue({ tracks: 0, episodes: 0 })
    mocks.complete.mockResolvedValueOnce(false)
    await expect(processSpotifyCatalogBackfill(env, job)).rejects.toMatchObject({
      delaySeconds: 300,
    })
    expect(mocks.saveRun).not.toHaveBeenCalled()
    expect(mocks.defer).not.toHaveBeenCalled()
  })
  it('delegates permanent failure and its summary to the fenced terminal transaction', async () => {
    mocks.fetchTrack.mockRejectedValueOnce(new SpotifyApiError('forbidden', 403))
    await processSpotifyCatalogBackfill(env, job)
    expect(mocks.fail).toHaveBeenCalledWith('job-1', 1, expect.any(String), 'spotify_http_403', {
      requested: 0,
      returned: 0,
      unavailable: 0,
    })
    expect(mocks.saveRun).not.toHaveBeenCalled()
    expect(mocks.defer).not.toHaveBeenCalled()
  })
  it('retries rejected failure ownership without publishing a terminal run', async () => {
    mocks.fetchTrack.mockRejectedValueOnce(new SpotifyApiError('forbidden', 403))
    mocks.fail.mockResolvedValueOnce(false)
    await expect(processSpotifyCatalogBackfill(env, job)).rejects.toBeInstanceOf(CatalogRetryError)
    expect(mocks.saveRun).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
  })
})
