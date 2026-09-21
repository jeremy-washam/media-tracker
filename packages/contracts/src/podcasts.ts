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
          .filter(Boolean),
  z.array(z.string()).default([]),
)
const booleanFlag = z.preprocess(
  (value) => value === true || value === 'true' || value === '1',
  z.boolean().default(false),
)
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const PodcastViewSchema = z.enum(['archive', 'queue', 'following'])
export const PodcastsQuerySchema = z
  .object({
    view: PodcastViewSchema.default('archive'),
    q: optionalString,
    show: stringList,
    following: z.enum(['all', 'following', 'not_following']).default('all'),
    dateFrom: date.optional(),
    dateTo: date.optional(),
    dateUnknown: booleanFlag,
    publishedFrom: date.optional(),
    publishedTo: date.optional(),
    publishedUnknown: booleanFlag,
    publisher: stringList,
    language: stringList,
    libraryEpisodes: z.preprocess(
      (value) =>
        value === undefined
          ? []
          : (Array.isArray(value) ? value : [value])
              .flatMap((item) => String(item).split(','))
              .filter(Boolean),
      z.array(z.enum(['archive', 'queue', 'none'])).default([]),
    ),
    duration: z.preprocess(
      (value) =>
        value === undefined
          ? []
          : (Array.isArray(value) ? value : [value])
              .flatMap((item) => String(item).split(','))
              .filter(Boolean),
      z.array(z.enum(['under30', '30to59', '1to2hours', 'over2hours', 'unknown'])).default([]),
    ),
    sort: z
      .enum([
        'activityAt',
        'savedAt',
        'observedTime',
        'publishedAt',
        'duration',
        'title',
        'show',
        'publisher',
        'episodeCount',
        'relevance',
      ])
      .optional(),
    direction: z.enum(['asc', 'desc']).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().max(4000).optional(),
  })
  .superRefine((value, context) => {
    if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo)
      context.addIssue({
        code: 'custom',
        path: ['dateTo'],
        message: 'The end date must be on or after the start date.',
      })
    if (value.publishedFrom && value.publishedTo && value.publishedFrom > value.publishedTo)
      context.addIssue({
        code: 'custom',
        path: ['publishedTo'],
        message: 'The publication end date must be on or after the start date.',
      })
    if (value.sort === 'relevance' && !value.q)
      context.addIssue({ code: 'custom', path: ['sort'], message: 'Relevance requires search.' })
    const sorts =
      value.view === 'archive'
        ? ['activityAt', 'observedTime', 'publishedAt', 'duration', 'title', 'show', 'relevance']
        : value.view === 'queue'
          ? ['savedAt', 'publishedAt', 'duration', 'title', 'show', 'relevance']
          : ['savedAt', 'title', 'publisher', 'episodeCount', 'relevance']
    if (value.sort && !sorts.includes(value.sort))
      context.addIssue({
        code: 'custom',
        path: ['sort'],
        message: 'Sort is not valid for this view.',
      })
    if (
      value.view === 'following' &&
      (value.show.length > 0 ||
        value.following !== 'all' ||
        value.duration.length > 0 ||
        value.publishedFrom !== undefined ||
        value.publishedTo !== undefined ||
        value.publishedUnknown)
    )
      context.addIssue({
        code: 'custom',
        path: ['view'],
        message: 'Episode filters are not valid for Following.',
      })
    if (
      value.view !== 'following' &&
      (value.publisher.length > 0 || value.language.length > 0 || value.libraryEpisodes.length > 0)
    )
      context.addIssue({
        code: 'custom',
        path: ['view'],
        message: 'Show filters are valid only for Following.',
      })
  })

export const PodcastCollectionItemSchema = z.object({
  id: z.string(),
  kind: z.enum(['episode', 'show']),
  title: z.string(),
  subtitle: z.string().nullable(),
  imageUrl: z.string().nullable(),
  date: z.string().nullable(),
  publishedAt: z.string().nullable().optional(),
  durationMs: z.number().int().nonnegative().nullable(),
  observedMs: z.number().int().nonnegative(),
  playbackCount: z.number().int().nonnegative(),
  inArchive: z.boolean(),
  inQueue: z.boolean(),
  following: z.boolean(),
  archiveEpisodeCount: z.number().int().nonnegative(),
  queueEpisodeCount: z.number().int().nonnegative(),
  totalEpisodes: z.number().int().nonnegative().nullable(),
  canonicalUrl: z.string().url().nullable(),
})

export const PodcastsResponseSchema = z.object({
  data: z.array(PodcastCollectionItemSchema),
  nextCursor: z.string().nullable(),
  totalCount: z.number().int().nonnegative(),
  filteredCount: z.number().int().nonnegative(),
  sectionCounts: z.object({
    archive: z.number().int().nonnegative(),
    queue: z.number().int().nonnegative(),
    following: z.number().int().nonnegative(),
  }),
})

export const PodcastDetailSchema = PodcastCollectionItemSchema.extend({
  description: z.string().nullable(),
  publisher: z.string().nullable(),
  showDescription: z.string().nullable(),
  showUrl: z.string().url().nullable(),
  availability: z.string(),
})

export const PodcastHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(4000).optional(),
})
export const PodcastHistoryResponseSchema = z.object({
  data: z.array(
    z.object({
      occurredAt: z.string().nullable(),
      source: z.enum(['spotify', 'reader']),
      observedMs: z.number().int().nonnegative().nullable(),
      positive: z.boolean(),
      skipped: z.boolean().nullable(),
      reasonStart: z.string().nullable(),
      reasonEnd: z.string().nullable(),
    }),
  ),
  nextCursor: z.string().nullable(),
  totalCount: z.number().int().nonnegative(),
})

export type PodcastCollectionItem = z.infer<typeof PodcastCollectionItemSchema>
export type PodcastDetail = z.infer<typeof PodcastDetailSchema>
export type PodcastsResponse = z.infer<typeof PodcastsResponseSchema>
export type PodcastHistoryResponse = z.infer<typeof PodcastHistoryResponseSchema>
