import { describe, expect, it } from 'vitest'

import {
  BooksQuerySchema,
  HealthResponseSchema,
  MediaTypeSchema,
  MovieDetailSchema,
  MoviesQuerySchema,
  SyncJobSchema,
} from './index'

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

  it('validates collection-specific Books sorts and rating requirements', () => {
    expect(BooksQuerySchema.safeParse({ collection: 'archive', sort: 'recent_read' }).success).toBe(
      true,
    )
    expect(BooksQuerySchema.safeParse({ collection: 'queue', sort: 'recent_read' }).success).toBe(
      false,
    )
    expect(
      BooksQuerySchema.safeParse({ collection: 'archive', ratingMode: 'minimum' }).success,
    ).toBe(false)
  })

  it('validates collection-specific Movies sorts and required filter bounds', () => {
    expect(MoviesQuerySchema.safeParse({ collection: 'archive', sort: 'watchedAt' }).success).toBe(
      true,
    )
    expect(MoviesQuerySchema.safeParse({ collection: 'queue', sort: 'watchedAt' }).success).toBe(
      false,
    )
    expect(MoviesQuerySchema.safeParse({ collection: 'archive', watched: 'range' }).success).toBe(
      false,
    )
    expect(MoviesQuerySchema.safeParse({ collection: 'queue', rating: 'range' }).success).toBe(
      false,
    )
  })

  it('requires an occurrence count for reviewed movie details', () => {
    expect(
      MovieDetailSchema.shape.personal.safeParse({
        currentRating: 4,
        liked: false,
        reviewed: true,
        reviewedOccurrenceCount: 2,
      }).success,
    ).toBe(true)
    expect(
      MovieDetailSchema.shape.personal.safeParse({
        currentRating: 4,
        liked: false,
        reviewed: true,
      }).success,
    ).toBe(false)
  })
})
