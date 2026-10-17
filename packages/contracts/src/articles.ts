import { z } from 'zod'
import { LIBRARY_PAGE_SIZE, librarySummaryQuery } from './library'

export const ArticleSectionSchema = z.enum(['archive', 'queue', 'feed'])
export const ArticleDensitySchema = z.enum(['restrained', 'expanded'])
export const ArticleSubtypeSchema = z.enum(['article', 'newsletter', 'pdf', 'rss'])
export const ArticleSortSchema = z.enum([
  'archivedAt',
  'addedAt',
  'arrivedAt',
  'queueState',
  'publishedAt',
  'title',
  'author',
  'publication',
  'readingTime',
  'relevance',
])

const optionalTrimmedString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().optional(),
)
const stringList = z.preprocess(
  (value) => {
    if (value === undefined) return []
    const values = Array.isArray(value) ? value : [value]
    return values.flatMap((item) => String(item).split(',')).filter(Boolean)
  },
  z.array(z.string().trim().min(1)).default([]),
)
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const booleanFlag = z.preprocess(
  (value) => value === true || value === 'true' || value === '1',
  z.boolean(),
)
const articleTypes = z.enum(['article', 'newsletter', 'pdf', 'rss'])
const readingTimes = z.enum(['under5', '5to15', '16to30', '31to60', 'over60', 'unknown'])
const progressStates = z.enum(['notOpened', 'openedZero', 'inProgress', 'complete', 'unknown'])
const currentStates = z.enum(['archive', 'inbox', 'later', 'shortlist', 'feed', 'unknown'])
const queueStates = z.enum(['inbox', 'later', 'shortlist'])
const openedStates = z.enum(['opened', 'notOpened'])
const historyStates = z.enum(['archived', 'notArchived'])
export const ArticlesQuerySchema = z
  .object({
    section: ArticleSectionSchema.default('archive'),
    q: optionalTrimmedString,
    type: stringList.transform((values, context) => {
      const parsed = z.array(articleTypes).safeParse(values)
      if (!parsed.success) {
        context.addIssue({ code: 'custom', message: 'Invalid article type.' })
        return z.NEVER
      }
      return parsed.data
    }),
    author: stringList,
    publication: stringList,
    publishedFrom: calendarDate.optional(),
    publishedTo: calendarDate.optional(),
    publishedUnknown: booleanFlag,
    readingTime: stringList.pipe(z.array(readingTimes)),
    progress: stringList.pipe(z.array(progressStates)),
    archivedFrom: calendarDate.optional(),
    archivedTo: calendarDate.optional(),
    archivedUnknown: booleanFlag,
    currentState: stringList.pipe(z.array(currentStates)),
    queueState: stringList.pipe(z.array(queueStates)),
    addedFrom: calendarDate.optional(),
    addedTo: calendarDate.optional(),
    addedUnknown: booleanFlag,
    arrivedFrom: calendarDate.optional(),
    arrivedTo: calendarDate.optional(),
    arrivedUnknown: booleanFlag,
    opened: stringList.pipe(z.array(openedStates)),
    history: stringList.pipe(z.array(historyStates)),
    sort: ArticleSortSchema.optional(),
    direction: z.enum(['asc', 'desc']).optional(),
    density: ArticleDensitySchema.default('restrained'),
    limit: z.coerce.number().int().min(1).max(100).default(LIBRARY_PAGE_SIZE),
    cursor: z.string().max(4000).optional(),
  })
  .superRefine((query, context) => {
    for (const [fromKey, toKey] of [
      ['publishedFrom', 'publishedTo'],
      ['archivedFrom', 'archivedTo'],
      ['addedFrom', 'addedTo'],
      ['arrivedFrom', 'arrivedTo'],
    ] as const) {
      const from = query[fromKey]
      const to = query[toKey]
      if (from !== undefined && to !== undefined && from > to) {
        context.addIssue({
          code: 'custom',
          path: [toKey],
          message: 'The end date must be on or after the start date.',
        })
      }
    }
    const allowedSorts = {
      archive: new Set([
        'archivedAt',
        'addedAt',
        'publishedAt',
        'title',
        'author',
        'publication',
        'readingTime',
        'relevance',
      ]),
      queue: new Set([
        'addedAt',
        'queueState',
        'publishedAt',
        'title',
        'author',
        'publication',
        'readingTime',
        'relevance',
      ]),
      feed: new Set([
        'arrivedAt',
        'publishedAt',
        'title',
        'author',
        'publication',
        'readingTime',
        'relevance',
      ]),
    }[query.section]
    if (query.sort !== undefined && !allowedSorts.has(query.sort)) {
      context.addIssue({
        code: 'custom',
        path: ['sort'],
        message: `Sort ${query.sort} is not available for ${query.section}.`,
      })
    }
    if (query.sort === 'relevance' && query.q === undefined) {
      context.addIssue({ code: 'custom', path: ['sort'], message: 'Relevance requires search.' })
    }
    const incompatible =
      query.section === 'archive'
        ? query.queueState.length > 0 ||
          query.addedFrom !== undefined ||
          query.addedTo !== undefined ||
          query.addedUnknown ||
          query.arrivedFrom !== undefined ||
          query.arrivedTo !== undefined ||
          query.arrivedUnknown
        : query.section === 'queue'
          ? query.archivedFrom !== undefined ||
            query.archivedTo !== undefined ||
            query.archivedUnknown ||
            query.currentState.length > 0 ||
            query.arrivedFrom !== undefined ||
            query.arrivedTo !== undefined ||
            query.arrivedUnknown
          : query.archivedFrom !== undefined ||
            query.archivedTo !== undefined ||
            query.archivedUnknown ||
            query.currentState.length > 0 ||
            query.queueState.length > 0 ||
            query.addedFrom !== undefined ||
            query.addedTo !== undefined ||
            query.addedUnknown
    if (incompatible) {
      context.addIssue({
        code: 'custom',
        message: 'The query includes filters for another section.',
      })
    }
  })

const temporalSchema = z.object({
  value: z.string(),
  precision: z.enum(['year', 'month', 'day', 'instant']),
  basis: z.enum(['source_asserted', 'inferred']),
})
const httpUrlSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith('http://') || value.startsWith('https://'))

export const ArticleCollectionItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtype: ArticleSubtypeSchema,
  imageUrl: z.string().nullable(),
  author: z.string().nullable(),
  publication: z.string().nullable(),
  publishedAt: temporalSchema.nullable(),
  readingTime: z.object({
    raw: z.string().nullable(),
    minutes: z.number().nonnegative().nullable(),
  }),
  progress: z.object({ value: z.number().min(0).max(1).nullable(), valid: z.boolean() }),
  opened: z.boolean(),
  archive: z.object({
    active: z.boolean(),
    count: z.number().int().nonnegative(),
    latestAt: z.string().nullable(),
  }),
  queue: z.object({
    active: z.boolean(),
    state: z.enum(['inbox', 'later', 'shortlist']).nullable(),
    addedAt: z.string().nullable(),
  }),
  feed: z.object({ active: z.boolean(), arrivedAt: z.string().nullable() }),
  currentAvailable: z.boolean(),
  searchExcerpt: z
    .object({
      source: z.enum(['summary', 'note', 'highlight', 'text']),
      text: z.string().max(182).nullable(),
    })
    .nullable(),
})

export const ArticleFacetOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
  count: z.number().int().nonnegative(),
})

export const ArticlesResponseSchema = z.object({
  data: z.array(ArticleCollectionItemSchema),
  nextCursor: z.string().nullable(),
})

export const ArticlesSummarySchema = z.object({
  sectionCounts: z.object({
    archive: z.number().int().nonnegative(),
    queue: z.number().int().nonnegative(),
    feed: z.number().int().nonnegative(),
  }),
  totalCount: z.number().int().nonnegative(),
  filteredCount: z.number().int().nonnegative(),
  occurrenceCount: z.number().int().nonnegative().nullable(),
  facets: z.object({
    types: z.array(ArticleFacetOptionSchema),
    authors: z.array(ArticleFacetOptionSchema),
    publications: z.array(ArticleFacetOptionSchema),
    readingTimes: z.array(ArticleFacetOptionSchema),
    progress: z.array(ArticleFacetOptionSchema),
    currentStates: z.array(ArticleFacetOptionSchema),
    queueStates: z.array(ArticleFacetOptionSchema),
    opened: z.array(ArticleFacetOptionSchema),
    history: z.array(ArticleFacetOptionSchema),
    publishedUnknown: z.number().int().nonnegative(),
    readingTimeUnknown: z.number().int().nonnegative(),
    progressUnknown: z.number().int().nonnegative(),
    dateUnknown: z.number().int().nonnegative(),
  }),
  capabilities: z.object({ fullTextSearch: z.boolean(), highlights: z.boolean() }),
  coverage: z.object({
    allLocationsBackfilled: z.boolean(),
    highlightsBackfilled: z.boolean(),
    fullTextPolicy: z.enum(['archive_queue', 'disabled']),
    lastSuccessfulSyncAt: z.string().nullable(),
  }),
})

export const ArticleDetailSchema = ArticleCollectionItemSchema.extend({
  sourceCategory: z.string(),
  currentLocation: z.string(),
  acquisitionSource: z.string().nullable(),
  summary: z.string().nullable(),
  wordCount: z.number().int().nonnegative().nullable(),
  documentNote: z.string().nullable(),
  highlightDocumentNote: z.string().nullable(),
  tags: z.array(z.object({ key: z.string(), name: z.string(), type: z.string().nullable() })),
  dates: z.object({
    createdAt: z.string().nullable(),
    savedAt: z.string().nullable(),
    firstOpenedAt: z.string().nullable(),
    lastOpenedAt: z.string().nullable(),
    lastMovedAt: z.string().nullable(),
    updatedAt: z.string().nullable(),
    observedAt: z.string(),
  }),
  annotations: z.object({
    active: z.number().int().nonnegative(),
    deleted: z.number().int().nonnegative(),
    discarded: z.number().int().nonnegative(),
  }),
  content: z.object({
    available: z.boolean(),
    state: z.enum(['pending', 'ready', 'failed', 'expired']).nullable(),
    coverage: z.enum(['full', 'partial']).nullable(),
    failureClass: z.string().nullable(),
  }),
  links: z.object({ original: httpUrlSchema.nullable(), reader: httpUrlSchema.nullable() }),
  readerRelationships: z.array(
    z.object({
      documentId: z.string(),
      location: z.string(),
      available: z.boolean(),
      readerUrl: httpUrlSchema.nullable(),
    }),
  ),
  source: z.object({
    connectionLabel: z.string(),
    coverage: z.enum(['complete', 'partial', 'best_effort']),
    sourceRefreshedAt: z.string(),
  }),
})

export const ArticleHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(4000).optional(),
})
export const ArticleHistoryEntrySchema = z.object({
  archiveEntryId: z.string(),
  archivedAt: temporalSchema.nullable(),
  sourceRecordedAt: temporalSchema.nullable(),
  admissionReason: z.literal('readwise_archive_state'),
  disposition: z.enum(['current', 'retained']),
  connection: z.object({ id: z.string(), label: z.string() }),
})
export const ArticleHistoryResponseSchema = z.object({
  data: z.array(ArticleHistoryEntrySchema),
  nextCursor: z.string().nullable(),
})

export const ArticleHighlightsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(4000).optional(),
})
export const ArticleHighlightSchema = z.object({
  id: z.string(),
  text: z.string().nullable(),
  note: z.string().nullable(),
  favorite: z.boolean(),
  highlightedAt: z.string().nullable(),
  location: z.string().nullable(),
  readerUrl: httpUrlSchema.nullable(),
})
export const ArticleHighlightsResponseSchema = z.object({
  data: z.array(ArticleHighlightSchema),
  nextCursor: z.string().nullable(),
})

export type ArticleCollectionItem = z.infer<typeof ArticleCollectionItemSchema>
export type ArticleDetail = z.infer<typeof ArticleDetailSchema>
export type ArticleHistoryResponse = z.infer<typeof ArticleHistoryResponseSchema>
export type ArticleHighlightsResponse = z.infer<typeof ArticleHighlightsResponseSchema>
export type ArticlesQuery = z.infer<typeof ArticlesQuerySchema>
export type ArticlesResponse = z.infer<typeof ArticlesResponseSchema>

export type ArticlesSummary = z.infer<typeof ArticlesSummarySchema>

export const ArticlesSummaryQuerySchema = librarySummaryQuery(ArticlesQuerySchema)
