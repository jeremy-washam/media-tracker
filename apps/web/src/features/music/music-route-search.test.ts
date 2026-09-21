import { describe, expect, it } from 'vitest'
import { musicQuerySearch, normalizeMusicSearch } from './music-route-search'

describe('Music route search', () => {
  it('keeps inspector and layout state out of the collection request key', () => {
    expect(
      musicQuerySearch({ q: 'track', item: 'track-1', layout: 'grid', sort: 'title' }),
    ).toEqual({ q: 'track', sort: 'title' })
  })
  it('clears incompatible sorts when views change', () => {
    expect(normalizeMusicSearch({ sort: 'album', direction: 'asc' }, 'artists')).toEqual({})
  })
})
