import {
  ApiErrorSchema,
  ConnectionsResponseSchema,
  HealthResponseSchema,
  MediaListResponseSchema,
  MediaSummarySchema,
  SyncRunsResponseSchema,
} from '@media-tracker/contracts'
import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { HTTPException } from 'hono/http-exception'

import type { ApiError } from '@media-tracker/contracts'

import type { AppEnv } from './env'
import { requestContext, requestLogger, securityHeaders } from './middleware'

const apiVersion = '0.0.0'

const jsonContent = <Schema>(schema: Schema, description: string) => ({
  content: {
    'application/json': {
      schema,
    },
  },
  description,
})

const healthRoute = createRoute({
  method: 'get',
  path: '/api/health',
  tags: ['System'],
  responses: {
    200: jsonContent(HealthResponseSchema, 'API and local Worker health'),
  },
})

const mediaRoute = createRoute({
  method: 'get',
  path: '/api/media',
  tags: ['Media'],
  responses: {
    200: jsonContent(MediaListResponseSchema, 'Media history'),
  },
})

const mediaDetailRoute = createRoute({
  method: 'get',
  path: '/api/media/{id}',
  tags: ['Media'],
  request: {
    params: MediaSummarySchema.pick({ id: true }),
  },
  responses: {
    200: jsonContent(MediaSummarySchema, 'Media item'),
    404: jsonContent(ApiErrorSchema, 'Media item not found'),
  },
})

const connectionsRoute = createRoute({
  method: 'get',
  path: '/api/connections',
  tags: ['Connections'],
  responses: {
    200: jsonContent(ConnectionsResponseSchema, 'Source connection status'),
  },
})

const syncRunsRoute = createRoute({
  method: 'get',
  path: '/api/sync-runs',
  tags: ['Sync'],
  responses: {
    200: jsonContent(SyncRunsResponseSchema, 'Recent synchronization runs'),
  },
})

const app = new OpenAPIHono<AppEnv>()

app.use('*', securityHeaders)
app.use('*', requestContext)
app.use('*', requestLogger)

app.openapi(healthRoute, (context) => {
  return context.json(
    HealthResponseSchema.parse({
      status: 'ok',
      service: 'media-tracker-api',
      version: apiVersion,
      timestamp: new Date().toISOString(),
      requestId: context.get('requestId'),
    }),
    200,
  )
})

app.openapi(mediaRoute, (context) => {
  return context.json(MediaListResponseSchema.parse({ data: [], nextCursor: null }), 200)
})

app.openapi(mediaDetailRoute, (context) => {
  const id = context.req.valid('param').id

  return context.json(
    ApiErrorSchema.parse({
      error: {
        code: 'NOT_FOUND',
        message: `No media item exists with ID ${id}.`,
        requestId: context.get('requestId'),
      },
    }),
    404,
  )
})

app.openapi(connectionsRoute, (context) => {
  return context.json(
    ConnectionsResponseSchema.parse({
      data: ['readwise', 'hardcover', 'letterboxd', 'spotify', 'youtube'].map((source) => ({
        source,
        status: 'disconnected',
        lastSuccessfulSyncAt: null,
      })),
    }),
    200,
  )
})

app.openapi(syncRunsRoute, (context) => {
  return context.json(SyncRunsResponseSchema.parse({ data: [], nextCursor: null }), 200)
})

app.doc('/api/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'Media Tracker API',
    version: apiVersion,
  },
})

app.notFound((context) => {
  return context.json(
    ApiErrorSchema.parse({
      error: {
        code: 'NOT_FOUND',
        message: 'The requested API route does not exist.',
        requestId: context.get('requestId'),
      },
    }),
    404,
  )
})

app.onError((error, context) => {
  const status = error instanceof HTTPException ? error.status : 500
  const code: ApiError['error']['code'] = status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR'

  console.error(
    JSON.stringify({
      level: 'error',
      event: 'request.failed',
      requestId: context.get('requestId'),
      status,
      errorName: error.name,
    }),
  )

  return context.json(
    ApiErrorSchema.parse({
      error: {
        code,
        message:
          status === 404
            ? 'The requested resource was not found.'
            : 'An unexpected error occurred.',
        requestId: context.get('requestId'),
      },
    }),
    status,
  )
})

export default app
