import { describe, expect, it } from 'vitest'

import {
  movieCollectionQuerySearch,
  normalizedForMovieCollection,
  parseMoviesRouteSearch,
} from './movies-route-search'

describe('Movies route search', () => {
  it('keeps presentation selection out of collection requests', () => {
    expect(movieCollectionQuerySearch({ q: 'alien', view: 'list', item: 'movie-1' })).toEqual({
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
  })

  it('validates supported URL values', () => {
    expect(
      parseMoviesRouteSearch({
        view: 'list',
        ratingMin: '4.5',
        releaseYearUnknown: 'true',
        watchedFrom: '2020-01-01',
        watchedTo: 'not-a-date',
      }),
    ).toEqual({
      view: 'list',
      ratingMin: 4.5,
      releaseYearUnknown: true,
      watchedFrom: '2020-01-01',
    })
  })
})
