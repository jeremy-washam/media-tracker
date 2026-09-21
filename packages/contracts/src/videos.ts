import { z } from 'zod'

const optionalString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().optional(),
)
const stringList = z.preprocess(
  (value) =>
    value === undefined
      ? []
      : (Array.isArray(value) ? value : [value])
          .flatMap((item) => String(item).split(','))
          .map((item) => item.trim())
          .filter(Boolean),
  z.array(z.string()).default([]),
)
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const VideoViewSchema = z.enum(['archive', 'queue', 'channels'])
export const VideosQuerySchema = z
  .object({
    view: VideoViewSchema.default('archive'),
    q: optionalString,
    account: stringList,
    channel: stringList,
    watchedFrom: date.optional(),
    watchedTo: date.optional(),
    addedFrom: date.optional(),
    addedTo: date.optional(),
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
    availability: z.preprocess(
      (value) =>
        value === undefined
          ? []
          : (Array.isArray(value) ? value : [value])
              .flatMap((item) => String(item).split(','))
              .filter(Boolean),
      z
        .array(z.enum(['not_configured', 'pending', 'available', 'unavailable', 'stale', 'error']))
        .default([]),
    ),
    following: z.enum(['all', 'following']).default('all'),
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
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().max(4000).optional(),
  })
  .superRefine((value, context) => {
    for (const [from, to, path] of [
      [value.watchedFrom, value.watchedTo, 'watchedTo'],
      [value.addedFrom, value.addedTo, 'addedTo'],
    ] as const) {
      if (from && to && from > to)
        context.addIssue({ code: 'custom', path: [path], message: 'End date precedes start date.' })
    }
    if (value.sort === 'relevance' && !value.q)
      context.addIssue({ code: 'custom', path: ['sort'], message: 'Relevance requires search.' })
    const sorts =
      value.view === 'archive'
        ? ['watchedAt', 'title', 'channel', 'watchCount', 'publishedAt', 'duration', 'relevance']
        : value.view === 'queue'
          ? ['addedAt', 'title', 'channel', 'publishedAt', 'duration', 'relevance']
          : ['watchCount', 'channel', 'watchedAt', 'queueCount', 'relevance']
    if (value.sort && !sorts.includes(value.sort))
      context.addIssue({
        code: 'custom',
        path: ['sort'],
        message: 'Sort is not valid for this view.',
      })
    if (
      value.view === 'channels' &&
      (value.account.length > 0 ||
        value.channel.length > 0 ||
        value.watchedFrom ||
        value.watchedTo ||
        value.addedFrom ||
        value.addedTo ||
        value.watchCount !== 'all' ||
        value.overlap !== 'all' ||
        value.format.length > 0 ||
        value.availability.length > 0)
    )
      context.addIssue({
        code: 'custom',
        path: ['view'],
        message: 'Video filters are invalid here.',
      })
    if (value.view !== 'channels' && value.following !== 'all')
      context.addIssue({
        code: 'custom',
        path: ['following'],
        message: 'Following is for Channels.',
      })
    if (value.view === 'archive' && (value.addedFrom || value.addedTo))
      context.addIssue({ code: 'custom', path: ['addedFrom'], message: 'Added date is for Queue.' })
    if (
      value.view === 'queue' &&
      (value.watchedFrom || value.watchedTo || value.watchCount !== 'all')
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
  following: z.boolean(),
  subscriptionCount: z.number().int().nonnegative(),
})

const FacetValueSchema = z.object({
  value: z.string(),
  label: z.string(),
  count: z.number().int().nonnegative(),
})

export const VideosResponseSchema = z.object({
  data: z.array(VideoCollectionItemSchema),
  nextCursor: z.string().nullable(),
  totalCount: z.number().int().nonnegative(),
  filteredCount: z.number().int().nonnegative(),
  sectionCounts: z.object({
    archive: z.number().int().nonnegative(),
    queue: z.number().int().nonnegative(),
    channels: z.number().int().nonnegative(),
  }),
  occurrenceCount: z.number().int().nonnegative(),
  facets: z.object({ accounts: z.array(FacetValueSchema), channels: z.array(FacetValueSchema) }),
  coverage: z.object({
    watchLater: z.enum(['complete', 'partial', 'missing', 'invalid', 'unknown']),
    subscriptions: z.enum(['complete', 'partial', 'missing', 'invalid', 'unknown']),
    catalog: z.literal('not_configured'),
  }),
})

export const VideoDetailSchema = VideoCollectionItemSchema.extend({
  kind: z.literal('video'),
  description: z.string().nullable(),
  historyCount: z.number().int().nonnegative(),
  queueRelationships: z.array(
    z.object({ connectionLabel: z.string(), addedAt: z.string().nullable() }),
  ),
  metadataMessage: z.string(),
})

export const VideoChannelDetailSchema = VideoCollectionItemSchema.extend({
  kind: z.literal('channel'),
  followingRelationships: z.array(z.object({ connectionLabel: z.string() })),
  metadataMessage: z.string(),
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
  membership: z.enum(['archive', 'queue']).default('archive'),
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
