import { z } from 'zod'

import { MEDIA_TYPES } from '@media-tracker/domain'

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
})

export const ConnectionSummarySchema = z.object({
  source: z.enum(['readwise', 'hardcover', 'letterboxd', 'spotify', 'youtube']),
  status: z.enum(['connected', 'disconnected', 'degraded']),
  lastSuccessfulSyncAt: z.string().datetime().nullable(),
})

export const ConnectionsResponseSchema = z.object({
  data: z.array(ConnectionSummarySchema),
})

export const SyncRunSummarySchema = z.object({
  id: z.string(),
  source: ConnectionSummarySchema.shape.source,
  status: z.enum(['pending', 'running', 'succeeded', 'failed']),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
})

export const SyncRunsResponseSchema = z.object({
  data: z.array(SyncRunSummarySchema),
  nextCursor: z.string().nullable(),
})

export const SyncJobSchema = z.object({
  idempotencyKey: z.string().min(1),
  source: ConnectionSummarySchema.shape.source,
  operation: z.enum(['backfill', 'reconcile', 'process_raw_object']),
})

export type ApiError = z.infer<typeof ApiErrorSchema>
export type ConnectionSummary = z.infer<typeof ConnectionSummarySchema>
export type ConnectionsResponse = z.infer<typeof ConnectionsResponseSchema>
export type HealthResponse = z.infer<typeof HealthResponseSchema>
export type SyncJob = z.infer<typeof SyncJobSchema>
