import { describe, expect, it } from 'vitest'
import {
  parseBooksRouteSearch,
  normalizedForCollection,
  collectionQuerySearch,
} from './features/books/books-route-search'
import {
  parseMoviesRouteSearch,
  normalizedForMovieCollection,
  movieCollectionQuerySearch,
} from './features/movies/movies-route-search'
import {
  parseArticlesRouteSearch,
  normalizedForArticleSection,
  articleCollectionQuerySearch,
} from './features/articles/articles-route-search'
import {
  parsePodcastsRouteSearch,
  normalizePodcastSearch,
  podcastQuerySearch,
} from './features/podcasts/podcasts-route-search'
import {
  parseMusicRouteSearch,
  normalizeMusicSearch,
  musicQuerySearch,
} from './features/music/music-route-search'
import {
  parseVideosRouteSearch,
  normalizeVideoSearch,
  videoQuerySearch,
} from './features/videos/videos-route-search'

describe('Library URL boundary matrix', () => {
  const parsers: [string, (value: Record<string, unknown>) => object, Record<string, unknown>][] = [
    [
      'books',
      parseBooksRouteSearch,
      {
        layout: 'unexpected',
        ratingMode: 'unexpected',
        minRating: -1,
        finishedMode: 'unexpected',
        finishedFrom: 'invalid',
      },
    ],
    [
      'movies',
      parseMoviesRouteSearch,
      {
        view: 'unexpected',
        rating: 'unexpected',
        ratingMin: 1.2,
        watched: 'unexpected',
        watchedFrom: 'invalid',
      },
    ],
    [
      'articles',
      parseArticlesRouteSearch,
      {
        density: 'unexpected',
        type: ['unexpected'],
        progress: ['unexpected'],
        publishedFrom: 'invalid',
      },
    ],
    [
      'podcasts',
      parsePodcastsRouteSearch,
      {
        layout: 'unexpected',
        kind: 'unexpected',
        following: 'unexpected',
        duration: ['unexpected'],
        libraryEpisodes: ['unexpected'],
      },
    ],
    [
      'music',
      parseMusicRouteSearch,
      {
        layout: 'unexpected',
        source: 'unexpected',
        minPlaybacks: -1,
        playbackCount: 'unexpected',
        metadata: 'unexpected',
        explicit: 'unexpected',
        albumType: 'unexpected',
      },
    ],
    [
      'videos',
      parseVideosRouteSearch,
      {
        layout: 'unexpected',
        published: 'unexpected',
        duration: 'unexpected',
        format: ['unexpected'],
        availability: 'unexpected',
        watchCount: 'unexpected',
      },
    ],
  ]
  for (const [name, parse, invalid] of parsers) {
    it(`${name} drops unsupported URL values and empty predicates while retaining a trimmed query and item`, () => {
      expect(
        parse({
          ...invalid,
          q: '  library  ',
          item: '  exact-id  ',
          direction: 'sideways',
          unknown: 'ignored',
        }),
      ).toEqual({ q: 'library', item: 'exact-id' })
      expect(parse({ q: '  ', item: '', direction: null, sort: '', layout: null })).toEqual({})
    })
  }

  const books = {
    archive: ['recent_read', 'earliest_read', 'title', 'author', 'personal_rating', 'published'],
    queue: ['added', 'title', 'author', 'published'],
  } as const
  for (const view of ['archive', 'queue'] as const) {
    it(`Books/${view} preserves every supported sort and drops incompatible predicates`, () => {
      for (const sort of books[view])
        expect(normalizedForCollection({ sort, direction: 'desc' }, view)).toEqual({
          sort,
          direction: 'desc',
        })
      expect(
        normalizedForCollection(
          view === 'archive'
            ? { addedMode: 'range', addedFrom: '2026-01-01' }
            : {
                finishedMode: 'range',
                finishedFrom: '2026-01-01',
                ratingMode: 'minimum',
                minRating: 4,
              },
          view,
        ),
      ).toEqual({})
    })
  }

  const movies = {
    archive: [
      'watchedAt',
      'title',
      'releaseYear',
      'personalRating',
      'watchCount',
      'runtime',
      'relevance',
    ],
    queue: ['addedAt', 'title', 'releaseYear', 'personalRating', 'runtime', 'relevance'],
  }
  for (const view of ['archive', 'queue'] as const) {
    it(`Movies/${view} accepts all supported sorts and requires a query for relevance`, () => {
      for (const sort of movies[view])
        expect(normalizedForMovieCollection({ q: 'test', sort, direction: 'desc' }, view)).toEqual({
          q: 'test',
          sort,
          direction: 'desc',
        })
      expect(normalizedForMovieCollection({ sort: 'relevance', direction: 'asc' }, view)).toEqual(
        {},
      )
    })
  }

  for (const view of ['archive', 'queue', 'feed'] as const) {
    it(`Articles/${view} keeps only the section's date predicates and valid sorts`, () => {
      const result = normalizedForArticleSection(
        {
          archivedFrom: '2026-01-01',
          addedFrom: '2026-01-01',
          arrivedFrom: '2026-01-01',
          sort: 'relevance',
          direction: 'asc',
        },
        view,
      )
      expect(result).toEqual({
        [view === 'archive' ? 'archivedFrom' : view === 'queue' ? 'addedFrom' : 'arrivedFrom']:
          '2026-01-01',
      })
      for (const sort of ['publishedAt', 'title', 'author', 'publication', 'readingTime'])
        expect(normalizedForArticleSection({ sort, direction: 'desc' }, view)).toEqual({
          sort,
          direction: 'desc',
        })
    })
  }

  const podcasts = {
    archive: ['activityAt', 'observedTime', 'publishedAt', 'duration', 'title', 'show'],
    queue: ['savedAt', 'publishedAt', 'duration', 'title', 'show'],
    following: ['title', 'publisher', 'episodeCount', 'savedAt'],
  }
  for (const view of ['archive', 'queue', 'following'] as const) {
    it(`Podcasts/${view} validates section sorts and removes incompatible episode/show predicates`, () => {
      for (const sort of podcasts[view])
        expect(normalizePodcastSearch({ sort, direction: 'desc' }, view)).toEqual({
          sort,
          direction: 'desc',
        })
      expect(
        normalizePodcastSearch(
          view === 'following'
            ? {
                show: ['one'],
                following: 'following',
                duration: ['under30'],
                publishedFrom: '2026-01-01',
                publishedUnknown: true,
              }
            : { publisher: ['one'], language: ['en'], libraryEpisodes: ['archive'] },
          view,
        ),
      ).toEqual({})
      expect(normalizePodcastSearch({ sort: 'relevance', direction: 'asc' }, view)).toEqual({})
    })
  }

  const music = {
    tracks: ['playedAt', 'title', 'artist', 'album', 'playbackCount', 'observedTime'],
    albums: [
      'playedAt',
      'title',
      'artist',
      'playbackCount',
      'observedTime',
      'trackCount',
      'releasedAt',
    ],
    artists: ['playedAt', 'title', 'playbackCount', 'observedTime', 'trackCount', 'releaseCount'],
  }
  for (const view of ['tracks', 'albums', 'artists'] as const) {
    it(`Music/${view} validates section sorts and removes incompatible entity filters`, () => {
      for (const sort of music[view])
        expect(normalizeMusicSearch({ sort, direction: 'desc' }, view)).toEqual({
          sort,
          direction: 'desc',
        })
      expect(
        normalizeMusicSearch(
          view === 'tracks'
            ? { albumType: 'album' }
            : view === 'albums'
              ? { album: ['one'], explicit: 'yes' }
              : { album: ['one'], artist: ['one'], explicit: 'yes', albumType: 'album' },
          view,
        ),
      ).toEqual({})
      expect(normalizeMusicSearch({ sort: 'relevance', direction: 'asc' }, view)).toEqual({})
    })
  }

  const videos = {
    archive: ['watchedAt', 'title', 'channel', 'watchCount', 'publishedAt', 'duration'],
    queue: ['addedAt', 'title', 'channel', 'publishedAt', 'duration'],
    channels: ['watchCount', 'channel', 'watchedAt', 'queueCount'],
  }
  for (const view of ['archive', 'queue', 'channels'] as const) {
    it(`Videos/${view} validates section sorts and resolves mutually exclusive inspector selection`, () => {
      for (const sort of videos[view])
        expect(normalizeVideoSearch({ sort, direction: 'desc' }, view)).toEqual({
          sort,
          direction: 'desc',
        })
      expect(normalizeVideoSearch({ sort: 'relevance', direction: 'asc' }, view)).toEqual({})
      expect(normalizeVideoSearch({ item: 'one', channelItem: 'two' }, view)).toEqual(
        view === 'channels' ? {} : { item: 'one' },
      )
    })
  }

  it('keeps all presentation state out of request predicates across every family', () => {
    expect(collectionQuerySearch({ q: 'test', item: 'one', layout: 'grid' })).toEqual({ q: 'test' })
    expect(movieCollectionQuerySearch({ q: 'test', item: 'one', layout: 'grid' })).toEqual({
      q: 'test',
    })
    expect(articleCollectionQuerySearch({ q: 'test', item: 'one', density: 'expanded' })).toEqual({
      q: 'test',
    })
    expect(podcastQuerySearch({ q: 'test', item: 'one', kind: 'show', layout: 'grid' })).toEqual({
      q: 'test',
    })
    expect(musicQuerySearch({ q: 'test', item: 'one', layout: 'grid' })).toEqual({ q: 'test' })
    expect(
      videoQuerySearch({ q: 'test', item: 'one', channelItem: 'two', layout: 'grid' }),
    ).toEqual({ q: 'test' })
  })
})
