import { z } from 'zod'
import { LIBRARY_PAGE_SIZE, librarySummaryQuery } from './library'

export const MovieCollectionSchema = z.enum(['archive', 'queue'])
export const MovieViewSchema = z.enum(['grid', 'list'])
export const MovieSortSchema = z.enum([
  'watchedAt',
  'addedAt',
  'title',
  'releaseYear',
  'personalRating',
  'watchCount',
  'runtime',
  'relevance',
])
export const MovieDateModeSchema = z.enum(['all', 'range', 'unknown'])
export const MovieRatingModeSchema = z.enum(['any', 'rated', 'unrated', 'range'])

const optionalTrimmedString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().optional(),
)
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const year = z.string().regex(/^\d{4}$/)
const booleanQuery = z.preprocess(
  (value) => (value === 'true' ? true : value === 'false' ? false : value),
  z.boolean(),
)

export const MoviesQuerySchema = z
  .object({
    section: MovieCollectionSchema.default('archive'),
    q: optionalTrimmedString,
    watched: MovieDateModeSchema.default('all'),
    watchedFrom: calendarDate.optional(),
    watchedTo: calendarDate.optional(),
    added: MovieDateModeSchema.default('all'),
    addedFrom: calendarDate.optional(),
    addedTo: calendarDate.optional(),
    releaseYearFrom: year.optional(),
    releaseYearTo: year.optional(),
    releaseYearUnknown: booleanQuery.default(false),
    rating: MovieRatingModeSchema.default('any'),
    ratingMin: z.coerce.number().min(0.5).max(5).multipleOf(0.5).optional(),
    ratingMax: z.coerce.number().min(0.5).max(5).multipleOf(0.5).optional(),
    reviewed: z.enum(['any', 'yes', 'no']).default('any'),
    archive: z.enum(['any', 'yes', 'no']).default('any'),
    runtime: z.enum(['any', 'under90', '90to119', '120to149', '150plus']).default('any'),
    runtimeUnknown: booleanQuery.default(false),
    sort: MovieSortSchema.optional(),
    direction: z.enum(['asc', 'desc']).optional(),
    layout: MovieViewSchema.default('grid'),
    limit: z.coerce.number().int().min(1).max(100).default(LIBRARY_PAGE_SIZE),
    cursor: z.string().max(4000).optional(),
  })
  .superRefine((query, context) => {
    const sorts =
      query.section === 'archive'
        ? new Set([
            'watchedAt',
            'title',
            'releaseYear',
            'personalRating',
            'watchCount',
            'runtime',
            'relevance',
          ])
        : new Set(['addedAt', 'title', 'releaseYear', 'personalRating', 'runtime', 'relevance'])
    if (query.sort !== undefined && !sorts.has(query.sort)) {
      context.addIssue({
        code: 'custom',
        path: ['sort'],
        message: `Sort ${query.sort} is not available for ${query.section}.`,
      })
    }
    if (query.sort === 'relevance' && query.q === undefined) {
      context.addIssue({ code: 'custom', path: ['sort'], message: 'Relevance requires search.' })
    }
    for (const [mode, from, to, path] of [
      [query.watched, query.watchedFrom, query.watchedTo, 'watched'],
      [query.added, query.addedFrom, query.addedTo, 'added'],
    ] as const) {
      if (mode === 'range' && from === undefined && to === undefined) {
        context.addIssue({
          code: 'custom',
          path: [path],
          message: 'A date range requires a start or end boundary.',
        })
      }
    }
    if (
      query.rating === 'range' &&
      query.ratingMin === undefined &&
      query.ratingMax === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['rating'],
        message: 'A rating range requires a minimum or maximum.',
      })
    }
    if (
      query.ratingMin !== undefined &&
      query.ratingMax !== undefined &&
      query.ratingMin > query.ratingMax
    ) {
      context.addIssue({
        code: 'custom',
        path: ['ratingMax'],
        message: 'The maximum rating must be at least the minimum.',
      })
    }
  })

export const MovieCollectionItemSchema = z.object({
  id: z.string(),
  displayTitle: z.string(),
  importedTitle: z.string(),
  releaseYear: z
    .string()
    .regex(/^\d{4}$/)
    .nullable(),
  posterUrl: z.string().nullable(),
  directors: z.array(z.string()),
  runtimeMinutes: z.number().int().nonnegative().nullable(),
  personal: z.object({
    currentRating: z.number().min(0.5).max(5).nullable(),
    liked: z.boolean(),
    reviewed: z.boolean(),
  }),
  archive: z.object({
    active: z.boolean(),
    lifetimeWatchCount: z.number().int().nonnegative(),
    matchingWatchCount: z.number().int().nonnegative(),
    latestKnownWatchedOn: calendarDate.nullable(),
    referenceWatchedOn: calendarDate.nullable(),
    hasUnknownWatchedDate: z.boolean(),
  }),
  queue: z.object({ active: z.boolean(), addedOn: calendarDate.nullable() }),
  enrichment: z.object({
    provider: z.literal('tmdb').nullable(),
    mediaType: z.enum(['movie', 'tv']).nullable(),
    status: z.enum(['not_configured', 'pending', 'matched', 'unmatched', 'ambiguous', 'error']),
    refreshedAt: z.string().datetime().nullable(),
  }),
})

export const MoviesResponseSchema = z.object({
  data: z.array(MovieCollectionItemSchema),
  nextCursor: z.string().nullable(),
})

export const MoviesSummarySchema = z.object({
  totalCount: z.number().int().nonnegative(),
  filteredCount: z.number().int().nonnegative(),
  filteredOccurrenceCount: z.number().int().nonnegative().nullable(),
  overlapCount: z.number().int().nonnegative(),
  membershipCounts: z.object({
    archiveItems: z.number().int().nonnegative(),
    archiveOccurrences: z.number().int().nonnegative(),
    queueItems: z.number().int().nonnegative(),
  }),
  facets: z.object({
    watchedUnknown: z.number().int().nonnegative(),
    addedUnknown: z.number().int().nonnegative(),
    releaseYearUnknown: z.number().int().nonnegative(),
    unrated: z.number().int().nonnegative(),
    reviewed: z.number().int().nonnegative(),
    runtimeUnknown: z.number().int().nonnegative(),
    runtimeAvailable: z.boolean(),
  }),
  sourceFreshness: z.object({
    lastCompleteExportAt: z.string().datetime().nullable(),
    lastRssSuccessAt: z.string().datetime().nullable(),
  }),
})

export const MovieDetailSchema = MovieCollectionItemSchema.extend({
  personal: MovieCollectionItemSchema.shape.personal.extend({
    reviewedOccurrenceCount: z.number().int().nonnegative(),
  }),
  overview: z.string().nullable(),
  originalTitle: z.string().nullable(),
  originalLanguage: z.string().nullable(),
  releaseDate: z.string().nullable(),
  tagline: z.string().nullable(),
  backdropUrl: z.string().nullable(),
  genres: z.array(z.string()),
  cast: z.array(z.object({ name: z.string(), character: z.string().nullable() })),
  countries: z.array(z.string()),
  tmdbRating: z.number().nullable(),
  tmdbVoteCount: z.number().int().nonnegative().nullable(),
  source: z.object({
    letterboxdUrl: z.string().url().nullable(),
    tmdbUrl: z.string().url().nullable(),
    imdbUrl: z.string().url().nullable(),
    connectionLabel: z.string(),
    coverage: z.enum(['complete', 'partial', 'best_effort']),
    lastCompleteExportAt: z.string().datetime().nullable(),
    lastRssSuccessAt: z.string().datetime().nullable(),
    metadataStatus: z.enum([
      'not_configured',
      'pending',
      'matched',
      'unmatched',
      'ambiguous',
      'error',
    ]),
  }),
})

export const MovieHistoryQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().max(4000).optional(),
    watched: MovieDateModeSchema.default('all'),
    watchedFrom: calendarDate.optional(),
    watchedTo: calendarDate.optional(),
  })
  .superRefine((query, context) => {
    if (
      query.watched === 'range' &&
      query.watchedFrom === undefined &&
      query.watchedTo === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['watched'],
        message: 'A date range requires a boundary.',
      })
    }
  })

export const MovieHistoryEntrySchema = z.object({
  archiveEntryId: z.string(),
  watchedAt: z
    .object({
      value: calendarDate,
      precision: z.literal('day'),
      basis: z.literal('source_asserted'),
    })
    .nullable(),
  sourceRecordedAt: z
    .object({
      value: z.string(),
      precision: z.enum(['year', 'month', 'day', 'instant']),
      basis: z.enum(['source_asserted', 'inferred']),
    })
    .nullable(),
  rating: z.object({ value: z.number(), minimum: z.number(), maximum: z.number() }).nullable(),
  reviewText: z.string().nullable(),
  sourceRewatch: z.boolean(),
  matchesFilter: z.boolean(),
  letterboxdLogUrl: z.string().url().nullable(),
  letterboxdFilmUrl: z.string().url().nullable(),
  connection: z.object({ id: z.string(), label: z.string() }),
})

export const MovieHistoryResponseSchema = z.object({
  data: z.array(MovieHistoryEntrySchema),
  nextCursor: z.string().nullable(),
})

export type MovieCollectionItem = z.infer<typeof MovieCollectionItemSchema>
export type MovieDetail = z.infer<typeof MovieDetailSchema>
export type MovieHistoryEntry = z.infer<typeof MovieHistoryEntrySchema>
export type MovieHistoryResponse = z.infer<typeof MovieHistoryResponseSchema>
export type MoviesQuery = z.infer<typeof MoviesQuerySchema>
export type MoviesResponse = z.infer<typeof MoviesResponseSchema>

export type MoviesSummary = z.infer<typeof MoviesSummarySchema>

export const MoviesSummaryQuerySchema = librarySummaryQuery(MoviesQuerySchema)
