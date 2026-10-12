import { describe, expect, it } from 'vitest'

import { collectionQuerySearch, normalizedForCollection } from './books-route-search'

describe('Books route search', () => {
  it('clears incompatible collection sorts and their direction', () => {
    expect(
      normalizedForCollection({ sort: 'recent_read', direction: 'asc', layout: 'list' }, 'queue'),
    ).toEqual({ layout: 'list' })
    expect(
      normalizedForCollection({ sort: 'added', direction: 'asc', q: 'Le Guin' }, 'archive'),
    ).toEqual({ q: 'Le Guin' })
    expect(normalizedForCollection({ sort: 'legacy', direction: 'desc' }, 'archive')).toEqual({})
  })

  it('preserves compatible sorts and excludes presentation state from collection queries', () => {
    const archive = normalizedForCollection(
      { sort: 'author', direction: 'desc', layout: 'list', item: 'book-1' },
      'archive',
    )
    expect(archive).toEqual({
      sort: 'author',
      direction: 'desc',
      layout: 'list',
      item: 'book-1',
    })
    expect(collectionQuerySearch(archive)).toEqual({ sort: 'author', direction: 'desc' })
  })
  it('keeps unfinished range drafts out of API queries without dropping other filters', () => {
    for (const [mode, from] of [
      ['finishedMode', 'finishedFrom', 'finishedTo'],
      ['publishedMode', 'publishedFrom', 'publishedTo'],
      ['addedMode', 'addedFrom', 'addedTo'],
    ] as const) {
      expect(collectionQuerySearch({ [mode]: 'range', genre: ['fiction'] })).toEqual({
        genre: ['fiction'],
      })
      expect(collectionQuerySearch({ [mode]: 'range', [from]: '2026-01-01' })).toEqual({
        [mode]: 'range',
        [from]: '2026-01-01',
      })
    }
  })
  it('keeps partial personal dates out of requests while allowing publication years', () => {
    expect(collectionQuerySearch({ finishedMode: 'range', finishedFrom: '2026' })).toEqual({})
    expect(collectionQuerySearch({ addedMode: 'range', addedTo: '2026-01' })).toEqual({})
    expect(collectionQuerySearch({ publishedMode: 'range', publishedFrom: '2026' })).toEqual({
      publishedMode: 'range',
      publishedFrom: '2026',
    })
  })
})
