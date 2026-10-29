import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Bindings } from './env'
const mocks = vi.hoisted(() => ({
  tmdb: vi.fn(),
  youtube: vi.fn(),
  spotify: vi.fn(),
  active: vi.fn(),
  spotifyActive: vi.fn(),
  movieCandidates: vi.fn(),
  videoCandidates: vi.fn(),
  configuration: vi.fn(),
  backlog: vi.fn(),
  reserve: vi.fn(),
  send: vi.fn(),
}))
vi.mock('./tmdb-catalog', () => ({ startTmdbCatalogRefresh: mocks.tmdb }))
vi.mock('./youtube-catalog', () => ({ startYoutubeCatalogRefresh: mocks.youtube }))
vi.mock('./spotify-catalog', () => ({ startSpotifyCatalogBackfill: mocks.spotify }))
vi.mock('./env', () => ({
  createCatalogJobsRepository: () => ({ findActive: mocks.active }),
  createMoviesRepository: () => ({
    listTmdbEnrichmentCandidates: mocks.movieCandidates,
    needsTmdbConfigurationRefresh: mocks.configuration,
  }),
  createVideosRepository: () => ({ listYoutubeCatalogCandidates: mocks.videoCandidates }),
  createSpotifyCatalogJobsRepository: () => ({ findActive: mocks.spotifyActive }),
  createSpotifyLibraryRepository: () => ({ catalogBacklogCounts: mocks.backlog }),
  createArticlesRepository: () => ({ reserveContentTargets: mocks.reserve }),
  createLedgerRepository: () => ({ findConnectionBySource: async () => ({ id: 'readwise-1' }) }),
}))
import { scheduleCatalogWork } from './catalog-scheduler'
const at = '2026-10-29T12:00:00.000Z'
const env = {
  SYNC_ENABLED: 'true',
  CATALOG_AUTO_REFRESH: 'true',
  SPOTIFY_CATALOG_ENABLED: 'true',
  ARTICLE_CONTENT_ENABLED: 'true',
  TMDB_API_READ_TOKEN: 'synthetic',
  YOUTUBE_API_KEY: 'synthetic',
  SPOTIFY_CLIENT_ID: 'synthetic',
  SPOTIFY_REFRESH_TOKEN: 'synthetic',
  TOKEN_ENCRYPTION_KEY: 'synthetic',
  READWISE_TOKEN: 'synthetic',
  SYNC_QUEUE: { send: mocks.send },
} as unknown as Bindings
beforeEach(() => {
  vi.clearAllMocks()
  mocks.active.mockResolvedValue(null)
  mocks.spotifyActive.mockResolvedValue(null)
  mocks.movieCandidates.mockResolvedValue([])
  mocks.videoCandidates.mockResolvedValue([])
  mocks.configuration.mockResolvedValue(false)
  mocks.backlog.mockResolvedValue({ tracks: 0, episodes: 0 })
  mocks.reserve.mockResolvedValue([])
})
describe('catalog and content scheduling', () => {
  it('does not create empty catalog jobs or rebuild fresh projections', async () => {
    await scheduleCatalogWork(env, at)
    expect(mocks.tmdb).not.toHaveBeenCalled()
    expect(mocks.youtube).not.toHaveBeenCalled()
    expect(mocks.spotify).not.toHaveBeenCalled()
    expect(mocks.movieCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ at, refreshBefore: '2026-11-05T12:00:00.000Z', limit: 1 }),
    )
  })
  it('resumes existing work and starts due metadata independently', async () => {
    mocks.active.mockImplementation(async (provider: string) =>
      provider === 'tmdb' ? { id: 'active' } : null,
    )
    mocks.videoCandidates.mockResolvedValue([{ mediaItemId: 'video-1' }])
    mocks.backlog.mockResolvedValue({ tracks: 1, episodes: 0 })
    await scheduleCatalogWork(env, at)
    expect(mocks.tmdb).toHaveBeenCalledWith(env, at)
    expect(mocks.youtube).toHaveBeenCalledWith(env, at)
    expect(mocks.spotify).toHaveBeenCalledWith(env, at)
  })
  it('queues a bounded paced article batch and preserves version idempotency', async () => {
    mocks.reserve.mockResolvedValue([
      { connectionId: 'readwise-1', documentId: 'doc-1', sourceUpdatedAt: at },
      { connectionId: 'readwise-1', documentId: 'doc-2', sourceUpdatedAt: null },
    ])
    await scheduleCatalogWork(env, at)
    expect(mocks.reserve).toHaveBeenCalledWith(
      'readwise-1',
      'article-content:2026-10-29T12',
      at,
      20,
    )
    expect(mocks.send).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ idempotencyKey: `readwise-content:readwise-1:doc-1:${at}:a1:e1` }),
      { delaySeconds: 0 },
    )
    expect(mocks.send).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        idempotencyKey: 'readwise-content:readwise-1:doc-2:unknown:a1:e1',
      }),
      { delaySeconds: 6 },
    )
  })
  it('does not let one scheduler failure starve other sources', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.active.mockRejectedValue(new Error('synthetic outage'))
    mocks.backlog.mockResolvedValue({ tracks: 1, episodes: 0 })
    await scheduleCatalogWork(env, at)
    expect(mocks.spotify).toHaveBeenCalledOnce()
    expect(mocks.reserve).toHaveBeenCalledOnce()
    vi.restoreAllMocks()
  })
  it('honors explicit feature and global pauses', async () => {
    await scheduleCatalogWork({ ...env, SYNC_ENABLED: 'false' }, at)
    await scheduleCatalogWork(
      {
        ...env,
        CATALOG_AUTO_REFRESH: 'false',
        SPOTIFY_CATALOG_ENABLED: 'false',
        ARTICLE_CONTENT_ENABLED: 'false',
      },
      at,
    )
    expect(mocks.active).not.toHaveBeenCalled()
    expect(mocks.spotifyActive).not.toHaveBeenCalled()
    expect(mocks.reserve).not.toHaveBeenCalled()
  })
})
