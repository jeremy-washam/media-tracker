import {
  ApiErrorSchema,
  ArticleDetailSchema,
  ArticleHighlightsQuerySchema,
  ArticleHighlightsResponseSchema,
  ArticleHistoryQuerySchema,
  ArticleHistoryResponseSchema,
  ArticlesQuerySchema,
  ArticlesResponseSchema,
  BookDetailSchema,
  BookHistoryQuerySchema,
  BookHistoryResponseSchema,
  BooksQuerySchema,
  BooksResponseSchema,
  CatalogSyncResponseSchema,
  ConnectionsResponseSchema,
  HardcoverSyncResponseSchema,
  HealthResponseSchema,
  LetterboxdImportResponseSchema,
  LetterboxdRssSyncResponseSchema,
  MediaListResponseSchema,
  MediaQuerySchema,
  PageQuerySchema,
  MediaSummarySchema,
  MovieDetailSchema,
  MovieHistoryQuerySchema,
  MovieHistoryResponseSchema,
  MoviesQuerySchema,
  MoviesResponseSchema,
  MusicDetailSchema,
  MusicFilterOptionsQuerySchema,
  MusicFilterOptionsResponseSchema,
  PodcastFilterOptionsQuerySchema,
  PodcastFilterOptionsResponseSchema,
  MusicHistoryQuerySchema,
  MusicHistoryResponseSchema,
  MusicQuerySchema,
  MusicResponseSchema,
  PodcastDetailSchema,
  PodcastHistoryQuerySchema,
  PodcastHistoryResponseSchema,
  PodcastsQuerySchema,
  PodcastsResponseSchema,
  ReadwiseSyncResponseSchema,
  SpotifyImportResponseSchema,
  SpotifyCatalogJobResponseSchema,
  SpotifySyncResponseSchema,
  SyncRunsResponseSchema,
  VideoChannelDetailSchema,
  VideoChannelLibraryQuerySchema,
  VideoChannelLibraryResponseSchema,
  VideoDetailSchema,
  VideoHistoryQuerySchema,
  VideoHistoryResponseSchema,
  VideosQuerySchema,
  VideosResponseSchema,
  YoutubeImportResponseSchema,
} from '@media-tracker/contracts'
import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { HTTPException } from 'hono/http-exception'
import { mediaItemId } from '@media-tracker/domain'
import { z } from 'zod'

import type { ApiError } from '@media-tracker/contracts'

import {
  createArticlesRepository,
  createBooksRepository,
  createLedgerRepository,
  createMoviesRepository,
  createSpotifyLibraryRepository,
  createVideosRepository,
  type AppEnv,
} from './env'
import { HardcoverTokenMissingError, syncHardcover } from './hardcover-sync'
import { importLetterboxdExport, LetterboxdImportError } from './letterboxd-import'
import { LetterboxdRssConfigurationError, syncLetterboxdRss } from './letterboxd-rss-sync'
import { requestContext, requestLogger, securityHeaders } from './middleware'
import { ReadwiseTokenMissingError, syncReadwiseArchive } from './readwise-sync'
import { hydrateArticleTextExcerpts } from './article-excerpts'
import {
  continueSpotifyExtendedHistoryImport,
  importSpotifyExtendedHistory,
  SpotifyImportError,
} from './spotify-import'
import { SpotifyCredentialsMissingError, syncSpotifySavedEpisodes } from './spotify-sync'
import { startSpotifyCatalogBackfill, spotifyCatalogJobStatus } from './spotify-catalog'
import {
  continueYoutubeTakeoutImport,
  importYoutubeTakeout,
  YoutubeTakeoutImportError,
} from './youtube-import'
import { startTmdbCatalogRefresh } from './tmdb-catalog'
import { startYoutubeCatalogRefresh } from './youtube-catalog'

const apiVersion = '0.0.0'

const jsonContent = <Schema>(schema: Schema, description: string) => ({
  content: {
    'application/json': {
      schema,
    },
  },
  description,
})

const healthRoute = createRoute({
  method: 'get',
  path: '/api/health',
  tags: ['System'],
  responses: {
    200: jsonContent(HealthResponseSchema, 'API and local Worker health'),
  },
})

const mediaRoute = createRoute({
  method: 'get',
  path: '/api/media',
  tags: ['Media'],
  request: { query: MediaQuerySchema },
  responses: {
    200: jsonContent(MediaListResponseSchema, 'Media history'),
  },
})

const mediaDetailRoute = createRoute({
  method: 'get',
  path: '/api/media/{id}',
  tags: ['Media'],
  request: {
    params: MediaSummarySchema.pick({ id: true }),
  },
  responses: {
    200: jsonContent(MediaSummarySchema, 'Media item'),
    404: jsonContent(ApiErrorSchema, 'Media item not found'),
  },
})

const booksRoute = createRoute({
  method: 'get',
  path: '/api/library/books',
  tags: ['Library', 'Books'],
  request: { query: BooksQuerySchema },
  responses: {
    200: jsonContent(BooksResponseSchema, 'Books collection'),
    400: jsonContent(ApiErrorSchema, 'Invalid Books query'),
  },
})

const bookDetailRoute = createRoute({
  method: 'get',
  path: '/api/library/books/{mediaItemId}',
  tags: ['Library', 'Books'],
  request: { params: z.object({ mediaItemId: z.string().min(1) }) },
  responses: {
    200: jsonContent(BookDetailSchema, 'Book details'),
    404: jsonContent(ApiErrorSchema, 'Book not found'),
  },
})

const bookHistoryRoute = createRoute({
  method: 'get',
  path: '/api/library/books/{mediaItemId}/history',
  tags: ['Library', 'Books'],
  request: {
    params: z.object({ mediaItemId: z.string().min(1) }),
    query: BookHistoryQuerySchema,
  },
  responses: {
    200: jsonContent(BookHistoryResponseSchema, 'Book activity history'),
    400: jsonContent(ApiErrorSchema, 'Invalid history cursor'),
  },
})

const moviesRoute = createRoute({
  method: 'get',
  path: '/api/library/movies',
  tags: ['Library', 'Movies'],
  request: { query: MoviesQuerySchema },
  responses: {
    200: jsonContent(MoviesResponseSchema, 'Movies collection'),
    400: jsonContent(ApiErrorSchema, 'Invalid Movies query'),
  },
})

const articlesRoute = createRoute({
  method: 'get',
  path: '/api/library/articles',
  tags: ['Library', 'Articles'],
  request: { query: ArticlesQuerySchema },
  responses: {
    200: jsonContent(ArticlesResponseSchema, 'Articles collection'),
    400: jsonContent(ApiErrorSchema, 'Invalid Articles query'),
  },
})

const articleDetailRoute = createRoute({
  method: 'get',
  path: '/api/library/articles/{mediaItemId}',
  tags: ['Library', 'Articles'],
  request: { params: z.object({ mediaItemId: z.string().min(1) }) },
  responses: {
    200: jsonContent(ArticleDetailSchema, 'Article details'),
    404: jsonContent(ApiErrorSchema, 'Article not found'),
  },
})

const articleHistoryRoute = createRoute({
  method: 'get',
  path: '/api/library/articles/{mediaItemId}/history',
  tags: ['Library', 'Articles'],
  request: {
    params: z.object({ mediaItemId: z.string().min(1) }),
    query: ArticleHistoryQuerySchema,
  },
  responses: {
    200: jsonContent(ArticleHistoryResponseSchema, 'Article archive history'),
    400: jsonContent(ApiErrorSchema, 'Invalid history cursor'),
  },
})

const articleHighlightsRoute = createRoute({
  method: 'get',
  path: '/api/library/articles/{mediaItemId}/highlights',
  tags: ['Library', 'Articles'],
  request: {
    params: z.object({ mediaItemId: z.string().min(1) }),
    query: ArticleHighlightsQuerySchema,
  },
  responses: {
    200: jsonContent(ArticleHighlightsResponseSchema, 'Article highlights'),
    400: jsonContent(ApiErrorSchema, 'Invalid highlight cursor'),
  },
})

const movieDetailRoute = createRoute({
  method: 'get',
  path: '/api/library/movies/{mediaItemId}',
  tags: ['Library', 'Movies'],
  request: { params: z.object({ mediaItemId: z.string().min(1) }) },
  responses: {
    200: jsonContent(MovieDetailSchema, 'Movie details'),
    404: jsonContent(ApiErrorSchema, 'Movie not found'),
  },
})

const movieHistoryRoute = createRoute({
  method: 'get',
  path: '/api/library/movies/{mediaItemId}/history',
  tags: ['Library', 'Movies'],
  request: {
    params: z.object({ mediaItemId: z.string().min(1) }),
    query: MovieHistoryQuerySchema,
  },
  responses: {
    200: jsonContent(MovieHistoryResponseSchema, 'Movie viewing history'),
    400: jsonContent(ApiErrorSchema, 'Invalid history cursor'),
  },
})

const tmdbCatalogSyncRoute = createRoute({
  method: 'post',
  path: '/api/catalogs/tmdb/sync',
  tags: ['Catalogs', 'Movies'],
  responses: {
    202: jsonContent(CatalogSyncResponseSchema, 'TMDB catalog refresh accepted'),
    503: jsonContent(ApiErrorSchema, 'TMDB is not configured'),
  },
})

const podcastsRoute = createRoute({
  method: 'get',
  path: '/api/library/podcasts',
  tags: ['Library', 'Podcasts'],
  request: { query: PodcastsQuerySchema },
  responses: {
    200: jsonContent(PodcastsResponseSchema, 'Podcast library'),
    400: jsonContent(ApiErrorSchema, 'Invalid Podcasts query'),
  },
})

const podcastFilterOptionsRoute = createRoute({
  method: 'get',
  path: '/api/library/podcasts/filter-options',
  tags: ['Library', 'Podcasts'],
  request: { query: PodcastFilterOptionsQuerySchema },
  responses: {
    200: jsonContent(PodcastFilterOptionsResponseSchema, 'Podcast facet options'),
    400: jsonContent(ApiErrorSchema, 'Invalid Podcast facet query'),
  },
})

const podcastDetailRoute = createRoute({
  method: 'get',
  path: '/api/library/podcasts/{kind}/{id}',
  tags: ['Library', 'Podcasts'],
  request: { params: z.object({ kind: z.enum(['episodes', 'shows']), id: z.string().min(1) }) },
  responses: {
    200: jsonContent(PodcastDetailSchema, 'Podcast details'),
    404: jsonContent(ApiErrorSchema, 'Podcast item not found'),
  },
})

const podcastHistoryRoute = createRoute({
  method: 'get',
  path: '/api/library/podcasts/episodes/{id}/history',
  tags: ['Library', 'Podcasts'],
  request: {
    params: z.object({ id: z.string().min(1) }),
    query: PodcastHistoryQuerySchema,
  },
  responses: {
    200: jsonContent(PodcastHistoryResponseSchema, 'Podcast listening history'),
    400: jsonContent(ApiErrorSchema, 'Invalid Podcast history cursor'),
  },
})

const musicRoute = createRoute({
  method: 'get',
  path: '/api/library/music',
  tags: ['Library', 'Music'],
  request: { query: MusicQuerySchema },
  responses: {
    200: jsonContent(MusicResponseSchema, 'Music library'),
    400: jsonContent(ApiErrorSchema, 'Invalid Music query'),
  },
})

const musicFilterOptionsRoute = createRoute({
  method: 'get',
  path: '/api/library/music/filter-options',
  tags: ['Library', 'Music'],
  request: { query: MusicFilterOptionsQuerySchema },
  responses: {
    200: jsonContent(MusicFilterOptionsResponseSchema, 'Music facet options'),
    400: jsonContent(ApiErrorSchema, 'Invalid Music facet query'),
  },
})

const musicDetailRoute = createRoute({
  method: 'get',
  path: '/api/library/music/{kind}/{id}',
  tags: ['Library', 'Music'],
  request: {
    params: z.object({ kind: z.enum(['tracks', 'albums', 'artists']), id: z.string().min(1) }),
  },
  responses: {
    200: jsonContent(MusicDetailSchema, 'Music details'),
    404: jsonContent(ApiErrorSchema, 'Music item not found'),
  },
})

const musicHistoryRoute = createRoute({
  method: 'get',
  path: '/api/library/music/{kind}/{id}/history',
  tags: ['Library', 'Music'],
  request: {
    params: z.object({ kind: z.enum(['tracks', 'albums', 'artists']), id: z.string().min(1) }),
    query: MusicHistoryQuerySchema,
  },
  responses: {
    200: jsonContent(MusicHistoryResponseSchema, 'Music playback history'),
    400: jsonContent(ApiErrorSchema, 'Invalid Music history cursor'),
  },
})

const videosRoute = createRoute({
  method: 'get',
  path: '/api/library/videos',
  tags: ['Library', 'Videos'],
  request: { query: VideosQuerySchema },
  responses: {
    200: jsonContent(VideosResponseSchema, 'Videos library'),
    400: jsonContent(ApiErrorSchema, 'Invalid Videos query'),
  },
})

const videoDetailRoute = createRoute({
  method: 'get',
  path: '/api/library/videos/{id}',
  tags: ['Library', 'Videos'],
  request: { params: z.object({ id: z.string().min(1) }) },
  responses: {
    200: jsonContent(VideoDetailSchema, 'Video details'),
    404: jsonContent(ApiErrorSchema, 'Video not found'),
  },
})

const videoHistoryRoute = createRoute({
  method: 'get',
  path: '/api/library/videos/{id}/history',
  tags: ['Library', 'Videos'],
  request: { params: z.object({ id: z.string().min(1) }), query: VideoHistoryQuerySchema },
  responses: {
    200: jsonContent(VideoHistoryResponseSchema, 'Video watch history'),
    400: jsonContent(ApiErrorSchema, 'Invalid video history cursor'),
  },
})

const videoChannelDetailRoute = createRoute({
  method: 'get',
  path: '/api/library/video-channels/{id}',
  tags: ['Library', 'Videos'],
  request: { params: z.object({ id: z.string().min(1) }) },
  responses: {
    200: jsonContent(VideoChannelDetailSchema, 'Video channel details'),
    404: jsonContent(ApiErrorSchema, 'Video channel not found'),
  },
})

const videoChannelLibraryRoute = createRoute({
  method: 'get',
  path: '/api/library/video-channels/{id}/videos',
  tags: ['Library', 'Videos'],
  request: {
    params: z.object({ id: z.string().min(1) }),
    query: VideoChannelLibraryQuerySchema,
  },
  responses: {
    200: jsonContent(VideoChannelLibraryResponseSchema, 'Videos for one Library channel'),
    400: jsonContent(ApiErrorSchema, 'Invalid channel Library cursor'),
  },
})

const youtubeCatalogSyncRoute = createRoute({
  method: 'post',
  path: '/api/catalogs/youtube/sync',
  tags: ['Catalogs', 'Videos'],
  responses: {
    202: jsonContent(CatalogSyncResponseSchema, 'YouTube catalog refresh accepted'),
    503: jsonContent(ApiErrorSchema, 'YouTube Data API is not configured'),
  },
})

const readwiseSyncRoute = createRoute({
  method: 'post',
  path: '/api/connections/readwise/sync',
  tags: ['Connections'],
  responses: {
    200: jsonContent(ReadwiseSyncResponseSchema, 'Completed Readwise Archive import'),
    503: jsonContent(ApiErrorSchema, 'Readwise is not configured or unavailable'),
  },
})

const letterboxdImportRoute = createRoute({
  method: 'post',
  path: '/api/connections/letterboxd/import',
  tags: ['Connections'],
  responses: {
    200: jsonContent(LetterboxdImportResponseSchema, 'Completed Letterboxd export import'),
    400: jsonContent(ApiErrorSchema, 'The upload is not a supported Letterboxd export'),
  },
})

const hardcoverSyncRoute = createRoute({
  method: 'post',
  path: '/api/connections/hardcover/sync',
  tags: ['Connections'],
  responses: {
    200: jsonContent(HardcoverSyncResponseSchema, 'Completed Hardcover Read-books sync'),
    503: jsonContent(ApiErrorSchema, 'Hardcover is not configured or unavailable'),
  },
})

const letterboxdSyncRoute = createRoute({
  method: 'post',
  path: '/api/connections/letterboxd/sync',
  tags: ['Connections'],
  responses: {
    200: jsonContent(LetterboxdRssSyncResponseSchema, 'Completed Letterboxd RSS poll'),
    503: jsonContent(ApiErrorSchema, 'Letterboxd RSS is not configured'),
  },
})

const spotifyImportRoute = createRoute({
  method: 'post',
  path: '/api/connections/spotify/import',
  tags: ['Connections'],
  responses: {
    200: jsonContent(SpotifyImportResponseSchema, 'Completed Spotify history export import'),
    400: jsonContent(ApiErrorSchema, 'The upload is not a supported Spotify export'),
  },
})

const spotifyImportContinueRoute = createRoute({
  method: 'post',
  path: '/api/connections/spotify/import/{importId}/continue',
  tags: ['Connections'],
  request: {
    params: z.object({ importId: z.string() }),
  },
  responses: {
    200: jsonContent(SpotifyImportResponseSchema, 'Continued Spotify history export import'),
    400: jsonContent(ApiErrorSchema, 'The Spotify import cannot be continued'),
  },
})

const spotifySyncRoute = createRoute({
  method: 'post',
  path: '/api/connections/spotify/sync',
  tags: ['Connections'],
  responses: {
    200: jsonContent(SpotifySyncResponseSchema, 'Completed Spotify saved-episode sync'),
    503: jsonContent(ApiErrorSchema, 'Spotify is not configured or unavailable'),
  },
})

const spotifyCatalogSyncRoute = createRoute({
  method: 'post',
  path: '/api/catalogs/spotify/sync',
  tags: ['Catalogs', 'Music', 'Podcasts'],
  responses: {
    202: jsonContent(SpotifyCatalogJobResponseSchema, 'Spotify catalog backfill accepted'),
    503: jsonContent(ApiErrorSchema, 'Spotify catalog credentials are not configured'),
  },
})

const spotifyCatalogJobRoute = createRoute({
  method: 'get',
  path: '/api/catalogs/spotify/jobs/{jobId}',
  tags: ['Catalogs', 'Music', 'Podcasts'],
  request: { params: z.object({ jobId: z.string().min(1) }) },
  responses: {
    200: jsonContent(SpotifyCatalogJobResponseSchema, 'Spotify catalog backfill status'),
    404: jsonContent(ApiErrorSchema, 'Catalog job not found'),
  },
})

const youtubeImportRoute = createRoute({
  method: 'post',
  path: '/api/connections/youtube/import',
  tags: ['Connections'],
  responses: {
    200: jsonContent(YoutubeImportResponseSchema, 'Completed YouTube Takeout import'),
    400: jsonContent(ApiErrorSchema, 'The upload is not a supported YouTube Takeout export'),
  },
})

const youtubeImportContinueRoute = createRoute({
  method: 'post',
  path: '/api/connections/youtube/import/{importId}/continue',
  tags: ['Connections'],
  request: {
    params: z.object({ importId: z.string() }),
  },
  responses: {
    200: jsonContent(YoutubeImportResponseSchema, 'Continued YouTube Takeout import'),
    400: jsonContent(ApiErrorSchema, 'The YouTube import cannot be continued'),
  },
})

const connectionsRoute = createRoute({
  method: 'get',
  path: '/api/connections',
  tags: ['Connections'],
  responses: {
    200: jsonContent(ConnectionsResponseSchema, 'Source connection status'),
  },
})

const syncRunsRoute = createRoute({
  method: 'get',
  path: '/api/sync-runs',
  tags: ['Sync'],
  request: { query: PageQuerySchema },
  responses: {
    200: jsonContent(SyncRunsResponseSchema, 'Recent synchronization runs'),
  },
})

const app = new OpenAPIHono<AppEnv>({
  defaultHook: (result, context) => {
    if (!result.success)
      return context.json(
        {
          error: {
            code: 'BAD_REQUEST',
            message: 'Invalid request parameters.',
            requestId: context.get('requestId'),
          },
        },
        400,
      )
  },
})

app.use('*', securityHeaders)
app.use('*', requestContext)
app.use('*', requestLogger)

app.openapi(healthRoute, (context) => {
  return context.json(
    HealthResponseSchema.parse({
      status: 'ok',
      service: 'media-tracker-api',
      version: apiVersion,
      timestamp: new Date().toISOString(),
      requestId: context.get('requestId'),
    }),
    200,
  )
})

app.openapi(mediaRoute, async (context) => {
  const query = context.req.valid('query')
  try {
    const page = await createLedgerRepository(
      context.env.DB,
      context.get('databaseUsageObserver'),
    ).listMediaPage({
      limit: query.limit,
      ...(query.type === undefined ? {} : { type: query.type }),
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    })
    return context.json(MediaListResponseSchema.parse(page), 200)
  } catch (error) {
    if (error instanceof TypeError && error.message === 'Invalid pagination cursor')
      throw new HTTPException(400, { message: error.message })
    throw error
  }
})

app.openapi(mediaDetailRoute, async (context) => {
  const id = context.req.valid('param').id
  const item = await createLedgerRepository(
    context.env.DB,
    context.get('databaseUsageObserver'),
  ).findMedia(mediaItemId(id))

  if (item !== null) return context.json(MediaSummarySchema.parse(item), 200)

  return context.json(
    ApiErrorSchema.parse({
      error: {
        code: 'NOT_FOUND',
        message: `No media item exists with ID ${id}.`,
        requestId: context.get('requestId'),
      },
    }),
    404,
  )
})

app.openapi(booksRoute, async (context) => {
  const query = context.req.valid('query')
  try {
    const page = await createBooksRepository(
      context.env.DB,
      context.get('databaseUsageObserver'),
    ).listBooks({
      collection: query.collection,
      ...(query.q === undefined ? {} : { q: query.q }),
      formats: query.format,
      series: query.series,
      genres: query.genre,
      finishedMode: query.finishedMode,
      ...(query.finishedFrom === undefined ? {} : { finishedFrom: query.finishedFrom }),
      ...(query.finishedTo === undefined ? {} : { finishedTo: query.finishedTo }),
      publishedMode: query.publishedMode,
      ...(query.publishedFrom === undefined ? {} : { publishedFrom: query.publishedFrom }),
      ...(query.publishedTo === undefined ? {} : { publishedTo: query.publishedTo }),
      addedMode: query.addedMode,
      ...(query.addedFrom === undefined ? {} : { addedFrom: query.addedFrom }),
      ...(query.addedTo === undefined ? {} : { addedTo: query.addedTo }),
      ratingMode: query.ratingMode,
      ...(query.minRating === undefined ? {} : { minRating: query.minRating }),
      ...(query.sort === undefined ? {} : { sort: query.sort }),
      ...(query.direction === undefined ? {} : { direction: query.direction }),
      limit: query.limit,
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    })
    return context.json(BooksResponseSchema.parse(page), 200)
  } catch (error) {
    if (error instanceof TypeError && error.message === 'Invalid Books pagination cursor') {
      throw new HTTPException(400, { message: error.message })
    }
    throw error
  }
})

app.openapi(bookDetailRoute, async (context) => {
  const id = context.req.valid('param').mediaItemId
  const book = await createBooksRepository(
    context.env.DB,
    context.get('databaseUsageObserver'),
  ).findBook(id)
  if (book !== null) return context.json(BookDetailSchema.parse(book), 200)
  return context.json(
    ApiErrorSchema.parse({
      error: {
        code: 'NOT_FOUND',
        message: `No book exists with media item ID ${id}.`,
        requestId: context.get('requestId'),
      },
    }),
    404,
  )
})

app.openapi(bookHistoryRoute, async (context) => {
  const id = context.req.valid('param').mediaItemId
  const query = context.req.valid('query')
  try {
    const history = await createBooksRepository(
      context.env.DB,
      context.get('databaseUsageObserver'),
    ).listBookHistory(id, {
      limit: query.limit,
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    })
    return context.json(BookHistoryResponseSchema.parse(history), 200)
  } catch (error) {
    if (error instanceof TypeError && error.message === 'Invalid Book history cursor') {
      throw new HTTPException(400, { message: error.message })
    }
    throw error
  }
})

app.openapi(articlesRoute, async (context) => {
  const query = context.req.valid('query')
  try {
    const repository = createArticlesRepository(
      context.env.DB,
      context.get('databaseUsageObserver'),
    )
    const page = await repository.listArticles({
      section: query.section,
      ...(query.q === undefined ? {} : { q: query.q }),
      types: query.type,
      authors: query.author,
      publications: query.publication,
      ...(query.publishedFrom === undefined ? {} : { publishedFrom: query.publishedFrom }),
      ...(query.publishedTo === undefined ? {} : { publishedTo: query.publishedTo }),
      publishedUnknown: query.publishedUnknown,
      readingTimes: query.readingTime,
      progress: query.progress,
      ...(query.archivedFrom === undefined ? {} : { archivedFrom: query.archivedFrom }),
      ...(query.archivedTo === undefined ? {} : { archivedTo: query.archivedTo }),
      archivedUnknown: query.archivedUnknown,
      currentStates: query.currentState,
      queueStates: query.queueState,
      ...(query.addedFrom === undefined ? {} : { addedFrom: query.addedFrom }),
      ...(query.addedTo === undefined ? {} : { addedTo: query.addedTo }),
      addedUnknown: query.addedUnknown,
      ...(query.arrivedFrom === undefined ? {} : { arrivedFrom: query.arrivedFrom }),
      ...(query.arrivedTo === undefined ? {} : { arrivedTo: query.arrivedTo }),
      arrivedUnknown: query.arrivedUnknown,
      opened: query.opened,
      history: query.history,
      ...(query.sort === undefined ? {} : { sort: query.sort }),
      ...(query.direction === undefined ? {} : { direction: query.direction }),
      limit: query.limit,
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    })
    if (query.q !== undefined) {
      await hydrateArticleTextExcerpts({
        items: page.data,
        query: query.q,
        repository,
        bucket: context.env.RAW_BUCKET,
      })
    }
    return context.json(ArticlesResponseSchema.parse(page), 200)
  } catch (error) {
    if (error instanceof TypeError && error.message === 'Invalid Articles pagination cursor') {
      throw new HTTPException(400, { message: error.message })
    }
    throw error
  }
})

app.openapi(articleDetailRoute, async (context) => {
  const id = context.req.valid('param').mediaItemId
  const article = await createArticlesRepository(
    context.env.DB,
    context.get('databaseUsageObserver'),
  ).findArticle(id)
  if (article !== null) return context.json(ArticleDetailSchema.parse(article), 200)
  return context.json(
    ApiErrorSchema.parse({
      error: {
        code: 'NOT_FOUND',
        message: `No article exists with media item ID ${id}.`,
        requestId: context.get('requestId'),
      },
    }),
    404,
  )
})

app.openapi(articleHistoryRoute, async (context) => {
  const id = context.req.valid('param').mediaItemId
  const query = context.req.valid('query')
  try {
    const result = await createArticlesRepository(
      context.env.DB,
      context.get('databaseUsageObserver'),
    ).listArticleHistory(id, {
      limit: query.limit,
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    })
    return context.json(ArticleHistoryResponseSchema.parse(result), 200)
  } catch (error) {
    if (error instanceof TypeError && error.message === 'Invalid Article history cursor')
      throw new HTTPException(400, { message: error.message })
    throw error
  }
})

app.openapi(articleHighlightsRoute, async (context) => {
  const id = context.req.valid('param').mediaItemId
  const query = context.req.valid('query')
  try {
    const result = await createArticlesRepository(
      context.env.DB,
      context.get('databaseUsageObserver'),
    ).listArticleHighlights(id, {
      limit: query.limit,
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    })
    return context.json(ArticleHighlightsResponseSchema.parse(result), 200)
  } catch (error) {
    if (error instanceof TypeError && error.message === 'Invalid Article highlight cursor')
      throw new HTTPException(400, { message: error.message })
    throw error
  }
})

app.openapi(moviesRoute, async (context) => {
  const query = context.req.valid('query')
  try {
    const page = await createMoviesRepository(
      context.env.DB,
      context.get('databaseUsageObserver'),
    ).listMovies({
      collection: query.collection,
      ...(query.q === undefined ? {} : { q: query.q }),
      watchedMode: query.watched,
      ...(query.watchedFrom === undefined ? {} : { watchedFrom: query.watchedFrom }),
      ...(query.watchedTo === undefined ? {} : { watchedTo: query.watchedTo }),
      addedMode: query.added,
      ...(query.addedFrom === undefined ? {} : { addedFrom: query.addedFrom }),
      ...(query.addedTo === undefined ? {} : { addedTo: query.addedTo }),
      ...(query.releaseYearFrom === undefined ? {} : { releaseYearFrom: query.releaseYearFrom }),
      ...(query.releaseYearTo === undefined ? {} : { releaseYearTo: query.releaseYearTo }),
      releaseYearUnknown: query.releaseYearUnknown,
      ratingMode: query.rating,
      ...(query.ratingMin === undefined ? {} : { ratingMin: query.ratingMin }),
      ...(query.ratingMax === undefined ? {} : { ratingMax: query.ratingMax }),
      reviewed: query.reviewed,
      archive: query.archive,
      runtime: query.runtime,
      runtimeUnknown: query.runtimeUnknown,
      ...(query.sort === undefined ? {} : { sort: query.sort }),
      ...(query.direction === undefined ? {} : { direction: query.direction }),
      limit: query.limit,
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    })
    return context.json(MoviesResponseSchema.parse(page), 200)
  } catch (error) {
    if (error instanceof TypeError && error.message === 'Invalid Movies pagination cursor') {
      throw new HTTPException(400, { message: error.message })
    }
    throw error
  }
})

app.openapi(movieDetailRoute, async (context) => {
  const id = context.req.valid('param').mediaItemId
  const movie = await createMoviesRepository(
    context.env.DB,
    context.get('databaseUsageObserver'),
  ).findMovie(id)
  if (movie !== null) return context.json(MovieDetailSchema.parse(movie), 200)
  return context.json(
    ApiErrorSchema.parse({
      error: {
        code: 'NOT_FOUND',
        message: `No movie exists with media item ID ${id}.`,
        requestId: context.get('requestId'),
      },
    }),
    404,
  )
})

app.openapi(movieHistoryRoute, async (context) => {
  const id = context.req.valid('param').mediaItemId
  const query = context.req.valid('query')
  try {
    const history = await createMoviesRepository(
      context.env.DB,
      context.get('databaseUsageObserver'),
    ).listMovieHistory(id, {
      limit: query.limit,
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      watchedMode: query.watched,
      ...(query.watchedFrom === undefined ? {} : { watchedFrom: query.watchedFrom }),
      ...(query.watchedTo === undefined ? {} : { watchedTo: query.watchedTo }),
    })
    return context.json(MovieHistoryResponseSchema.parse(history), 200)
  } catch (error) {
    if (error instanceof TypeError && error.message === 'Invalid Movie history cursor') {
      throw new HTTPException(400, { message: error.message })
    }
    throw error
  }
})

app.openapi(tmdbCatalogSyncRoute, async (context) => {
  if (context.env.TMDB_API_READ_TOKEN === undefined)
    return context.json(
      ApiErrorSchema.parse({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'TMDB is not configured.',
          requestId: context.get('requestId'),
        },
      }),
      503,
    )
  const job = await startTmdbCatalogRefresh({
    ...context.env,
    DATABASE_USAGE_OBSERVER: context.get('databaseUsageObserver'),
  })
  return context.json(
    CatalogSyncResponseSchema.parse({
      jobId: job.id,
      provider: job.provider,
      state: job.state,
      requestedCount: job.requestedCount,
      returnedCount: job.returnedCount,
      omittedCount: job.omittedCount,
    }),
    202,
  )
})

app.openapi(podcastsRoute, async (context) => {
  const query = context.req.valid('query')
  try {
    const repository = createSpotifyLibraryRepository(
      context.env.DB,
      context.get('databaseUsageObserver'),
    )
    const page = await repository.listPodcasts({
      view: query.view,
      ...(query.q === undefined ? {} : { q: query.q }),
      show: query.show,
      following: query.following,
      ...(query.dateFrom === undefined ? {} : { dateFrom: query.dateFrom }),
      ...(query.dateTo === undefined ? {} : { dateTo: query.dateTo }),
      dateUnknown: query.dateUnknown,
      ...(query.publishedFrom === undefined ? {} : { publishedFrom: query.publishedFrom }),
      ...(query.publishedTo === undefined ? {} : { publishedTo: query.publishedTo }),
      publishedUnknown: query.publishedUnknown,
      publisher: query.publisher,
      language: query.language,
      libraryEpisodes: query.libraryEpisodes,
      duration: query.duration,
      ...(query.sort === undefined ? {} : { sort: query.sort }),
      ...(query.direction === undefined ? {} : { direction: query.direction }),
      limit: query.limit,
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    })
    return context.json(
      PodcastsResponseSchema.parse({ ...page, coverage: await repository.coverage() }),
      200,
    )
  } catch (error) {
    if (error instanceof TypeError && error.message === 'Invalid Spotify Library pagination cursor')
      throw new HTTPException(400, { message: error.message })
    throw error
  }
})

app.openapi(podcastFilterOptionsRoute, async (context) => {
  const query = context.req.valid('query')
  try {
    const page = await createSpotifyLibraryRepository(
      context.env.DB,
      context.get('databaseUsageObserver'),
    ).listPodcastFilterOptions(
      {
        view: query.view,
        ...(query.q === undefined ? {} : { q: query.q }),
        show: query.show,
        following: query.following,
        ...(query.dateFrom === undefined ? {} : { dateFrom: query.dateFrom }),
        ...(query.dateTo === undefined ? {} : { dateTo: query.dateTo }),
        dateUnknown: query.dateUnknown,
        ...(query.publishedFrom === undefined ? {} : { publishedFrom: query.publishedFrom }),
        ...(query.publishedTo === undefined ? {} : { publishedTo: query.publishedTo }),
        publishedUnknown: query.publishedUnknown,
        publisher: query.publisher,
        language: query.language,
        libraryEpisodes: query.libraryEpisodes,
        duration: query.duration,
        limit: query.limit,
      },
      query.facet,
      query.optionQ,
      query.optionLimit,
      query.optionCursor,
    )
    return context.json(PodcastFilterOptionsResponseSchema.parse(page), 200)
  } catch (error) {
    if (error instanceof TypeError && error.message === 'Invalid Spotify Library pagination cursor')
      throw new HTTPException(400, { message: error.message })
    throw error
  }
})

app.openapi(podcastDetailRoute, async (context) => {
  const { kind, id } = context.req.valid('param')
  const repository = createSpotifyLibraryRepository(
    context.env.DB,
    context.get('databaseUsageObserver'),
  )
  const item =
    kind === 'shows' ? await repository.findPodcastShow(id) : await repository.findPodcast(id)
  if (item !== null) return context.json(PodcastDetailSchema.parse(item), 200)
  return context.json(
    ApiErrorSchema.parse({
      error: {
        code: 'NOT_FOUND',
        message: `No podcast item exists with ID ${id}.`,
        requestId: context.get('requestId'),
      },
    }),
    404,
  )
})

app.openapi(podcastHistoryRoute, async (context) => {
  const { id } = context.req.valid('param')
  const query = context.req.valid('query')
  try {
    const page = await createSpotifyLibraryRepository(
      context.env.DB,
      context.get('databaseUsageObserver'),
    ).listPodcastHistory(id, query.limit, query.cursor)
    return context.json(PodcastHistoryResponseSchema.parse(page), 200)
  } catch (error) {
    if (error instanceof TypeError && error.message === 'Invalid Spotify Library pagination cursor')
      throw new HTTPException(400, { message: error.message })
    throw error
  }
})

app.openapi(musicRoute, async (context) => {
  const query = context.req.valid('query')
  try {
    const repository = createSpotifyLibraryRepository(
      context.env.DB,
      context.get('databaseUsageObserver'),
    )
    const page = await repository.listMusic({
      view: query.view,
      ...(query.q === undefined ? {} : { q: query.q }),
      ...(query.from === undefined ? {} : { from: query.from }),
      ...(query.to === undefined ? {} : { to: query.to }),
      source: query.source,
      ...(query.minPlaybacks === undefined ? {} : { minPlaybacks: query.minPlaybacks }),
      playbackCount: query.playbackCount,
      metadata: query.metadata,
      artist: query.artist,
      album: query.album,
      explicit: query.explicit,
      albumType: query.albumType,
      ...(query.sort === undefined ? {} : { sort: query.sort }),
      ...(query.direction === undefined ? {} : { direction: query.direction }),
      limit: query.limit,
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    })
    return context.json(
      MusicResponseSchema.parse({ ...page, coverage: await repository.coverage() }),
      200,
    )
  } catch (error) {
    if (error instanceof TypeError && error.message === 'Invalid Spotify Library pagination cursor')
      throw new HTTPException(400, { message: error.message })
    throw error
  }
})

app.openapi(musicFilterOptionsRoute, async (context) => {
  const query = context.req.valid('query')
  try {
    const page = await createSpotifyLibraryRepository(
      context.env.DB,
      context.get('databaseUsageObserver'),
    ).listMusicFilterOptions(
      {
        view: query.view,
        ...(query.q === undefined ? {} : { q: query.q }),
        ...(query.from === undefined ? {} : { from: query.from }),
        ...(query.to === undefined ? {} : { to: query.to }),
        source: query.source,
        ...(query.minPlaybacks === undefined ? {} : { minPlaybacks: query.minPlaybacks }),
        playbackCount: query.playbackCount,
        metadata: query.metadata,
        artist: query.artist,
        album: query.album,
        explicit: query.explicit,
        albumType: query.albumType,
        limit: query.limit,
      },
      query.facet,
      query.optionQ,
      query.optionLimit,
      query.optionCursor,
    )
    return context.json(MusicFilterOptionsResponseSchema.parse(page), 200)
  } catch (error) {
    if (error instanceof TypeError && error.message === 'Invalid Spotify Library pagination cursor')
      throw new HTTPException(400, { message: error.message })
    throw error
  }
})

app.openapi(musicDetailRoute, async (context) => {
  const { kind, id } = context.req.valid('param')
  const item = await createSpotifyLibraryRepository(
    context.env.DB,
    context.get('databaseUsageObserver'),
  ).findMusic(id, kind === 'tracks' ? 'track' : kind === 'albums' ? 'album' : 'artist')
  if (item !== null) return context.json(MusicDetailSchema.parse(item), 200)
  return context.json(
    ApiErrorSchema.parse({
      error: {
        code: 'NOT_FOUND',
        message: `No music item exists with ID ${id}.`,
        requestId: context.get('requestId'),
      },
    }),
    404,
  )
})

app.openapi(musicHistoryRoute, async (context) => {
  const { kind, id } = context.req.valid('param')
  const query = context.req.valid('query')
  try {
    const page = await createSpotifyLibraryRepository(
      context.env.DB,
      context.get('databaseUsageObserver'),
    ).listMusicHistory(
      id,
      kind === 'tracks' ? 'track' : kind === 'albums' ? 'album' : 'artist',
      query.limit,
      query.cursor,
    )
    return context.json(MusicHistoryResponseSchema.parse(page), 200)
  } catch (error) {
    if (error instanceof TypeError && error.message === 'Invalid Spotify Library pagination cursor')
      throw new HTTPException(400, { message: error.message })
    throw error
  }
})

app.openapi(videosRoute, async (context) => {
  const query = context.req.valid('query')
  try {
    const page = await createVideosRepository(
      context.env.DB,
      context.get('databaseUsageObserver'),
    ).listVideos({
      view: query.view,
      ...(query.q === undefined ? {} : { q: query.q }),
      account: query.account,
      channel: query.channel,
      ...(query.watchedFrom === undefined ? {} : { watchedFrom: query.watchedFrom }),
      ...(query.watchedTo === undefined ? {} : { watchedTo: query.watchedTo }),
      watchedUnknown: query.watchedUnknown,
      ...(query.addedFrom === undefined ? {} : { addedFrom: query.addedFrom }),
      ...(query.addedTo === undefined ? {} : { addedTo: query.addedTo }),
      addedUnknown: query.addedUnknown,
      published: query.published,
      ...(query.publishedFrom === undefined ? {} : { publishedFrom: query.publishedFrom }),
      ...(query.publishedTo === undefined ? {} : { publishedTo: query.publishedTo }),
      duration: query.duration,
      durationUnknown: query.durationUnknown,
      watchCount: query.watchCount,
      overlap: query.overlap,
      format: query.format,
      availability: query.availability,
      category: query.category,
      ...(query.sort === undefined ? {} : { sort: query.sort }),
      ...(query.direction === undefined ? {} : { direction: query.direction }),
      limit: query.limit,
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    })
    return context.json(VideosResponseSchema.parse(page), 200)
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('Videos pagination cursor'))
      throw new HTTPException(400, { message: error.message })
    throw error
  }
})

app.openapi(videoDetailRoute, async (context) => {
  const id = context.req.valid('param').id
  const item = await createVideosRepository(
    context.env.DB,
    context.get('databaseUsageObserver'),
  ).findVideo(id)
  if (item !== null) return context.json(VideoDetailSchema.parse(item), 200)
  return context.json(
    ApiErrorSchema.parse({
      error: {
        code: 'NOT_FOUND',
        message: `No video exists with ID ${id}.`,
        requestId: context.get('requestId'),
      },
    }),
    404,
  )
})

app.openapi(videoHistoryRoute, async (context) => {
  const id = context.req.valid('param').id
  const query = context.req.valid('query')
  try {
    const page = await createVideosRepository(
      context.env.DB,
      context.get('databaseUsageObserver'),
    ).listHistory(id, query.limit, query.cursor)
    return context.json(VideoHistoryResponseSchema.parse(page), 200)
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('Videos pagination cursor'))
      throw new HTTPException(400, { message: error.message })
    throw error
  }
})

app.openapi(videoChannelDetailRoute, async (context) => {
  const id = context.req.valid('param').id
  const item = await createVideosRepository(
    context.env.DB,
    context.get('databaseUsageObserver'),
  ).findChannel(id)
  if (item !== null) return context.json(VideoChannelDetailSchema.parse(item), 200)
  return context.json(
    ApiErrorSchema.parse({
      error: {
        code: 'NOT_FOUND',
        message: `No Library channel exists with ID ${id}.`,
        requestId: context.get('requestId'),
      },
    }),
    404,
  )
})

app.openapi(videoChannelLibraryRoute, async (context) => {
  const id = context.req.valid('param').id
  const query = context.req.valid('query')
  try {
    const page = await createVideosRepository(
      context.env.DB,
      context.get('databaseUsageObserver'),
    ).listChannelVideos(id, query.membership, query.limit, query.cursor)
    return context.json(VideoChannelLibraryResponseSchema.parse(page), 200)
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('Videos pagination cursor'))
      throw new HTTPException(400, { message: error.message })
    throw error
  }
})

app.openapi(youtubeCatalogSyncRoute, async (context) => {
  if (context.env.YOUTUBE_API_KEY === undefined)
    return context.json(
      ApiErrorSchema.parse({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'YouTube Data API is not configured.',
          requestId: context.get('requestId'),
        },
      }),
      503,
    )
  const job = await startYoutubeCatalogRefresh({
    ...context.env,
    DATABASE_USAGE_OBSERVER: context.get('databaseUsageObserver'),
  })
  return context.json(
    CatalogSyncResponseSchema.parse({
      jobId: job.id,
      provider: job.provider,
      state: job.state,
      requestedCount: job.requestedCount,
      returnedCount: job.returnedCount,
      omittedCount: job.omittedCount,
    }),
    202,
  )
})

app.openapi(readwiseSyncRoute, async (context) => {
  try {
    return context.json(
      ReadwiseSyncResponseSchema.parse(
        await syncReadwiseArchive({
          ...context.env,
          DATABASE_USAGE_OBSERVER: context.get('databaseUsageObserver'),
        }),
      ),
      200,
    )
  } catch (error) {
    if (!(error instanceof ReadwiseTokenMissingError)) throw error
    return context.json(
      ApiErrorSchema.parse({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Readwise is not configured. Add READWISE_TOKEN to the Worker secrets.',
          requestId: context.get('requestId'),
        },
      }),
      503,
    )
  }
})

app.openapi(hardcoverSyncRoute, async (context) => {
  try {
    return context.json(
      HardcoverSyncResponseSchema.parse(
        await syncHardcover({
          ...context.env,
          DATABASE_USAGE_OBSERVER: context.get('databaseUsageObserver'),
        }),
      ),
      200,
    )
  } catch (error) {
    if (!(error instanceof HardcoverTokenMissingError)) throw error
    return context.json(
      ApiErrorSchema.parse({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Hardcover is not configured. Add HARDCOVER_TOKEN to the Worker secrets.',
          requestId: context.get('requestId'),
        },
      }),
      503,
    )
  }
})

app.openapi(letterboxdImportRoute, async (context) => {
  const declaredLength = Number(context.req.header('content-length') ?? '0')
  if (Number.isFinite(declaredLength) && declaredLength > 25 * 1024 * 1024) {
    return context.json(
      ApiErrorSchema.parse({
        error: {
          code: 'BAD_REQUEST',
          message: 'Letterboxd exports must be 25 MB or smaller.',
          requestId: context.get('requestId'),
        },
      }),
      400,
    )
  }

  try {
    const archive = new Uint8Array(await context.req.arrayBuffer())
    if (archive.byteLength > 25 * 1024 * 1024) {
      throw new LetterboxdImportError('Letterboxd exports must be 25 MB or smaller.')
    }
    return context.json(
      LetterboxdImportResponseSchema.parse(
        await importLetterboxdExport(
          { ...context.env, DATABASE_USAGE_OBSERVER: context.get('databaseUsageObserver') },
          archive,
        ),
      ),
      200,
    )
  } catch (error) {
    if (!(error instanceof LetterboxdImportError)) throw error
    return context.json(
      ApiErrorSchema.parse({
        error: {
          code: 'BAD_REQUEST',
          message: error.message,
          requestId: context.get('requestId'),
        },
      }),
      400,
    )
  }
})

app.openapi(letterboxdSyncRoute, async (context) => {
  try {
    return context.json(
      LetterboxdRssSyncResponseSchema.parse(
        await syncLetterboxdRss({
          ...context.env,
          DATABASE_USAGE_OBSERVER: context.get('databaseUsageObserver'),
        }),
      ),
      200,
    )
  } catch (error) {
    if (!(error instanceof LetterboxdRssConfigurationError)) throw error
    return context.json(
      ApiErrorSchema.parse({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Letterboxd RSS is not configured. Add LETTERBOXD_USERNAME.',
          requestId: context.get('requestId'),
        },
      }),
      503,
    )
  }
})

app.openapi(spotifyImportRoute, async (context) => {
  const declaredLength = Number(context.req.header('content-length') ?? '0')
  if (Number.isFinite(declaredLength) && declaredLength > 25 * 1024 * 1024) {
    return context.json(
      ApiErrorSchema.parse({
        error: {
          code: 'BAD_REQUEST',
          message: 'Spotify exports must be 25 MB or smaller.',
          requestId: context.get('requestId'),
        },
      }),
      400,
    )
  }

  try {
    const archive = new Uint8Array(await context.req.arrayBuffer())
    if (archive.byteLength > 25 * 1024 * 1024) {
      throw new SpotifyImportError('Spotify exports must be 25 MB or smaller.')
    }
    return context.json(
      SpotifyImportResponseSchema.parse(
        await importSpotifyExtendedHistory(
          { ...context.env, DATABASE_USAGE_OBSERVER: context.get('databaseUsageObserver') },
          archive,
        ),
      ),
      200,
    )
  } catch (error) {
    if (!(error instanceof SpotifyImportError)) throw error
    return context.json(
      ApiErrorSchema.parse({
        error: {
          code: 'BAD_REQUEST',
          message: error.message,
          requestId: context.get('requestId'),
        },
      }),
      400,
    )
  }
})

app.openapi(spotifyImportContinueRoute, async (context) => {
  try {
    return context.json(
      SpotifyImportResponseSchema.parse(
        await continueSpotifyExtendedHistoryImport(
          { ...context.env, DATABASE_USAGE_OBSERVER: context.get('databaseUsageObserver') },
          context.req.valid('param').importId,
        ),
      ),
      200,
    )
  } catch (error) {
    if (!(error instanceof SpotifyImportError)) throw error
    return context.json(
      ApiErrorSchema.parse({
        error: {
          code: 'BAD_REQUEST',
          message: error.message,
          requestId: context.get('requestId'),
        },
      }),
      400,
    )
  }
})

app.openapi(spotifySyncRoute, async (context) => {
  try {
    return context.json(
      SpotifySyncResponseSchema.parse(
        await syncSpotifySavedEpisodes({
          ...context.env,
          DATABASE_USAGE_OBSERVER: context.get('databaseUsageObserver'),
        }),
      ),
      200,
    )
  } catch (error) {
    if (!(error instanceof SpotifyCredentialsMissingError)) throw error
    return context.json(
      ApiErrorSchema.parse({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Spotify is not configured. Add its client ID and refresh token.',
          requestId: context.get('requestId'),
        },
      }),
      503,
    )
  }
})

app.openapi(spotifyCatalogSyncRoute, async (context) => {
  if (
    !context.env.SPOTIFY_CLIENT_ID ||
    !context.env.SPOTIFY_REFRESH_TOKEN ||
    !context.env.TOKEN_ENCRYPTION_KEY
  )
    return context.json(
      ApiErrorSchema.parse({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Spotify catalog credentials are not configured.',
          requestId: context.get('requestId'),
        },
      }),
      503,
    )
  const id = await startSpotifyCatalogBackfill({
    ...context.env,
    DATABASE_USAGE_OBSERVER: context.get('databaseUsageObserver'),
  })
  const status = await spotifyCatalogJobStatus(
    { ...context.env, DATABASE_USAGE_OBSERVER: context.get('databaseUsageObserver') },
    id,
  )
  if (status === null) throw new Error('Created Spotify catalog job was not found')
  return context.json(SpotifyCatalogJobResponseSchema.parse(status), 202)
})

app.openapi(spotifyCatalogJobRoute, async (context) => {
  const status = await spotifyCatalogJobStatus(
    { ...context.env, DATABASE_USAGE_OBSERVER: context.get('databaseUsageObserver') },
    context.req.valid('param').jobId,
  )
  if (status === null)
    return context.json(
      ApiErrorSchema.parse({
        error: {
          code: 'NOT_FOUND',
          message: 'Spotify catalog job not found.',
          requestId: context.get('requestId'),
        },
      }),
      404,
    )
  return context.json(SpotifyCatalogJobResponseSchema.parse(status), 200)
})

app.openapi(youtubeImportRoute, async (context) => {
  const declaredLength = Number(context.req.header('content-length') ?? '0')
  if (Number.isFinite(declaredLength) && declaredLength > 25 * 1024 * 1024) {
    return context.json(
      ApiErrorSchema.parse({
        error: {
          code: 'BAD_REQUEST',
          message: 'YouTube Takeout exports must be 25 MB or smaller.',
          requestId: context.get('requestId'),
        },
      }),
      400,
    )
  }

  try {
    const archive = new Uint8Array(await context.req.arrayBuffer())
    if (archive.byteLength > 25 * 1024 * 1024) {
      throw new YoutubeTakeoutImportError('YouTube Takeout exports must be 25 MB or smaller.')
    }
    const connectionKey = context.req.query('connectionKey')
    const connectionId = context.req.query('connectionId')
    const connectionLabel = context.req.query('connectionLabel')
    return context.json(
      YoutubeImportResponseSchema.parse(
        await importYoutubeTakeout(
          { ...context.env, DATABASE_USAGE_OBSERVER: context.get('databaseUsageObserver') },
          archive,
          {
            ...(connectionKey === undefined ? {} : { connectionKey }),
            ...(connectionId === undefined ? {} : { connectionId }),
            ...(connectionLabel === undefined ? {} : { connectionLabel }),
          },
        ),
      ),
      200,
    )
  } catch (error) {
    if (!(error instanceof YoutubeTakeoutImportError)) throw error
    return context.json(
      ApiErrorSchema.parse({
        error: {
          code: 'BAD_REQUEST',
          message: error.message,
          requestId: context.get('requestId'),
        },
      }),
      400,
    )
  }
})

app.openapi(youtubeImportContinueRoute, async (context) => {
  try {
    const connectionKey = context.req.query('connectionKey')
    const connectionId = context.req.query('connectionId')
    const connectionLabel = context.req.query('connectionLabel')
    return context.json(
      YoutubeImportResponseSchema.parse(
        await continueYoutubeTakeoutImport(
          { ...context.env, DATABASE_USAGE_OBSERVER: context.get('databaseUsageObserver') },
          context.req.valid('param').importId,
          {
            ...(connectionKey === undefined ? {} : { connectionKey }),
            ...(connectionId === undefined ? {} : { connectionId }),
            ...(connectionLabel === undefined ? {} : { connectionLabel }),
          },
        ),
      ),
      200,
    )
  } catch (error) {
    if (!(error instanceof YoutubeTakeoutImportError)) throw error
    return context.json(
      ApiErrorSchema.parse({
        error: {
          code: 'BAD_REQUEST',
          message: error.message,
          requestId: context.get('requestId'),
        },
      }),
      400,
    )
  }
})

app.openapi(connectionsRoute, async (context) => {
  const repository = createLedgerRepository(context.env.DB, context.get('databaseUsageObserver'))
  const connections = await repository.listConnections()
  const sources = ['readwise', 'hardcover', 'letterboxd', 'spotify', 'youtube'] as const
  const data = []
  for (const source of sources) {
    const matches = connections.filter((c) => c.source === source)
    if (matches.length === 0)
      data.push({
        id: null,
        label: source,
        source,
        status: 'disconnected',
        coverage: null,
        lastSuccessfulSyncAt: null,
        lastAttemptedSyncAt: null,
        lastExportAt: null,
        incompleteImports: [],
      })
    for (const connection of matches) {
      const activity = await repository.connectionActivity(connection.id)
      data.push({
        id: connection.id,
        label: connection.label,
        source,
        status: connection.status,
        coverage: connection.coverage,
        ...activity,
        lastSuccessfulSyncAt: await repository.findLastSuccessfulSyncAt(connection.id),
        incompleteImports: await repository.listIncompleteImports(connection.id),
      })
    }
  }
  return context.json(ConnectionsResponseSchema.parse({ data }), 200)
})

app.openapi(syncRunsRoute, async (context) => {
  const { limit, cursor } = context.req.valid('query')
  try {
    const page = await createLedgerRepository(
      context.env.DB,
      context.get('databaseUsageObserver'),
    ).listSyncRuns(limit, cursor)
    return context.json(SyncRunsResponseSchema.parse(page), 200)
  } catch (error) {
    if (error instanceof TypeError && error.message === 'Invalid pagination cursor')
      throw new HTTPException(400, { message: error.message })
    throw error
  }
})

app.doc('/api/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'Imladris API',
    version: apiVersion,
  },
})

app.notFound((context) => {
  return context.json(
    ApiErrorSchema.parse({
      error: {
        code: 'NOT_FOUND',
        message: 'The requested API route does not exist.',
        requestId: context.get('requestId'),
      },
    }),
    404,
  )
})

app.onError((error, context) => {
  const status = error instanceof HTTPException ? error.status : 500
  const code: ApiError['error']['code'] =
    status === 400 ? 'BAD_REQUEST' : status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR'

  console.error(
    JSON.stringify({
      level: 'error',
      event: 'request.failed',
      requestId: context.get('requestId'),
      status,
      errorName: error.name,
      errorMessage: error.message.slice(0, 500),
    }),
  )

  return context.json(
    ApiErrorSchema.parse({
      error: {
        code,
        message:
          status === 400
            ? 'Invalid request parameters.'
            : status === 404
              ? 'The requested resource was not found.'
              : 'An unexpected error occurred.',
        requestId: context.get('requestId'),
      },
    }),
    status,
  )
})

export default app
