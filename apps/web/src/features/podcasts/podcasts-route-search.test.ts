import { describe, expect, it } from 'vitest'
import { normalizePodcastSearch, podcastQuerySearch } from './podcasts-route-search'

describe('Podcast route search', () => {
  it('keeps inspector and layout state out of the collection request key', () => {
    expect(
      podcastQuerySearch({
        q: 'history',
        item: 'episode-1',
        kind: 'episode',
        layout: 'grid',
        sort: 'title',
      }),
    ).toEqual({ q: 'history', sort: 'title' })
  })
  it('clears incompatible sorts when sections change', () => {
    expect(
      normalizePodcastSearch({ sort: 'observedTime', direction: 'desc' }, 'following'),
    ).toEqual({})
  })
})
