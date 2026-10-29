import { z } from 'zod'
import { LIBRARY_PAGE_SIZE, librarySummaryQuery } from './library'
import {
  CalendarDateSchema as calendarDate,
  PublicationBoundarySchema as publicationBoundary,
  QueryTextSchema,
  rangeIsReversed,
  validateFacetBudget,
} from './query-validation'

export const BookCollectionSchema = z.enum(['archive', 'queue'])
export const BookLayoutSchema = z.enum(['grid', 'list'])
export const BookSortSchema = z.enum([
  'recent_read',
  'earliest_read',
  'title',
  'author',
  'personal_rating',
  'published',
  'added',
])
export const BookSortDirectionSchema = z.enum(['asc', 'desc'])
export const BookDateModeSchema = z.enum(['any', 'range', 'unavailable'])
export const BookRatingModeSchema = z.enum(['any', 'rated', 'unrated', 'minimum'])

const optionalTrimmedString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  QueryTextSchema.optional(),
)

const csvValues = z.preprocess(
  (value) => {
    if (value === undefined || value === null || value === '') return []
    const values = Array.isArray(value) ? value : [value]
    return values
      .flatMap((entry) => (typeof entry === 'string' ? entry.split(',') : []))
      .map((entry) => entry.trim())
      .filter(Boolean)
  },
  z.array(z.string().min(1)).max(50).default([]),
)

export const BooksQuerySchema = z
  .object({
    section: BookCollectionSchema.default('archive'),
    q: optionalTrimmedString,
    format: csvValues,
    series: csvValues,
    genre: csvValues,
    finishedMode: BookDateModeSchema.default('any'),
    finishedFrom: calendarDate.optional(),
    finishedTo: calendarDate.optional(),
    publishedMode: BookDateModeSchema.default('any'),
    publishedFrom: publicationBoundary.optional(),
    publishedTo: publicationBoundary.optional(),
    addedMode: BookDateModeSchema.default('any'),
    addedFrom: calendarDate.optional(),
    addedTo: calendarDate.optional(),
    ratingMode: BookRatingModeSchema.default('any'),
    minRating: z.coerce.number().min(0).max(5).multipleOf(0.5).optional(),
    sort: BookSortSchema.optional(),
    direction: BookSortDirectionSchema.optional(),
    layout: BookLayoutSchema.default('grid'),
    limit: z.coerce.number().int().min(1).max(100).default(LIBRARY_PAGE_SIZE),
    cursor: z.string().max(4000).optional(),
  })
  .superRefine((query, context) => {
    validateFacetBudget([query.format, query.series, query.genre], context)
    const allowedSorts =
      query.section === 'archive'
        ? new Set([
            'recent_read',
            'earliest_read',
            'title',
            'author',
            'personal_rating',
            'published',
          ])
        : new Set(['added', 'title', 'author', 'published'])
    if (query.sort !== undefined && !allowedSorts.has(query.sort)) {
      context.addIssue({
        code: 'custom',
        path: ['sort'],
        message: `Sort ${query.sort} is not available for ${query.section}.`,
      })
    }
    if (query.ratingMode === 'minimum' && query.minRating === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['minRating'],
        message: 'A minimum rating is required for the minimum rating filter.',
      })
    }
    for (const [mode, from, to, path] of [
      [query.finishedMode, query.finishedFrom, query.finishedTo, 'finishedMode'],
      [query.publishedMode, query.publishedFrom, query.publishedTo, 'publishedMode'],
      [query.addedMode, query.addedFrom, query.addedTo, 'addedMode'],
    ] as const) {
      if (rangeIsReversed(from, to)) {
        context.addIssue({
          code: 'custom',
          path: [path],
          message: 'The end date must be on or after the start date.',
        })
      }
      if (mode === 'range' && from === undefined && to === undefined) {
        context.addIssue({
          code: 'custom',
          path: [path],
          message: 'A date range requires a start or end boundary.',
        })
      }
    }
  })

export const BookAuthorSchema = z.object({
  id: z.string(),
  name: z.string(),
})

export const BookMembershipsSchema = z.object({
  archive: z.boolean(),
  queue: z.boolean(),
  currentlyReading: z.boolean(),
})

export const BookCollectionItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  authors: z.array(BookAuthorSchema),
  coverUrl: z.string().nullable(),
  coverColor: z.string().nullable(),
  publicationDate: z.string().nullable(),
  publicationPrecision: z.enum(['year', 'month', 'day']).nullable(),
  primarySeries: z.string().nullable(),
  memberships: BookMembershipsSchema,
  latestReadDate: z.string().nullable(),
  latestReadPrecision: z.enum(['year', 'month', 'day']).nullable(),
  latestReadFormat: z.string().nullable(),
  personalRating: z.number().min(0).max(5).nullable(),
  addedToHardcoverDate: z.string().nullable(),
  supportedReadCount: z.number().int().nonnegative(),
})

export const BookFacetValueSchema = z.object({
  value: z.string(),
  label: z.string(),
  count: z.number().int().nonnegative(),
})

export const BooksResponseSchema = z.object({
  data: z.array(BookCollectionItemSchema),
  nextCursor: z.string().nullable(),
})

export const BooksSummarySchema = z.object({
  counts: z.object({
    archive: z.number().int().nonnegative(),
    queue: z.number().int().nonnegative(),
    filteredBooks: z.number().int().nonnegative(),
    supportedReads: z.number().int().nonnegative(),
  }),
  facets: z.object({
    formats: z.array(BookFacetValueSchema),
    series: z.array(BookFacetValueSchema),
    genres: z.array(BookFacetValueSchema),
  }),
  freshness: z.object({
    lastSuccessfulSyncAt: z.string().datetime().nullable(),
    degraded: z.boolean(),
  }),
})

export const BookSeriesSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: z.number().nullable(),
  totalBooks: z.number().int().nonnegative().nullable(),
  compilation: z.boolean(),
})

export const BookContributorGroupSchema = z.object({
  role: z.string(),
  contributors: z.array(BookAuthorSchema),
})

export const BookEditionSchema = z.object({
  id: z.string(),
  format: z.string().nullable(),
  information: z.string().nullable(),
  pages: z.number().int().nonnegative().nullable(),
  audioSeconds: z.number().int().nonnegative().nullable(),
  publisher: z.string().nullable(),
  releaseDate: z.string().nullable(),
  language: z.string().nullable(),
  identifiers: z.array(
    z.object({ type: z.enum(['ISBN-10', 'ISBN-13', 'ASIN']), value: z.string() }),
  ),
  coverUrl: z.string().nullable(),
})

export const BookDetailSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  description: z.string().nullable(),
  coverUrl: z.string().nullable(),
  coverColor: z.string().nullable(),
  publicationDate: z.string().nullable(),
  publicationPrecision: z.enum(['year', 'month', 'day']).nullable(),
  pageCount: z.number().int().nonnegative().nullable(),
  audioSeconds: z.number().int().nonnegative().nullable(),
  memberships: BookMembershipsSchema,
  personalRating: z.number().min(0).max(5).nullable(),
  series: z.array(BookSeriesSchema),
  contributors: z.array(BookContributorGroupSchema),
  selectedEdition: BookEditionSchema.nullable(),
  community: z.object({
    rating: z.number().min(0).max(5).nullable(),
    ratingsCount: z.number().int().nonnegative(),
    genres: z.array(z.string()),
    moods: z.array(z.string()),
    pace: z.array(z.string()),
    contentWarnings: z.array(z.string()),
  }),
  source: z.object({
    label: z.literal('Hardcover'),
    url: z.string().nullable(),
    refreshedAt: z.string().datetime().nullable(),
    coverage: z.enum(['complete', 'partial', 'best_effort']),
  }),
})

export const BookHistoryKindSchema = z.enum([
  'status',
  'added',
  'progress',
  'rating',
  'review',
  'read',
])

export const BookHistoryEntrySchema = z.object({
  id: z.string(),
  kind: BookHistoryKindSchema,
  label: z.string(),
  date: z.string().nullable(),
  datePrecision: z.enum(['year', 'month', 'day', 'instant']).nullable(),
  detail: z.string().nullable(),
  edition: z
    .object({ id: z.string(), format: z.string().nullable(), title: z.string().nullable() })
    .nullable(),
})

export const BookHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(4000).optional(),
})

export const BookHistoryResponseSchema = z.object({
  data: z.array(BookHistoryEntrySchema),
  nextCursor: z.string().nullable(),
})

export type BookCollection = z.infer<typeof BookCollectionSchema>
export type BookCollectionItem = z.infer<typeof BookCollectionItemSchema>
export type BookDetail = z.infer<typeof BookDetailSchema>
export type BookHistoryEntry = z.infer<typeof BookHistoryEntrySchema>
export type BookHistoryResponse = z.infer<typeof BookHistoryResponseSchema>
export type BooksQuery = z.infer<typeof BooksQuerySchema>
export type BooksResponse = z.infer<typeof BooksResponseSchema>

export type BooksSummary = z.infer<typeof BooksSummarySchema>

export const BooksSummaryQuerySchema = librarySummaryQuery(BooksQuerySchema)
