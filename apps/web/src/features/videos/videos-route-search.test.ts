import { describe, expect, it } from 'vitest'
import {
  normalizeVideoSearch,
  parseVideosRouteSearch,
  videoQuerySearch,
} from './videos-route-search'

describe('Videos route search', () => {
  it('keeps inspector and layout state out of the collection request key', () => {
    expect(
      videoQuerySearch({
        q: 'history',
        item: 'video-1',
        layout: 'grid',
        sort: 'watchedAt',
      }),
    ).toEqual({ q: 'history', sort: 'watchedAt' })
  })

  it('clears incompatible filters and sorts when sections change', () => {
    expect(
      normalizeVideoSearch(
        { sort: 'watchedAt', direction: 'desc', watchedFrom: '2026-01-01', item: 'video-1' },
        'queue',
      ),
    ).toEqual({ item: 'video-1' })
    expect(
      normalizeVideoSearch({ sort: 'addedAt', direction: 'desc', account: ['a'] }, 'channels'),
    ).toEqual({})
  })

  it('parses repeated and comma-separated filter values without duplicates', () => {
    expect(
      parseVideosRouteSearch({
        format: ['live,youtube_music', 'live'],
        account: ['a', 'a'],
        category: ['22,24', '22'],
        duration: '20to59',
        durationUnknown: 'true',
        availability: 'unchecked',
      }),
    ).toMatchObject({
      format: ['live', 'youtube_music'],
      account: ['a'],
      category: ['22', '24'],
      duration: '20to59',
      durationUnknown: true,
      availability: 'unchecked',
    })
  })

  it('removes every video-only metadata filter from Channels', () => {
    expect(
      normalizeVideoSearch(
        {
          published: 'range',
          publishedFrom: '2020-01-01',
          duration: 'under5',
          durationUnknown: true,
          availability: 'available',
          category: ['22'],
        },
        'channels',
      ),
    ).toEqual({})
  })
})
