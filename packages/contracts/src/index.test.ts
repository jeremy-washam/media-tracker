import {
  LIBRARY_PAGE_SIZE,
  ArticlesQuerySchema,
  PodcastsQuerySchema,
  MusicQuerySchema,
  MoviesSummaryQuerySchema,
} from './index'
import { describe, expect, it } from 'vitest'

import {
  BooksQuerySchema,
  MediaTypeSchema,
  MovieDetailSchema,
  MoviesQuerySchema,
  SyncJobSchema,
  SourceSyncQueuedResponseSchema,
  VideosQuerySchema,
} from './index'

describe('API contracts', () => {
  it('distinguishes a queued source receipt from completed work or an allocated run', () => {
    const queued = { status: 'queued', source: 'spotify', requestId: 'request-1' }
    expect(SourceSyncQueuedResponseSchema.parse(queued)).toEqual(queued)
    for (const changes of [
      { status: 'succeeded' },
      { source: 'youtube' },
      { requestId: '' },
      { syncRunId: 'unallocated-run' },
    ])
      expect(SourceSyncQueuedResponseSchema.safeParse({ ...queued, ...changes }).success).toBe(
        false,
      )
  })
  it('requires queue jobs to carry an idempotency key', () => {
    const result = SyncJobSchema.safeParse({
      idempotencyKey: '',
      source: 'readwise',
      operation: 'backfill',
    })

    expect(result.success).toBe(false)
  })

  it('requires provider catalog jobs to name their durable job', () => {
    expect(
      SyncJobSchema.safeParse({
        idempotencyKey: 'catalog:youtube:1',
        source: 'youtube',
        operation: 'refresh_youtube_catalog',
      }).success,
    ).toBe(false)
    expect(
      SyncJobSchema.safeParse({
        idempotencyKey: 'catalog:tmdb:1',
        source: 'tmdb',
        operation: 'refresh_tmdb_catalog',
        catalogJobId: 'job-1',
      }).success,
    ).toBe(true)
    expect(
      SyncJobSchema.safeParse({
        idempotencyKey: 'catalog:spotify:1',
        source: 'spotify',
        operation: 'refresh_spotify_catalog',
        catalogJobId: 'job-1',
      }).success,
    ).toBe(true)
    expect(
      SyncJobSchema.safeParse({
        idempotencyKey: 'catalog:spotify:1',
        source: 'spotify',
        operation: 'refresh_spotify_catalog',
      }).success,
    ).toBe(false)
  })

  it('rejects source records that are not standalone Archive media', () => {
    for (const type of ['article', 'video', 'podcast_episode', 'movie', 'book', 'song'])
      expect(MediaTypeSchema.safeParse(type).success).toBe(true)
    expect(MediaTypeSchema.safeParse('document').success).toBe(false)
    expect(MediaTypeSchema.safeParse('social_post').success).toBe(false)
    expect(MediaTypeSchema.safeParse('note').success).toBe(false)
    expect(MediaTypeSchema.safeParse('other').success).toBe(false)
  })

  it('validates collection-specific Books sorts and rating requirements', () => {
    expect(BooksQuerySchema.safeParse({ section: 'archive', sort: 'recent_read' }).success).toBe(
      true,
    )
    expect(BooksQuerySchema.safeParse({ section: 'queue', sort: 'recent_read' }).success).toBe(
      false,
    )
    expect(BooksQuerySchema.safeParse({ section: 'archive', ratingMode: 'minimum' }).success).toBe(
      false,
    )
  })

  it('validates collection-specific Movies sorts and required filter bounds', () => {
    expect(MoviesQuerySchema.safeParse({ section: 'archive', sort: 'watchedAt' }).success).toBe(
      true,
    )
    expect(MoviesQuerySchema.safeParse({ section: 'queue', sort: 'watchedAt' }).success).toBe(false)
    expect(MoviesQuerySchema.safeParse({ section: 'archive', watched: 'range' }).success).toBe(
      false,
    )
    expect(MoviesQuerySchema.safeParse({ section: 'queue', rating: 'range' }).success).toBe(false)
  })

  it('validates Videos metadata filters and collection-specific dates', () => {
    expect(
      VideosQuerySchema.safeParse({
        section: 'archive',
        published: 'range',
        publishedFrom: '2020-01-01',
        duration: '20to59',
        durationUnknown: 'true',
        availability: 'unchecked',
        category: ['22', '24'],
      }).success,
    ).toBe(true)
    expect(VideosQuerySchema.safeParse({ section: 'archive', published: 'range' }).success).toBe(
      false,
    )
    expect(VideosQuerySchema.safeParse({ section: 'queue', watchedUnknown: 'true' }).success).toBe(
      false,
    )
    expect(VideosQuerySchema.safeParse({ section: 'channels', category: '22' }).success).toBe(false)
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

it('uses one default page size across all Library families', () => {
  for (const schema of [
    BooksQuerySchema,
    MoviesQuerySchema,
    ArticlesQuerySchema,
    PodcastsQuerySchema,
    MusicQuerySchema,
    VideosQuerySchema,
  ])
    expect(schema.parse({}).limit).toBe(LIBRARY_PAGE_SIZE)
  expect(LIBRARY_PAGE_SIZE).toBe(50)
})
it('summary filters preserve section-specific validation', () => {
  expect(MoviesSummaryQuerySchema.safeParse({ section: 'archive', watched: 'range' }).success).toBe(
    false,
  )
  expect(
    MoviesSummaryQuerySchema.safeParse({
      section: 'archive',
      watched: 'range',
      watchedFrom: '2020-01-01',
    }).success,
  ).toBe(true)
})
