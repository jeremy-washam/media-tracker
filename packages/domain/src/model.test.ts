import { describe, expect, it } from 'vitest'

import {
  calendarDate,
  calendarYear,
  calendarMonth,
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

  it.each([
    '2026-02-30T00:00:00Z',
    '2025-02-29T01:02:03+01:00',
    '2026-00-01T00:00:00Z',
    '2026-12-00T00:00:00Z',
    '2026-01-01T24:00:00Z',
    '2026-01-01T00:60:00Z',
    '2026-01-01T00:00:60Z',
    '2026-01-01T00:00:00+24:00',
    '2026-01-01T00:00:00+01:60',
    '2026-01-01Tnot-a-timeZ',
  ])('rejects an impossible source instant without changing its date: %s', (value) => {
    expect(() => utcInstant(value)).toThrow()
  })

  it.each([
    ['2024-02-29T23:30:00-01:00', '2024-03-01T00:30:00.000Z'],
    ['2026-01-01T00:30:00+01:00', '2025-12-31T23:30:00.000Z'],
    ['0099-12-31T23:59:59.123Z', '0099-12-31T23:59:59.123Z'],
    ['0000-02-29T00:00:00Z', '0000-02-29T00:00:00.000Z'],
  ])('preserves valid calendar dates while normalizing %s', (value, expected) => {
    expect(utcInstant(value)).toBe(expected)
  })

  it('validates year and month precision independently of day precision', () => {
    expect(calendarYear('0000')).toBe('0000')
    expect(calendarMonth('0099-02')).toBe('0099-02')
    for (const value of ['99', '10000', '2026-01']) expect(() => calendarYear(value)).toThrow()
    for (const value of ['2026-00', '2026-13', '2026-1'])
      expect(() => calendarMonth(value)).toThrow()
  })
})

describe('canonical ledger semantics', () => {
  it('retains ratings on their original scale', () => {
    expect(sourceRating(4.5, 0, 5)).toEqual({
      value: 4.5,
      scaleMinimum: 0,
      scaleMaximum: 5,
    })
    expect(() => sourceRating(6, 0, 5)).toThrow('within its source scale')
  })

  it('rejects nonfinite values and inverted rating scales', () => {
    for (const [value, minimum, maximum] of [
      [NaN, 0, 5],
      [2, -Infinity, 5],
      [2, 0, Infinity],
    ] as const)
      expect(() => sourceRating(value, minimum, maximum)).toThrow('finite')
    for (const [value, minimum, maximum] of [
      [2, 5, 0],
      [2, 5, 5],
    ] as const)
      expect(() => sourceRating(value, minimum, maximum)).toThrow('minimum')
    expect(sourceRating(-1, -1, 1).value).toBe(-1)
    expect(sourceRating(1, -1, 1).value).toBe(1)
    expect(() => sourceRating(-2, -1, 1)).toThrow('within its source scale')
  })

  it('rejects empty internal identifiers', () => {
    expect(mediaItemId('01K4MEDIAITEM')).toBe('01K4MEDIAITEM')
    expect(() => mediaItemId('  ')).toThrow('cannot be empty')
  })
})
