import { describe, expect, it } from 'vitest'
import {
  catalogRefreshBefore,
  catalogRetryLimitReached,
  dailyCatalogJobId,
  spotifyStaleBefore,
  retryAfterSeconds,
} from './catalog-policy'

describe('recurring catalog policy', () => {
  it('selects data before expiry without changing the acquisition clock', () => {
    expect(catalogRefreshBefore('2026-10-29T12:00:00.000Z')).toBe('2026-11-05T12:00:00.000Z')
    expect(spotifyStaleBefore('2026-10-29T12:00:00.000Z')).toBe('2026-10-08T12:00:00.000Z')
  })
  it('creates one durable provider job per UTC day even across timezone offsets', () => {
    expect(dailyCatalogJobId('tmdb', '2026-10-29T23:30:00-04:00')).toBe('catalog:tmdb:2026-10-30')
    expect(dailyCatalogJobId('youtube', '2026-10-30T03:30:00Z')).toBe('catalog:youtube:2026-10-30')
  })
  it('preserves Retry-After durations larger than a queue delay and parses HTTP dates', () => {
    expect(retryAfterSeconds('90000')).toBe(90000)
    expect(
      retryAfterSeconds('Wed, 30 Oct 2026 12:00:00 GMT', Date.parse('2026-10-29T12:00:00Z')),
    ).toBe(86400)
    expect(retryAfterSeconds('invalid')).toBe(60)
  })
  it('allows a large progressing refresh but stops repeated reservations without progress', () => {
    expect(catalogRetryLimitReached({ attemptCount: 1001, requestedCount: 10000 }, 10)).toBe(false)
    expect(catalogRetryLimitReached({ attemptCount: 8, requestedCount: 0 }, 10)).toBe(true)
    expect(catalogRetryLimitReached({ attemptCount: 108, requestedCount: 1000 }, 10)).toBe(true)
  })
})
