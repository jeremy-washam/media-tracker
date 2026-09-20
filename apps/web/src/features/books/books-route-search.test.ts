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
})
