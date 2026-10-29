import { z } from 'zod'
import { LIBRARY_PAGE_SIZE, librarySummaryQuery } from './library'
import { CalendarDateSchema as date, QueryTextSchema } from './query-validation'

const optionalString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  QueryTextSchema.optional(),
)
const stringList = z.preprocess(
  (value) =>
    value === undefined
      ? []
      : (Array.isArray(value) ? value : [value])
          .flatMap((item) => String(item).split(','))
          .map((item) => item.trim())
          .filter(Boolean),
  z.array(z.string().max(500)).max(500).default([]),
)
const booleanQuery = z.preprocess(
  (value) => (value === 'true' ? true : value === 'false' ? false : value),
  z.boolean(),
)

export const VideoViewSchema = z.enum(['archive', 'queue', 'channels'])
export const VideosQuerySchema = z
  .object({
    section: VideoViewSchema.default('archive'),
    q: optionalString,
    account: stringList,
    channel: stringList,
    watchedFrom: date.optional(),
    watchedTo: date.optional(),
    watchedUnknown: booleanQuery.default(false),
    addedFrom: date.optional(),
    addedTo: date.optional(),
    addedUnknown: booleanQuery.default(false),
    published: z.enum(['all', 'range', 'unknown']).default('all'),
    publishedFrom: date.optional(),
    publishedTo: date.optional(),
    duration: z.enum(['any', 'under5', '5to19', '20to59', '60plus']).default('any'),
    durationUnknown: booleanQuery.default(false),
    watchCount: z.enum(['all', 'once', 'rewatched']).default('all'),
    overlap: z.enum(['all', 'overlap', 'not_overlap']).default('all'),
    format: z.preprocess(
      (value) =>
        value === undefined
          ? []
          : (Array.isArray(value) ? value : [value])
              .flatMap((item) => String(item).split(','))
              .filter(Boolean),
      z
        .array(z.enum(['live', 'upcoming', 'recorded_live', 'youtube_music', 'shorts', 'premiere']))
        .default([]),
    ),
    availability: z.enum(['any', 'available', 'unavailable', 'unchecked']).default('any'),
    category: stringList,
    sort: z
      .enum([
        'watchedAt',
        'addedAt',
        'title',
        'channel',
        'watchCount',
        'publishedAt',
        'duration',
        'queueCount',
        'relevance',
      ])
      .optional(),
    direction: z.enum(['asc', 'desc']).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(LIBRARY_PAGE_SIZE),
    cursor: z.string().max(4000).optional(),
  })
  .superRefine((value, context) => {
    for (const [from, to, path] of [
      [value.watchedFrom, value.watchedTo, 'watchedTo'],
      [value.addedFrom, value.addedTo, 'addedTo'],
      [value.publishedFrom, value.publishedTo, 'publishedTo'],
    ] as const) {
      if (from && to && from > to)
        context.addIssue({ code: 'custom', path: [path], message: 'End date precedes start date.' })
    }
    if (value.sort === 'relevance' && !value.q)
      context.addIssue({ code: 'custom', path: ['sort'], message: 'Relevance requires search.' })
    if (value.published === 'range' && !value.publishedFrom && !value.publishedTo)
      context.addIssue({
        code: 'custom',
        path: ['published'],
        message: 'A published-date range requires a start or end boundary.',
      })
    const sorts =
      value.section === 'archive'
        ? ['watchedAt', 'title', 'channel', 'watchCount', 'publishedAt', 'duration', 'relevance']
        : value.section === 'queue'
          ? ['addedAt', 'title', 'channel', 'publishedAt', 'duration', 'relevance']
          : ['watchCount', 'channel', 'watchedAt', 'queueCount', 'relevance']
    if (value.sort && !sorts.includes(value.sort))
      context.addIssue({
        code: 'custom',
        path: ['sort'],
        message: 'Sort is not valid for this view.',
      })
    if (
      value.section === 'channels' &&
      (value.account.length > 0 ||
        value.channel.length > 0 ||
        value.watchedFrom ||
        value.watchedTo ||
        value.watchedUnknown ||
        value.addedFrom ||
        value.addedTo ||
        value.addedUnknown ||
        value.published !== 'all' ||
        value.publishedFrom ||
        value.publishedTo ||
        value.duration !== 'any' ||
        value.durationUnknown ||
        value.watchCount !== 'all' ||
        value.overlap !== 'all' ||
        value.format.length > 0 ||
        value.availability !== 'any' ||
        value.category.length > 0)
    )
      context.addIssue({
        code: 'custom',
        path: ['view'],
        message: 'Video filters are invalid here.',
      })
    if (value.section === 'archive' && (value.addedFrom || value.addedTo || value.addedUnknown))
      context.addIssue({ code: 'custom', path: ['addedFrom'], message: 'Added date is for Queue.' })
    if (
      value.section === 'queue' &&
      (value.watchedFrom || value.watchedTo || value.watchedUnknown || value.watchCount !== 'all')
    )
      context.addIssue({
        code: 'custom',
        path: ['watchedFrom'],
        message: 'Watch filters are for Archive.',
      })
  })

const VideoAvailabilitySchema = z.enum([
  'not_configured',
  'pending',
  'available',
  'unavailable',
  'stale',
  'error',
])

export const VideoCollectionItemSchema = z.object({
  id: z.string(),
  kind: z.enum(['video', 'channel']),
  title: z.string(),
  channelId: z.string().nullable(),
  channelTitle: z.string().nullable(),
  imageUrl: z.string().url().nullable(),
  canonicalUrl: z.string().url(),
  date: z.string().nullable(),
  publishedAt: z.string().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  availability: VideoAvailabilitySchema,
  formats: z.array(
    z.enum(['live', 'upcoming', 'recorded_live', 'youtube_music', 'shorts', 'premiere']),
  ),
  inArchive: z.boolean(),
  inQueue: z.boolean(),
  watchCount: z.number().int().nonnegative(),
  matchingWatchCount: z.number().int().nonnegative(),
  watchAccountCount: z.number().int().nonnegative(),
  matchingWatchAccountCount: z.number().int().nonnegative(),
  queueAccountCount: z.number().int().nonnegative(),
  matchingQueueCount: z.number().int().nonnegative(),
  matchingQueueAccountCount: z.number().int().nonnegative(),
  archiveVideoCount: z.number().int().nonnegative(),
  queueVideoCount: z.number().int().nonnegative(),
})

const FacetValueSchema = z.object({
  value: z.string(),
  label: z.string(),
  count: z.number().int().nonnegative(),
})

export const VideosResponseSchema = z.object({
  data: z.array(VideoCollectionItemSchema),
  nextCursor: z.string().nullable(),
})

export const VideosSummarySchema = z.object({
  totalCount: z.number().int().nonnegative(),
  filteredCount: z.number().int().nonnegative(),
  sectionCounts: z.object({
    archive: z.number().int().nonnegative(),
    queue: z.number().int().nonnegative(),
    channels: z.number().int().nonnegative(),
  }),
  occurrenceCount: z.number().int().nonnegative(),
  facets: z.object({
    accounts: z.array(FacetValueSchema),
    channels: z.array(FacetValueSchema),
    categories: z.array(FacetValueSchema),
  }),
  coverage: z.object({
    watchLater: z.enum(['complete', 'partial', 'missing', 'invalid', 'unknown']),
    catalog: z.enum(['not_configured', 'pending', 'current', 'partial', 'error']),
  }),
})

export const VideoDetailSchema = VideoCollectionItemSchema.extend({
  kind: z.literal('video'),
  description: z.string().nullable(),
  categoryId: z.string().nullable(),
  categoryTitle: z.string().nullable(),
  captionAvailable: z.boolean().nullable(),
  definition: z.string().nullable(),
  projection: z.string().nullable(),
  catalogCheckedAt: z.string().nullable(),
  historyCount: z.number().int().nonnegative(),
  queueRelationships: z.array(
    z.object({ connectionLabel: z.string(), addedAt: z.string().nullable() }),
  ),
  metadataMessage: z.string().nullable(),
})

export const VideoChannelDetailSchema = VideoCollectionItemSchema.extend({
  kind: z.literal('channel'),
  description: z.string().nullable(),
  customUrl: z.string().nullable(),
  country: z.string().nullable(),
  catalogCheckedAt: z.string().nullable(),
  metadataMessage: z.string().nullable(),
})

export const VideoHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(4000).optional(),
})
export const VideoHistoryResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      occurredAt: z.string(),
      connectionLabel: z.string(),
      historicalTitle: z.string().nullable(),
      historicalChannelTitle: z.string().nullable(),
      product: z.enum(['youtube', 'youtube_music', 'unknown']),
      sourceUrl: z.string().url().nullable(),
    }),
  ),
  nextCursor: z.string().nullable(),
  totalCount: z.number().int().nonnegative(),
})

export const VideoChannelLibraryQuerySchema = z.object({
  section: z.enum(['archive', 'queue']).default('archive'),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(4000).optional(),
})
export const VideoChannelLibraryResponseSchema = z.object({
  data: z.array(VideoCollectionItemSchema),
  nextCursor: z.string().nullable(),
  totalCount: z.number().int().nonnegative(),
})

export type VideoCollectionItem = z.infer<typeof VideoCollectionItemSchema>
export type VideoDetail = z.infer<typeof VideoDetailSchema>
export type VideoChannelDetail = z.infer<typeof VideoChannelDetailSchema>
export type VideosResponse = z.infer<typeof VideosResponseSchema>
export type VideoHistoryResponse = z.infer<typeof VideoHistoryResponseSchema>
export type VideoChannelLibraryResponse = z.infer<typeof VideoChannelLibraryResponseSchema>

export type VideosSummary = z.infer<typeof VideosSummarySchema>

export const VideosSummaryQuerySchema = librarySummaryQuery(VideosQuerySchema)
