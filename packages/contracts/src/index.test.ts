import { describe, expect, it } from 'vitest'

import { HealthResponseSchema, MediaTypeSchema, SyncJobSchema } from './index'

describe('API contracts', () => {
  it('accepts a valid health response', () => {
    const result = HealthResponseSchema.safeParse({
      status: 'ok',
      service: 'media-tracker-api',
      version: '0.0.0',
      timestamp: '2026-07-18T12:00:00.000Z',
      requestId: 'request-1',
    })

    expect(result.success).toBe(true)
  })

  it('requires queue jobs to carry an idempotency key', () => {
    const result = SyncJobSchema.safeParse({
      idempotencyKey: '',
      source: 'readwise',
      operation: 'backfill',
    })

    expect(result.success).toBe(false)
  })

  it('rejects source records that are not standalone Archive media', () => {
    expect(MediaTypeSchema.safeParse('article').success).toBe(true)
    expect(MediaTypeSchema.safeParse('document').success).toBe(false)
    expect(MediaTypeSchema.safeParse('social_post').success).toBe(false)
    expect(MediaTypeSchema.safeParse('note').success).toBe(false)
    expect(MediaTypeSchema.safeParse('other').success).toBe(false)
  })
})
