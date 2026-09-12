import {
  ApiErrorSchema,
  ConnectionsResponseSchema,
  HealthResponseSchema,
  LetterboxdImportResponseSchema,
  MediaListResponseSchema,
  MediaSummarySchema,
  ReadwiseSyncResponseSchema,
  SyncRunsResponseSchema,
} from '@media-tracker/contracts'
import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { HTTPException } from 'hono/http-exception'
import { mediaItemId } from '@media-tracker/domain'

import type { ApiError } from '@media-tracker/contracts'

import { createLedgerRepository, type AppEnv } from './env'
import { importLetterboxdExport, LetterboxdImportError } from './letterboxd-import'
import { requestContext, requestLogger, securityHeaders } from './middleware'
import { ReadwiseTokenMissingError, syncReadwiseArchive } from './readwise-sync'

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

const readwiseSyncRoute = createRoute({
  method: 'post',
  path: '/api/connections/readwise/sync',
  tags: ['Connections'],
  responses: {
    200: jsonContent(ReadwiseSyncResponseSchema, 'Completed Readwise Archive import'),
    503: jsonContent(ApiErrorSchema, 'Readwise is not configured or unavailable'),
  },
})

const letterboxdImportRoute = createRoute({
  method: 'post',
  path: '/api/connections/letterboxd/import',
  tags: ['Connections'],
  responses: {
    200: jsonContent(LetterboxdImportResponseSchema, 'Completed Letterboxd export import'),
    400: jsonContent(ApiErrorSchema, 'The upload is not a supported Letterboxd export'),
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

app.openapi(mediaRoute, async (context) => {
  const data = await createLedgerRepository(context.env.DB).listMedia()
  return context.json(MediaListResponseSchema.parse({ data, nextCursor: null }), 200)
})

app.openapi(mediaDetailRoute, async (context) => {
  const id = context.req.valid('param').id
  const item = await createLedgerRepository(context.env.DB).findMedia(mediaItemId(id))

  if (item !== null) return context.json(MediaSummarySchema.parse(item), 200)

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

app.openapi(readwiseSyncRoute, async (context) => {
  try {
    return context.json(
      ReadwiseSyncResponseSchema.parse(await syncReadwiseArchive(context.env)),
      200,
    )
  } catch (error) {
    if (!(error instanceof ReadwiseTokenMissingError)) throw error
    return context.json(
      ApiErrorSchema.parse({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Readwise is not configured. Add READWISE_TOKEN to the Worker secrets.',
          requestId: context.get('requestId'),
        },
      }),
      503,
    )
  }
})

app.openapi(letterboxdImportRoute, async (context) => {
  const declaredLength = Number(context.req.header('content-length') ?? '0')
  if (Number.isFinite(declaredLength) && declaredLength > 25 * 1024 * 1024) {
    return context.json(
      ApiErrorSchema.parse({
        error: {
          code: 'BAD_REQUEST',
          message: 'Letterboxd exports must be 25 MB or smaller.',
          requestId: context.get('requestId'),
        },
      }),
      400,
    )
  }

  try {
    const archive = new Uint8Array(await context.req.arrayBuffer())
    if (archive.byteLength > 25 * 1024 * 1024) {
      throw new LetterboxdImportError('Letterboxd exports must be 25 MB or smaller.')
    }
    return context.json(
      LetterboxdImportResponseSchema.parse(await importLetterboxdExport(context.env, archive)),
      200,
    )
  } catch (error) {
    if (!(error instanceof LetterboxdImportError)) throw error
    return context.json(
      ApiErrorSchema.parse({
        error: {
          code: 'BAD_REQUEST',
          message: error.message,
          requestId: context.get('requestId'),
        },
      }),
      400,
    )
  }
})

app.openapi(connectionsRoute, async (context) => {
  const repository = createLedgerRepository(context.env.DB)
  const sources = ['readwise', 'hardcover', 'letterboxd', 'spotify', 'youtube'] as const
  const data = []
  for (const source of sources) {
    const connection = await repository.findConnectionBySource(source)
    const lastSuccessfulSyncAt =
      connection === null ? null : await repository.findLastSuccessfulSyncAt(connection.id)
    data.push({
      source,
      status:
        connection === null
          ? ('disconnected' as const)
          : connection.status === 'connected'
            ? ('connected' as const)
            : ('degraded' as const),
      lastSuccessfulSyncAt,
    })
  }
  return context.json(
    ConnectionsResponseSchema.parse({
      data,
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
