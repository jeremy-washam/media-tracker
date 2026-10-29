import { describe, expect, it } from 'vitest'
import { clearedCollectionSearch, hasCollectionFilters } from './library-search'

describe('Collection predicate clearing', () => {
  it('distinguishes filtering from presentation and explicit unfiltered defaults', () => {
    expect(
      hasCollectionFilters({
        item: 'one',
        channelItem: 'two',
        layout: 'grid',
        kind: 'episode',
        sort: 'title',
        direction: 'desc',
        source: 'all',
        metadata: 'any',
        artist: [],
        durationUnknown: false,
      }),
    ).toBe(false)
    for (const search of [
      { q: 'unmatched' },
      { artist: ['one'] },
      { watchedUnknown: true },
      { minPlaybacks: 2 },
      { from: '2026-01-01' },
    ])
      expect(hasCollectionFilters(search)).toBe(true)
  })
  it('clears all predicates and inspector state, retains layout/sort, and removes search-only relevance', () => {
    expect(
      clearedCollectionSearch({
        q: 'one',
        item: 'one',
        layout: 'grid',
        artist: ['one'],
        minPlaybacks: 2,
        sort: 'title',
        direction: 'desc',
      }),
    ).toEqual({
      q: undefined,
      item: undefined,
      artist: undefined,
      minPlaybacks: undefined,
      layout: 'grid',
      sort: 'title',
      direction: 'desc',
    })
    expect(clearedCollectionSearch({ q: 'one', sort: 'relevance', direction: 'asc' })).toEqual({
      q: undefined,
      sort: undefined,
      direction: undefined,
    })
  })
})
