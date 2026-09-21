import { z } from 'zod'

import { MEDIA_TYPES } from '@media-tracker/domain'

export * from './books'
export * from './articles'
export * from './movies'

export const ApiErrorCodeSchema = z.enum([
  'BAD_REQUEST',
  'NOT_FOUND',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
])

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string(),
    requestId: z.string(),
  }),
})

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('media-tracker-api'),
  version: z.string(),
  timestamp: z.string().datetime(),
  requestId: z.string(),
})

export const MediaTypeSchema = z.enum(MEDIA_TYPES)

export const MediaSummarySchema = z.object({
  id: z.string(),
  type: MediaTypeSchema,
  title: z.string().nullable(),
})

export const MediaListResponseSchema = z.object({
  data: z.array(MediaSummarySchema),
  nextCursor: z.string().nullable(),
  totalCount: z.number().int().nonnegative(),
  filteredCount: z.number().int().nonnegative(),
  counts: z.record(MediaTypeSchema, z.number().int().nonnegative()),
})
export const MediaQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(100),
  type: MediaTypeSchema.optional(),
  cursor: z.string().max(2000).optional(),
})
export const PageQuerySchema = MediaQuerySchema.omit({ type: true })

export const ReadwiseSyncResponseSchema = z.object({
  syncRunId: z.string(),
  pages: z.number().int().nonnegative(),
  sourceRecords: z.number().int().nonnegative(),
  archiveItems: z.number().int().nonnegative(),
})

export const HardcoverSyncResponseSchema = z.object({
  syncRunId: z.string(),
  mode: z.enum(['backfill', 'reconcile']),
  pages: z.number().int().nonnegative(),
  sourceRecords: z.number().int().nonnegative(),
  books: z.number().int().nonnegative(),
  archiveEntries: z.number().int().nonnegative(),
  queueBooks: z.number().int().nonnegative().default(0),
  works: z.number().int().nonnegative().default(0),
  editions: z.number().int().nonnegative().default(0),
})

export const LetterboxdImportResponseSchema = z.object({
  syncRunId: z.string(),
  alreadyImported: z.boolean(),
  films: z.number().int().nonnegative(),
  archiveEntries: z.number().int().nonnegative(),
  sourceRecords: z.number().int().nonnegative(),
  unresolvedRecords: z.number().int().nonnegative(),
})

export const LetterboxdRssSyncResponseSchema = z.object({
  syncRunId: z.string(),
  unchanged: z.boolean(),
  feedEntries: z.number().int().nonnegative(),
  archiveEntries: z.number().int().nonnegative(),
  sourceRecords: z.number().int().nonnegative(),
  unresolvedRecords: z.number().int().nonnegative(),
})

export const SpotifyImportResponseSchema = z.object({
  syncRunId: z.string(),
  importId: z.string(),
  alreadyImported: z.boolean(),
  completed: z.boolean(),
  nextOffset: z.number().int().nonnegative().nullable(),
  totalPodcastSegments: z.number().int().nonnegative(),
  totalArchiveEpisodes: z.number().int().nonnegative(),
  archiveEpisodes: z.number().int().nonnegative(),
  sourceRecords: z.number().int().nonnegative(),
  unresolvedPodcastSegments: z.number().int().nonnegative(),
})

export const SpotifySyncResponseSchema = z.object({
  syncRunId: z.string(),
  mode: z.enum(['backfill', 'reconcile']),
  pages: z.number().int().nonnegative(),
  sourceRecords: z.number().int().nonnegative(),
  archiveEpisodes: z.number().int().nonnegative(),
  queueCandidates: z.number().int().nonnegative(),
  unresolvedEpisodes: z.number().int().nonnegative(),
  refreshTokenRotated: z.boolean(),
})

export const YoutubeImportResponseSchema = z.object({
  syncRunId: z.string(),
  importId: z.string(),
  alreadyImported: z.boolean(),
  completed: z.boolean(),
  nextOffset: z.number().int().nonnegative().nullable(),
  totalRecords: z.number().int().nonnegative(),
  activityCards: z.number().int().nonnegative(),
  videos: z.number().int().nonnegative(),
  archiveEntries: z.number().int().nonnegative(),
  sourceRecords: z.number().int().nonnegative(),
  unresolvedRecords: z.number().int().nonnegative(),
  ignoredRecords: z.number().int().nonnegative(),
  watchLaterRecords: z.number().int().nonnegative(),
})

export const ConnectionSummarySchema = z.object({
  source: z.enum(['readwise', 'hardcover', 'letterboxd', 'spotify', 'youtube']),
  id: z.string().nullable(),
  label: z.string(),
  status: z.enum(['connected', 'disconnected', 'degraded', 'reauthorization_required']),
  coverage: z.enum(['complete', 'partial', 'best_effort']).nullable(),
  lastAttemptedSyncAt: z.string().datetime().nullable(),
  lastExportAt: z.string().datetime().nullable(),
  incompleteImports: z.array(
    z.object({
      importId: z.string(),
      status: z.enum(['pending', 'processing', 'processed', 'failed']),
      nextOffset: z.number().int().nonnegative(),
      totalRecords: z.number().int().nonnegative().nullable(),
    }),
  ),
  lastSuccessfulSyncAt: z.string().datetime().nullable(),
})

export const ConnectionsResponseSchema = z.object({
  data: z.array(ConnectionSummarySchema),
})

export const SyncRunSummarySchema = z.object({
  id: z.string(),
  source: ConnectionSummarySchema.shape.source,
  connectionId: z.string(),
  connectionLabel: z.string(),
  kind: z.enum(['backfill', 'reconcile', 'import', 'webhook', 'replay']),
  status: z.enum(['pending', 'running', 'succeeded', 'partially_succeeded', 'failed']),
  sourceRecords: z.number().int().nonnegative(),
  normalizedRecords: z.number().int().nonnegative(),
  failedRecords: z.number().int().nonnegative(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
})

export const SyncRunsResponseSchema = z.object({
  data: z.array(SyncRunSummarySchema),
  nextCursor: z.string().nullable(),
})

export const SyncJobSchema = z
  .object({
    idempotencyKey: z.string().min(1),
    source: ConnectionSummarySchema.shape.source,
    operation: z.enum([
      'backfill',
      'reconcile',
      'process_raw_object',
      'acquire_article_content',
      'index_article_content',
    ]),
    connectionId: z.string().optional(),
    documentId: z.string().optional(),
    manifestId: z.string().optional(),
    nextOrdinal: z.number().int().nonnegative().optional(),
  })
  .superRefine((job, context) => {
    if (
      job.operation === 'acquire_article_content' &&
      (job.source !== 'readwise' || job.connectionId === undefined || job.documentId === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Article content jobs require a Readwise connection and document.',
      })
    }
    if (
      job.operation === 'index_article_content' &&
      (job.source !== 'readwise' || job.manifestId === undefined || job.nextOrdinal === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Article indexing jobs require a Readwise manifest and next ordinal.',
      })
    }
  })

export type ApiError = z.infer<typeof ApiErrorSchema>
export type ConnectionSummary = z.infer<typeof ConnectionSummarySchema>
export type ConnectionsResponse = z.infer<typeof ConnectionsResponseSchema>
export type HealthResponse = z.infer<typeof HealthResponseSchema>
export type HardcoverSyncResponse = z.infer<typeof HardcoverSyncResponseSchema>
export type LetterboxdImportResponse = z.infer<typeof LetterboxdImportResponseSchema>
export type LetterboxdRssSyncResponse = z.infer<typeof LetterboxdRssSyncResponseSchema>
export type MediaListResponse = z.infer<typeof MediaListResponseSchema>
export type MediaSummary = z.infer<typeof MediaSummarySchema>
export type ReadwiseSyncResponse = z.infer<typeof ReadwiseSyncResponseSchema>
export type SpotifyImportResponse = z.infer<typeof SpotifyImportResponseSchema>
export type SpotifySyncResponse = z.infer<typeof SpotifySyncResponseSchema>
export type SyncJob = z.infer<typeof SyncJobSchema>
export type YoutubeImportResponse = z.infer<typeof YoutubeImportResponseSchema>
