import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { YoutubeApiError, YoutubeDataApiClient } from '@media-tracker/connector-youtube'
import { TmdbApiError, TmdbClient } from '@media-tracker/connector-tmdb'
import { CatalogLeaseLostError } from '@media-tracker/db'
import { ZodError } from 'zod'
import type { Bindings } from './env'
import type { SyncJob } from '@media-tracker/contracts'
const mocks = vi.hoisted(() => ({
  job: { id: 'catalog-1', provider: 'youtube', state: 'pending', cursor: null as string | null },
  find: vi.fn(),
  reserve: vi.fn(),
  release: vi.fn(),
  advance: vi.fn(),
  fail: vi.fn(),
  complete: vi.fn(),
  send: vi.fn(),
  candidates: vi.fn(),
  apply: vi.fn(),
  rebuild: vi.fn(),
  purge: vi.fn(),
  configurationNeeded: vi.fn(),
  reconcile: vi.fn(),
  factory: vi.fn(),
}))
vi.mock('./env', async (original) => ({
  ...(await original<typeof import('./env')>()),
  createCatalogJobsRepository: () => ({
    find: mocks.find,
    reserve: mocks.reserve,
    release: mocks.release,
    advance: mocks.advance,
    fail: mocks.fail,
    complete: mocks.complete,
  }),
  createVideosRepository: (...args: unknown[]) => {
    mocks.factory(...args)
    return {
      listYoutubeCatalogCandidates: mocks.candidates,
      applyYoutubeCatalogBatch: mocks.apply,
      rebuild: mocks.rebuild,
      purgeExpiredYoutubeCatalog: mocks.purge,
    }
  },
  createMoviesRepository: (...args: unknown[]) => {
    mocks.factory(...args)
    return {
      listTmdbEnrichmentCandidates: mocks.candidates,
      needsTmdbConfigurationRefresh: mocks.configurationNeeded,
      applyTmdbCatalogBatch: mocks.apply,
      rebuild: mocks.rebuild,
      reconcileTmdbIdentityCollisions: mocks.reconcile,
    }
  },
}))
import { processYoutubeCatalogRefresh } from './youtube-catalog'
import { processTmdbCatalogRefresh } from './tmdb-catalog'
import { CatalogRetryError } from './catalog-retry'
const env = {
  DB: {},
  YOUTUBE_API_KEY: 'synthetic',
  TMDB_API_READ_TOKEN: 'synthetic',
  SYNC_QUEUE: { send: mocks.send },
} as unknown as Bindings
const movie = {
  mediaItemId: 'media-1',
  exactTmdbMovieId: 1,
  exactImdbId: null,
  matchedTmdbTvId: null,
  matchedTmdbMovieId: null,
  matchedMethod: null,
  releaseYear: '2020',
  importedTitle: 'Synthetic',
}
const detail = {
  data: {
    title: 'Synthetic',
    original_title: 'Synthetic',
    original_language: 'en',
    overview: '',
    release_date: '2020-01-01',
    runtime: 90,
    poster_path: null,
    backdrop_path: null,
    tagline: '',
    imdb_id: 'tt123',
    external_ids: { imdb_id: 'tt123' },
    status: 'Released',
    vote_average: 4,
    vote_count: 10,
    genres: [],
    credits: { crew: [], cast: [] },
    production_countries: [],
    alternative_titles: { titles: [] },
    release_dates: { results: [] },
  },
  etag: null,
}
function message(provider: 'tmdb' | 'youtube', cursor = ''): SyncJob {
  return {
    idempotencyKey: `catalog:${provider}:catalog-1`,
    source: provider,
    operation: provider === 'tmdb' ? 'refresh_tmdb_catalog' : 'refresh_youtube_catalog',
    catalogJobId: 'catalog-1',
    catalogCursor: cursor,
  }
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.job = { id: 'catalog-1', provider: 'youtube', state: 'pending', cursor: null }
  mocks.find.mockImplementation(async () => ({ ...mocks.job }))
  mocks.reserve.mockResolvedValue(7)
  mocks.release.mockResolvedValue(true)
  mocks.advance.mockImplementation(async (_id, _token, input) => {
    mocks.job.cursor = input.cursor
    return true
  })
  mocks.complete.mockResolvedValue(true)
  mocks.fail.mockResolvedValue(true)
  mocks.candidates.mockResolvedValue([])
  mocks.configurationNeeded.mockResolvedValue(false)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(YoutubeDataApiClient.prototype, 'videos').mockResolvedValue([])
  vi.spyOn(YoutubeDataApiClient.prototype, 'channels').mockResolvedValue([])
  vi.spyOn(YoutubeDataApiClient.prototype, 'categories').mockResolvedValue([])
  vi.spyOn(TmdbClient.prototype, 'movieDetails').mockResolvedValue(detail as never)
})
afterEach(() => vi.restoreAllMocks())
describe.each(['youtube', 'tmdb'] as const)('%s catalog orchestration', (provider) => {
  beforeEach(() => {
    mocks.job.provider = provider
  })
  const process = provider === 'youtube' ? processYoutubeCatalogRefresh : processTmdbCatalogRefresh
  const candidates = () =>
    mocks.candidates.mockResolvedValue([
      provider === 'youtube' ? { mediaItemId: 'media-1', videoId: 'abcdefghijk' } : movie,
    ])
  const providerFailure = (error: Error) =>
    provider === 'youtube'
      ? vi.mocked(YoutubeDataApiClient.prototype.videos).mockRejectedValue(error)
      : vi.mocked(TmdbClient.prototype.movieDetails).mockRejectedValue(error)
  it('completes only after projection rebuild while holding the reserved lease', async () => {
    await process(env, message(provider))
    expect(mocks.factory).toHaveBeenCalledWith(env.DB, undefined, {
      jobId: 'catalog-1',
      token: 7,
      kind: 'catalog',
    })
    if (provider === 'youtube') {
      expect(mocks.rebuild).toHaveBeenCalledWith(expect.any(String), {
        jobId: 'catalog-1',
        token: 7,
      })
      expect(mocks.complete).not.toHaveBeenCalled()
    } else {
      expect(mocks.rebuild.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.complete.mock.invocationCallOrder[0]!,
      )
      expect(mocks.complete).toHaveBeenCalledWith('catalog-1', 7, expect.any(String))
    }
  })
  it('persists a provider batch before advancing and enqueuing its continuation', async () => {
    candidates()
    await process(env, message(provider))
    expect(mocks.apply).toHaveBeenCalledOnce()
    expect(mocks.advance).toHaveBeenCalledWith(
      'catalog-1',
      7,
      expect.objectContaining({ cursor: 'media-1', requested: 1 }),
    )
    expect(mocks.apply.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.advance.mock.invocationCallOrder[0]!,
    )
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ catalogCursor: 'media-1' }))
  })
  it.each(['transport', 'storage', 'lease'] as const)(
    'retries a transient %s failure without failing the job',
    async (kind) => {
      candidates()
      if (kind === 'transport') providerFailure(new TypeError('fetch failed: connection reset'))
      else
        mocks.apply.mockRejectedValueOnce(
          kind === 'lease' ? new CatalogLeaseLostError() : new Error('D1 temporarily unavailable'),
        )
      await expect(process(env, message(provider))).rejects.toBeInstanceOf(CatalogRetryError)
      expect(mocks.fail).not.toHaveBeenCalled()
      expect(mocks.advance).not.toHaveBeenCalled()
    },
  )
  it('recovers a send failure after cursor commit by redispatching persisted progress', async () => {
    candidates()
    mocks.send.mockRejectedValueOnce(new Error('Queue temporarily unavailable'))
    await expect(process(env, message(provider))).rejects.toBeInstanceOf(CatalogRetryError)
    expect(mocks.fail).not.toHaveBeenCalled()
    expect(mocks.release).not.toHaveBeenCalled()
    await process(env, message(provider))
    expect(mocks.apply).toHaveBeenCalledOnce()
    expect(mocks.send).toHaveBeenLastCalledWith(
      expect.objectContaining({ catalogCursor: 'media-1' }),
    )
  })
  it('retries an unexpired reservation instead of acknowledging abandoned work', async () => {
    mocks.reserve.mockResolvedValue(null)
    await expect(process(env, message(provider))).rejects.toMatchObject({ delaySeconds: 300 })
    expect(mocks.candidates).not.toHaveBeenCalled()
  })
  it('acknowledges completed duplicate deliveries without provider or publication work', async () => {
    mocks.job.state = 'succeeded'
    await process(env, message(provider))
    expect(mocks.reserve).not.toHaveBeenCalled()
    expect(mocks.apply).not.toHaveBeenCalled()
  })
  it('permanently fails schema-invalid provider responses', async () => {
    candidates()
    providerFailure(new ZodError([]))
    await expect(process(env, message(provider))).rejects.toBeInstanceOf(ZodError)
    expect(mocks.fail).toHaveBeenCalledWith(
      'catalog-1',
      7,
      'invalid_provider_response',
      expect.any(String),
    )
    expect(mocks.release).not.toHaveBeenCalled()
  })
  it('honors provider retry timing', async () => {
    candidates()
    providerFailure(
      provider === 'youtube' ? new YoutubeApiError(429, 900) : new TmdbApiError(429, 900),
    )
    await expect(process(env, message(provider))).rejects.toMatchObject({ delaySeconds: 900 })
    expect(mocks.release).toHaveBeenCalledWith('catalog-1', 7, expect.any(String))
  })
})

describe('catalog matching decisions', () => {
  beforeEach(() => {
    mocks.job.provider = 'tmdb'
  })
  it('prefers an authoritative TMDB identity over an older TV match', async () => {
    mocks.candidates.mockResolvedValue([{ ...movie, matchedTmdbTvId: 42 }])
    const tvDetails = vi
      .spyOn(TmdbClient.prototype, 'tvDetails')
      .mockRejectedValue(new Error('Unexpected TV lookup'))
    await processTmdbCatalogRefresh(env, message('tmdb'))
    expect(TmdbClient.prototype.movieDetails).toHaveBeenCalledWith(1)
    expect(tvDetails).not.toHaveBeenCalled()
    expect(mocks.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        movies: [expect.objectContaining({ tmdbMovieId: 1, matchMethod: 'exact_tmdb_id' })],
      }),
    )
  })

  it('prefers a newly supplied IMDb identity over a cached title match', async () => {
    mocks.candidates.mockResolvedValue([
      {
        ...movie,
        exactTmdbMovieId: null,
        exactImdbId: 'tt0000022',
        matchedTmdbMovieId: 13,
        matchedTmdbTvId: 42,
        matchedMethod: 'exact_title_year',
      },
    ])
    const lookup = vi.spyOn(TmdbClient.prototype, 'findMovieByImdb').mockResolvedValue([
      {
        id: 22,
        title: 'Synthetic',
        original_title: 'Synthetic',
        release_date: '2020-01-01',
        poster_path: null,
        vote_count: 20,
      },
    ])
    const search = vi
      .spyOn(TmdbClient.prototype, 'searchMovie')
      .mockRejectedValue(new Error('Unexpected title search'))
    await processTmdbCatalogRefresh(env, message('tmdb'))
    expect(lookup).toHaveBeenCalledWith('tt0000022')
    expect(TmdbClient.prototype.movieDetails).toHaveBeenCalledWith(22)
    expect(search).not.toHaveBeenCalled()
    expect(mocks.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        movies: [expect.objectContaining({ tmdbMovieId: 22, matchMethod: 'exact_imdb_id' })],
      }),
    )
  })

  it('refreshes a title-only established match directly without relabeling its evidence', async () => {
    mocks.candidates.mockResolvedValue([
      {
        ...movie,
        exactTmdbMovieId: null,
        matchedTmdbMovieId: 13,
        matchedMethod: 'verified_release_year',
      },
    ])
    const lookup = vi
      .spyOn(TmdbClient.prototype, 'findMovieByImdb')
      .mockRejectedValue(new Error('Unexpected IMDb lookup'))
    const search = vi
      .spyOn(TmdbClient.prototype, 'searchMovie')
      .mockRejectedValue(new Error('Unexpected title search'))
    await processTmdbCatalogRefresh(env, message('tmdb'))
    expect(TmdbClient.prototype.movieDetails).toHaveBeenCalledWith(13)
    expect(lookup).not.toHaveBeenCalled()
    expect(search).not.toHaveBeenCalled()
    expect(mocks.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        movies: [
          expect.objectContaining({ tmdbMovieId: 13, matchMethod: 'verified_release_year' }),
        ],
      }),
    )
  })

  it.each([
    { ids: [1], expected: 'matched' },
    { ids: [1, 2], expected: 'ambiguous' },
  ])('preserves exact-title candidate cardinality: $expected', async ({ ids, expected }) => {
    mocks.candidates.mockResolvedValue([{ ...movie, exactTmdbMovieId: null }])
    vi.spyOn(TmdbClient.prototype, 'searchMovie').mockResolvedValue(
      ids.map((id) => ({
        id,
        title: 'Synthetic',
        original_title: 'Synthetic',
        release_date: '2020-01-01',
        poster_path: null,
        vote_count: 20,
      })),
    )
    await processTmdbCatalogRefresh(env, message('tmdb'))
    expect(mocks.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        movies: [
          expect.objectContaining({
            matchStatus: expected,
            candidateCount: ids.length,
            tmdbMovieId: expected === 'matched' ? 1 : null,
          }),
        ],
      }),
    )
  })
  it('does not turn omitted YouTube IDs into returned catalog metadata', async () => {
    mocks.job.provider = 'youtube'
    mocks.candidates.mockResolvedValue([{ mediaItemId: 'media-1', videoId: 'abcdefghijk' }])
    await processYoutubeCatalogRefresh(env, message('youtube'))
    expect(mocks.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        requested: [{ mediaItemId: 'media-1', videoId: 'abcdefghijk' }],
        videos: [],
      }),
    )
    expect(mocks.advance).toHaveBeenCalledWith(
      'catalog-1',
      7,
      expect.objectContaining({ requested: 1, returned: 0, omitted: 1 }),
    )
  })
  it('refreshes configuration on an otherwise empty TMDB job before finishing', async () => {
    mocks.configurationNeeded.mockResolvedValue(true)
    vi.spyOn(TmdbClient.prototype, 'configuration').mockResolvedValue({
      data: {
        images: {
          secure_base_url: 'https://images.example/',
          poster_sizes: ['w500'],
          backdrop_sizes: ['w1280'],
        },
      },
      etag: null,
    } as never)
    await processTmdbCatalogRefresh(env, message('tmdb'))
    expect(mocks.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        configuration: expect.objectContaining({ posterBaseUrl: 'https://images.example/w500' }),
        movies: [],
      }),
    )
  })
})

it.each(['tmdb', 'youtube'] as const)(
  'does not let a %s delivery mutate the other provider job',
  async (provider) => {
    mocks.job.provider = provider === 'tmdb' ? 'youtube' : 'tmdb'
    await (provider === 'tmdb' ? processTmdbCatalogRefresh : processYoutubeCatalogRefresh)(
      env,
      message(provider),
    )
    expect(mocks.reserve).not.toHaveBeenCalled()
    expect(mocks.apply).not.toHaveBeenCalled()
    expect(mocks.fail).not.toHaveBeenCalled()
  },
)
