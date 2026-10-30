import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { bodyLimit } from 'hono/body-limit'
import {
  ChatConversationIdSchema,
  ChatRunIdSchema,
  ChatSendSchema,
  ChatMetadataPatchSchema,
  ChatConversationSchema,
  ChatListQuerySchema,
  ChatListSchema,
  ChatSnapshotSchema,
  ChatPublicRunSchema,
} from '@media-tracker/contracts'
import { D1DatabaseClient, SqlChatIndex, ChatConflict } from '@media-tracker/db'
import type { AppEnv } from '../env'
import { chatConfiguration } from './conversation-object'
import { chatCursor, chatDigest, readChatCursor } from './security'

const errorSchema = z.object({ error: z.string() })
const errors = {
  default: {
    description: 'Runtime forwarding error',
    content: { 'text/html': { schema: z.string() } },
  },
  400: { description: 'Invalid request', content: { 'application/json': { schema: errorSchema } } },
  404: { description: 'Not found', content: { 'application/json': { schema: errorSchema } } },
  409: {
    description: 'Conflict; refresh current state',
    content: { 'application/json': { schema: errorSchema } },
  },
  429: {
    description: 'Allowance or concurrency limit',
    content: { 'application/json': { schema: errorSchema } },
  },
  503: {
    description: 'Chat unavailable',
    content: { 'application/json': { schema: errorSchema } },
  },
}
const params = z.object({ id: ChatConversationIdSchema }),
  runParams = params.extend({ runId: ChatRunIdSchema })
const accepted = z.object({ run: ChatPublicRunSchema, snapshot: ChatSnapshotSchema })
const listCursor = z.object({
  section: z.enum(['favorites', 'chats']),
  revision: z.string(),
  anchor: z.object({ at: z.string(), id: ChatConversationIdSchema }),
})
const chat = new OpenAPIHono<AppEnv>({
  defaultHook: (result, c) => {
    if (!result.success)
      return c.json(
        { error: 'chat_invalid_request', fields: result.error.issues.map((x) => x.path.join('.')) },
        400,
      )
  },
})
chat.onError((error, c) => {
  if (error instanceof ChatConflict)
    return new Response(JSON.stringify({ error: error.code }), {
      status: error.status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    })
  return c.json(
    { error: error instanceof z.ZodError ? 'chat_invalid_request' : 'chat_unavailable' },
    error instanceof z.ZodError ? 400 : 503,
  )
})
chat.use(
  '*',
  bodyLimit({ maxSize: 140_000, onError: (c) => c.json({ error: 'chat_request_too_large' }, 413) }),
)
chat.use('*', async (c, next) => {
  c.header('cache-control', 'no-store')
  const origin = c.req.header('origin')
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) &&
    ((origin && origin !== new URL(c.req.url).origin) ||
      c.req.header('sec-fetch-site') === 'cross-site')
  )
    return c.json({ error: 'chat_origin_denied' }, 403)
  await next()
})
async function forward(
  c: { env: AppEnv['Bindings']; req: { raw: Request; json: () => Promise<unknown> } },
  id: string,
  suffix = '',
  method?: string,
) {
  if (!c.env.CHAT_CONVERSATIONS) throw new ChatConflict('chat_unavailable', 503)
  const url = new URL(c.req.raw.url)
  url.pathname = `/${id}${suffix}`
  return c.env.CHAT_CONVERSATIONS.get(c.env.CHAT_CONVERSATIONS.idFromName(id)).fetch(
    new Request(url, {
      method: method ?? c.req.raw.method,
      headers: {
        'content-type': 'application/json',
        ...(c.req.raw.headers.get('last-event-id')
          ? { 'last-event-id': c.req.raw.headers.get('last-event-id')! }
          : {}),
      },
      ...(!['GET', 'HEAD', 'DELETE'].includes(method ?? c.req.raw.method)
        ? { body: JSON.stringify(await c.req.json()) }
        : {}),
      signal: c.req.raw.signal,
    }),
  )
}
chat.openapi(
  createRoute({
    method: 'get',
    path: '/config',
    responses: {
      200: {
        description: 'Server capabilities and configured credit expiry',
        content: {
          'application/json': {
            schema: z.object({
              enabled: z.boolean(),
              provider: z.string(),
              model: z.string(),
              creditLimitUsd: z.number(),
              creditExpiresAt: z.string().nullable(),
              capabilities: z.record(z.string(), z.boolean()),
            }),
          },
        },
      },
      ...errors,
    },
  }),
  (c) => c.json(chatConfiguration(c.env), 200),
)
chat.openapi(
  createRoute({
    method: 'get',
    path: '/conversations',
    request: { query: ChatListQuerySchema },
    responses: {
      200: {
        description: 'Bounded section with unlimited continuation',
        content: { 'application/json': { schema: ChatListSchema } },
      },
      ...errors,
    },
  }),
  async (c) => {
    const query = c.req.valid('query'),
      secret = c.env.TOKEN_ENCRYPTION_KEY ?? c.env.OPENAI_API_KEY
    if (!secret) throw new ChatConflict('chat_unavailable', 503)
    const cursor = query.cursor
      ? listCursor.parse(await readChatCursor(query.cursor, 'index', secret))
      : null
    if (cursor && cursor.section !== query.section)
      throw new ChatConflict('chat_cursor_invalid', 400)
    const result = await new SqlChatIndex(
      new D1DatabaseClient(c.env.DB, c.get('databaseUsageObserver')),
    ).list({
      favorite: query.section === 'favorites',
      limit: query.limit,
      ...(cursor ? { anchor: cursor.anchor, revision: cursor.revision } : {}),
    })
    return c.json(
      {
        data: result.data,
        revision: result.revision,
        nextCursor: result.next
          ? await chatCursor(
              'index',
              { section: query.section, revision: result.revision, anchor: result.next },
              secret,
            )
          : null,
      },
      200,
    )
  },
)
chat.openapi(
  createRoute({
    method: 'post',
    path: '/conversations',
    request: {
      body: { required: true, content: { 'application/json': { schema: ChatSendSchema } } },
    },
    responses: {
      202: {
        description: 'Durably admitted',
        content: { 'application/json': { schema: accepted } },
      },
      ...errors,
    },
  }),
  async (c) => {
    const input = c.req.valid('json')
    const id = `c_${(await chatDigest(`imladris-chat:${input.operationKey}`)).slice(0, 32)}`
    return forward(c, id, '/runs')
  },
)
chat.openapi(
  createRoute({
    method: 'get',
    path: '/conversations/{id}',
    request: { params, query: z.object({ before: z.coerce.number().int().positive().optional() }) },
    responses: {
      200: {
        description: 'Canonical chat and message page',
        content: {
          'application/json': {
            schema: ChatSnapshotSchema.extend({ latestRun: ChatPublicRunSchema.nullable() }),
          },
        },
      },
      ...errors,
    },
  }),
  (c) => forward(c, c.req.valid('param').id),
)
chat.openapi(
  createRoute({
    method: 'patch',
    path: '/conversations/{id}',
    request: {
      params,
      body: {
        required: true,
        content: { 'application/json': { schema: ChatMetadataPatchSchema } },
      },
    },
    responses: {
      200: {
        description: 'Updated metadata',
        content: { 'application/json': { schema: ChatConversationSchema } },
      },
      ...errors,
    },
  }),
  (c) => forward(c, c.req.valid('param').id),
)
chat.openapi(
  createRoute({
    method: 'delete',
    path: '/conversations/{id}',
    request: { params },
    responses: {
      202: {
        description: 'Tombstone committed; owned evidence cleanup queued',
        content: {
          'application/json': {
            schema: z.object({
              conversation: ChatConversationSchema,
              cleanup: z.literal('pending'),
            }),
          },
        },
      },
      ...errors,
    },
  }),
  (c) => forward(c, c.req.valid('param').id),
)
chat.openapi(
  createRoute({
    method: 'post',
    path: '/conversations/{id}/runs',
    request: {
      params,
      body: { required: true, content: { 'application/json': { schema: ChatSendSchema } } },
    },
    responses: {
      202: {
        description: 'Durably admitted',
        content: { 'application/json': { schema: accepted } },
      },
      ...errors,
    },
  }),
  (c) => forward(c, c.req.valid('param').id, '/runs'),
)
chat.openapi(
  createRoute({
    method: 'get',
    path: '/conversations/{id}/runs/{runId}',
    request: { params: runParams },
    responses: {
      200: {
        description: 'Authoritative run status',
        content: { 'application/json': { schema: ChatPublicRunSchema } },
      },
      ...errors,
    },
  }),
  (c) => {
    const p = c.req.valid('param')
    return forward(c, p.id, `/runs/${p.runId}`)
  },
)
chat.openapi(
  createRoute({
    method: 'post',
    path: '/conversations/{id}/runs/{runId}/cancel',
    request: { params: runParams },
    responses: {
      200: {
        description: 'Durably stopped or already terminal',
        content: { 'application/json': { schema: accepted } },
      },
      ...errors,
    },
  }),
  (c) => {
    const p = c.req.valid('param')
    return forward(c, p.id, `/runs/${p.runId}/cancel`)
  },
)
chat.openapi(
  createRoute({
    method: 'get',
    path: '/conversations/{id}/runs/{runId}/events',
    request: {
      params: runParams,
      query: z.object({ after: z.coerce.number().int().nonnegative().default(0) }),
    },
    responses: {
      200: {
        description:
          'Replayed application events with monotonic IDs. Disconnect does not cancel inference.',
        content: { 'text/event-stream': { schema: z.string() } },
      },
      ...errors,
    },
  }),
  (c) => {
    const p = c.req.valid('param')
    return forward(c, p.id, `/runs/${p.runId}/events`)
  },
)
chat.openapi(
  createRoute({
    method: 'get',
    path: '/conversations/{id}/export',
    request: { params },
    responses: {
      200: {
        description: 'Portable versioned NDJSON transcript and retained evidence',
        content: { 'application/x-ndjson': { schema: z.string() } },
      },
      ...errors,
    },
  }),
  (c) => forward(c, c.req.valid('param').id, '/export'),
)
chat.openapi(
  createRoute({
    method: 'get',
    path: '/conversations/{id}/evidence/{evidenceId}',
    request: {
      params: params.extend({
        evidenceId: z.string().regex(/^c_[a-f0-9]{32}\.e_[0-9A-HJKMNP-TV-Z]{26}$/),
      }),
    },
    responses: {
      200: {
        description: 'Retained tool evidence, with no storage credentials',
        content: { 'application/json': { schema: z.unknown() } },
      },
      ...errors,
    },
  }),
  (c) => {
    const p = c.req.valid('param')
    return forward(c, p.id, `/evidence/${p.evidenceId}`)
  },
)
export default chat
