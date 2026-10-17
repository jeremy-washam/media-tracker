import { describe, expect, it } from 'vitest'

import {
  movieCollectionQuerySearch,
  normalizedForMovieCollection,
  parseMoviesRouteSearch,
} from './movies-route-search'

describe('Movies route search', () => {
  it('keeps presentation selection out of collection requests', () => {
    expect(movieCollectionQuerySearch({ q: 'alien', layout: 'list', item: 'movie-1' })).toEqual({
      q: 'alien',
    })
  })

  it('clears incompatible filters, sorts, and direction across collections', () => {
    expect(
      normalizedForMovieCollection(
        { watched: 'unknown', reviewed: 'yes', sort: 'watchCount', direction: 'desc' },
        'queue',
      ),
    ).toEqual({})
    expect(
      normalizedForMovieCollection(
        { added: 'unknown', archive: 'yes', sort: 'addedAt', direction: 'asc' },
        'archive',
      ),
    ).toEqual({})
    expect(normalizedForMovieCollection({ direction: 'asc' }, 'queue')).toEqual({})
    expect(normalizedForMovieCollection({ sort: 'title', direction: 'desc' }, 'queue')).toEqual({
      sort: 'title',
      direction: 'desc',
    })
  })

  it('keeps filter drafts in route state but omits incomplete API predicates', () => {
    const draft = parseMoviesRouteSearch({
      watched: 'range',
      rating: 'range',
      releaseYearFrom: '20',
    })
    expect(draft).toEqual({ watched: 'range', rating: 'range', releaseYearFrom: '20' })
    expect(movieCollectionQuerySearch(draft)).toEqual({})

    expect(
      movieCollectionQuerySearch({
        watched: 'range',
        watchedFrom: '2020-01-01',
        rating: 'range',
        ratingMin: 4,
        releaseYearFrom: '2020',
      }),
    ).toEqual({
      watched: 'range',
      watchedFrom: '2020-01-01',
      rating: 'range',
      ratingMin: 4,
      releaseYearFrom: '2020',
    })
  })

  it('preserves explicit layout from older Movies URLs', () => {
    expect(parseMoviesRouteSearch({ view: 'list' })).toEqual({ layout: 'list' })
    const mergedSearch = { view: 'list', layout: 'list' as const }
    expect(normalizedForMovieCollection(mergedSearch, 'archive')).toEqual({ layout: 'list' })
    expect(movieCollectionQuerySearch(mergedSearch)).toEqual({})
  })

  it('validates supported URL values', () => {
    expect(
      parseMoviesRouteSearch({
        layout: 'list',
        ratingMin: '4.5',
        releaseYearUnknown: 'true',
        watchedFrom: '2020-01-01',
        watchedTo: 'not-a-date',
      }),
    ).toEqual({
      layout: 'list',
      ratingMin: 4.5,
      releaseYearUnknown: true,
      watchedFrom: '2020-01-01',
    })
  })
})
