import { z } from 'zod'

const optionalString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().optional(),
)
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const stringList = z.preprocess(
  (value) =>
    value === undefined
      ? []
      : (Array.isArray(value) ? value : [value])
          .flatMap((item) => String(item).split(','))
          .filter(Boolean),
  z.array(z.string()).default([]),
)

export const MusicViewSchema = z.enum(['tracks', 'albums', 'artists'])
export const MusicQuerySchema = z
  .object({
    view: MusicViewSchema.default('tracks'),
    q: optionalString,
    from: date.optional(),
    to: date.optional(),
    source: z.enum(['all', 'export', 'recent_api']).default('all'),
    minPlaybacks: z.coerce.number().int().positive().optional(),
    playbackCount: z.enum(['any', 'once', '2to9', '10to49', '50plus']).default('any'),
    metadata: z.enum(['any', 'current', 'export_only', 'unavailable']).default('any'),
    artist: stringList,
    album: stringList,
    explicit: z.enum(['any', 'yes', 'no', 'unknown']).default('any'),
    albumType: z.enum(['any', 'album', 'single', 'compilation', 'other', 'unknown']).default('any'),
    sort: z
      .enum([
        'playedAt',
        'title',
        'artist',
        'album',
        'playbackCount',
        'observedTime',
        'trackCount',
        'releaseCount',
        'releasedAt',
        'relevance',
      ])
      .optional(),
    direction: z.enum(['asc', 'desc']).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().max(4000).optional(),
  })
  .superRefine((value, context) => {
    if (value.from && value.to && value.from > value.to)
      context.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'The end date must be on or after the start date.',
      })
    if (value.sort === 'relevance' && !value.q)
      context.addIssue({ code: 'custom', path: ['sort'], message: 'Relevance requires search.' })
    const sorts =
      value.view === 'tracks'
        ? ['playedAt', 'title', 'artist', 'album', 'playbackCount', 'observedTime', 'relevance']
        : value.view === 'albums'
          ? [
              'playedAt',
              'title',
              'artist',
              'playbackCount',
              'observedTime',
              'trackCount',
              'releasedAt',
              'relevance',
            ]
          : [
              'playedAt',
              'title',
              'playbackCount',
              'observedTime',
              'trackCount',
              'releaseCount',
              'relevance',
            ]
    if (value.sort && !sorts.includes(value.sort))
      context.addIssue({
        code: 'custom',
        path: ['sort'],
        message: 'Sort is not valid for this view.',
      })
    if (value.view !== 'tracks' && (value.album.length > 0 || value.explicit !== 'any'))
      context.addIssue({
        code: 'custom',
        path: ['view'],
        message: 'Track filters are valid only for Tracks.',
      })
    if (value.view === 'artists' && value.artist.length > 0)
      context.addIssue({
        code: 'custom',
        path: ['artist'],
        message: 'Artist filtering is valid only for Tracks and Albums.',
      })
    if (value.view !== 'albums' && value.albumType !== 'any')
      context.addIssue({
        code: 'custom',
        path: ['albumType'],
        message: 'Album type is valid only for Albums.',
      })
  })

export const MusicCollectionItemSchema = z.object({
  id: z.string(),
  kind: z.enum(['track', 'album', 'artist']),
  title: z.string(),
  subtitle: z.string().nullable(),
  album: z.string().nullable(),
  imageUrl: z.string().nullable(),
  latestPlayedAt: z.string().nullable(),
  playbackCount: z.number().int().nonnegative(),
  observedMs: z.number().int().nonnegative(),
  observedDurationKnown: z.boolean(),
  durationUnknownCount: z.number().int().nonnegative().default(0),
  trackCount: z.number().int().nonnegative(),
  releaseCount: z.number().int().nonnegative(),
  explicit: z.boolean().nullable(),
  metadataState: z.string(),
  canonicalUrl: z.string().url().nullable(),
})

export const MusicResponseSchema = z.object({
  data: z.array(MusicCollectionItemSchema),
  nextCursor: z.string().nullable(),
  totalCount: z.number().int().nonnegative(),
  filteredCount: z.number().int().nonnegative(),
  sectionCounts: z.object({
    tracks: z.number().int().nonnegative(),
    albums: z.number().int().nonnegative(),
    artists: z.number().int().nonnegative(),
  }),
  coverage: z
    .object({
      savedEpisodesAt: z.string().nullable(),
      savedShowsAt: z.string().nullable(),
      playerAt: z.string().nullable(),
      recentPollAt: z.string().nullable(),
      possibleRecentGap: z.boolean(),
    })
    .optional(),
})

export const MusicFilterOptionsQuerySchema = MusicQuerySchema.safeExtend({
  facet: z.enum(['artist', 'album']),
  optionQ: optionalString,
  optionLimit: z.coerce.number().int().min(1).max(50).default(30),
  optionCursor: z.string().max(4000).optional(),
}).superRefine((value, context) => {
  if (value.view === 'artists' || (value.view === 'albums' && value.facet === 'album'))
    context.addIssue({
      code: 'custom',
      path: ['facet'],
      message: 'Facet is not valid for this view.',
    })
})

export const MusicFilterOptionsResponseSchema = z.object({
  data: z.array(
    z.object({
      value: z.string(),
      label: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
  nextCursor: z.string().nullable(),
})

export const MusicDetailSchema = z.object({
  id: z.string(),
  kind: z.enum(['track', 'album', 'artist']),
  title: z.string(),
  subtitle: z.string().nullable(),
  album: z.string().nullable(),
  albumId: z.string().nullable().optional(),
  albumType: z.string().nullable().optional(),
  releaseDate: z.string().nullable().optional(),
  artists: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
  relatedTracks: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        playbackCount: z.number().int().nonnegative(),
      }),
    )
    .optional(),
  relatedAlbums: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        playbackCount: z.number().int().nonnegative(),
      }),
    )
    .optional(),
  imageUrl: z.string().nullable(),
  latestPlayedAt: z.string().nullable(),
  firstPlayedAt: z.string().nullable(),
  playbackCount: z.number().int().nonnegative(),
  observedMs: z.number().int().nonnegative(),
  observedDurationKnown: z.boolean(),
  durationUnknownCount: z.number().int().nonnegative().default(0),
  durationMs: z.number().int().nonnegative().nullable(),
  explicit: z.boolean().nullable(),
  isrc: z.string().nullable(),
  metadataState: z.string(),
  canonicalUrl: z.string().url().nullable(),
})

export const MusicHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(4000).optional(),
})
export const MusicHistoryResponseSchema = z.object({
  data: z.array(
    z.object({
      occurredAt: z.string().nullable(),
      source: z.enum(['export', 'recent_api']),
      observedMs: z.number().int().nonnegative().nullable(),
      skipped: z.boolean().nullable(),
      reasonStart: z.string().nullable(),
      reasonEnd: z.string().nullable(),
      trackId: z.string(),
      trackTitle: z.string(),
      artistText: z.string().nullable(),
    }),
  ),
  nextCursor: z.string().nullable(),
  totalCount: z.number().int().nonnegative(),
})

export type MusicCollectionItem = z.infer<typeof MusicCollectionItemSchema>
export type MusicDetail = z.infer<typeof MusicDetailSchema>
export type MusicResponse = z.infer<typeof MusicResponseSchema>
export type MusicFilterOptionsResponse = z.infer<typeof MusicFilterOptionsResponseSchema>
export type MusicHistoryResponse = z.infer<typeof MusicHistoryResponseSchema>
