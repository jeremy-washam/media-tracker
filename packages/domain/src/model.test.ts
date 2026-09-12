import { describe, expect, it } from 'vitest'

import {
  MEDIA_TYPES,
  calendarDate,
  mediaItemId,
  sourceRating,
  temporalDay,
  temporalInstant,
  utcInstant,
} from './index'

describe('canonical temporal values', () => {
  it('retains calendar precision and inference basis', () => {
    expect(temporalDay('2026-09-12', 'inferred')).toEqual({
      basis: 'inferred',
      precision: 'day',
      value: '2026-09-12',
    })
  })

  it('normalizes offset instants to UTC', () => {
    expect(utcInstant('2026-09-12T08:30:00-07:00')).toBe('2026-09-12T15:30:00.000Z')
    expect(temporalInstant('2026-09-12T15:30:00Z')).toEqual({
      basis: 'source_asserted',
      precision: 'instant',
      value: '2026-09-12T15:30:00.000Z',
    })
  })

  it('rejects impossible dates and instants without offsets', () => {
    expect(() => calendarDate('2025-02-29')).toThrow('Invalid calendar date')
    expect(() => utcInstant('2026-09-12T15:30:00')).toThrow('UTC offset')
  })

  it('accepts historical four-digit years without JavaScript year coercion', () => {
    expect(calendarDate('0099-12-31')).toBe('0099-12-31')
  })
})

describe('canonical ledger semantics', () => {
  it('keeps the media vocabulary focused on browsable Archive items', () => {
    expect(MEDIA_TYPES).toEqual(['article', 'video', 'podcast_episode', 'movie', 'book', 'song'])
    expect(MEDIA_TYPES).not.toContain('other')
  })

  it('retains ratings on their original scale', () => {
    expect(sourceRating(4.5, 0, 5)).toEqual({
      value: 4.5,
      scaleMinimum: 0,
      scaleMaximum: 5,
    })
    expect(() => sourceRating(6, 0, 5)).toThrow('within its source scale')
  })

  it('rejects empty internal identifiers', () => {
    expect(mediaItemId('01K4MEDIAITEM')).toBe('01K4MEDIAITEM')
    expect(() => mediaItemId('  ')).toThrow('cannot be empty')
  })
})
