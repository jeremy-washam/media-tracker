import { z } from 'zod'

export const ChatConversationIdSchema = z.string().regex(/^c_[a-f0-9]{32}$/)
export const ChatRunIdSchema = z.string().regex(/^c_[a-f0-9]{32}\.[0-9A-HJKMNP-TV-Z]{26}$/)
const boundedId = z.string().min(1).max(160)
export const ChatMediaKindSchema = z.enum([
  'book',
  'movie',
  'article',
  'podcast_episode',
  'song',
  'video',
  'album',
  'artist',
  'show',
  'channel',
])
const safeUrl = z.url().refine((value) => {
  const u = new URL(value)
  return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password
}, 'Invalid public link')
export const ChatPartSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), id: boundedId, text: z.string().max(300_000) }),
  z.object({ type: z.literal('reasoning_summary'), id: boundedId, text: z.string().max(40_000) }),
  z.object({
    type: z.literal('tool_activity'),
    id: boundedId,
    name: z.string().max(80),
    title: z.string().max(160),
    detail: z.string().max(1000),
    status: z.enum(['running', 'succeeded', 'failed', 'cancelled']),
    startedAt: z.string(),
    finishedAt: z.string().nullable(),
    evidenceId: boundedId.nullable(),
  }),
  z.object({
    type: z.literal('citation'),
    id: boundedId,
    title: z.string().max(500),
    url: safeUrl,
  }),
  z.object({
    type: z.literal('media_reference'),
    id: boundedId,
    kind: ChatMediaKindSchema,
    itemId: boundedId,
    title: z.string().max(500),
    evidenceId: boundedId,
  }),
])
export const ChatConversationSchema = z.object({
  id: ChatConversationIdSchema,
  title: z.string().max(200),
  titleOrigin: z.enum(['fallback', 'generated', 'manual']),
  favorite: z.boolean(),
  metadataRevision: z.number().int().nonnegative(),
  publicationRevision: z.number().int().nonnegative(),
  transcriptRevision: z.number().int().nonnegative(),
  headId: boundedId.nullable(),
  activeRunId: ChatRunIdSchema.nullable(),
  createdAt: z.string(),
  lastActivityAt: z.string(),
  deletedAt: z.string().nullable(),
})
export const ChatMessageSchema = z.object({
  id: boundedId,
  sequence: z.number().int().positive(),
  parentId: boundedId.nullable(),
  runId: ChatRunIdSchema,
  role: z.enum(['user', 'assistant']),
  status: z.enum(['streaming', 'complete', 'partial']),
  parts: z.array(ChatPartSchema).max(200),
  createdAt: z.string(),
})
export const ChatRunSchema = z.object({
  id: ChatRunIdSchema,
  conversationId: ChatConversationIdSchema,
  operationKey: z.string().max(128),
  inputHash: z.string().max(128),
  status: z.enum(['queued', 'running', 'completed', 'cancelled', 'interrupted', 'failed']),
  userMessageId: boundedId,
  assistantMessageId: boundedId,
  provider: z.string(),
  model: z.string(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  errorCode: z.string().nullable(),
  inputTokens: z.number().nonnegative(),
  outputTokens: z.number().nonnegative(),
  webCalls: z.number().nonnegative(),
  usageUnknown: z.boolean(),
  providerResponseId: z.string().nullable(),
  checkpointKey: z.string().nullable(),
})
export const ChatPublicRunSchema = ChatRunSchema.omit({
  inputHash: true,
  checkpointKey: true,
  providerResponseId: true,
  operationKey: true,
})
export const ChatSnapshotSchema = z.object({
  conversation: ChatConversationSchema,
  messages: z.array(ChatMessageSchema),
  activeRun: ChatPublicRunSchema.nullable(),
  beforeSequence: z.number().int().positive().nullable(),
  lastEventSequence: z.number().int().nonnegative(),
})
export const ChatSendSchema = z
  .object({
    operationKey: z.string().uuid(),
    text: z.string().trim().min(1).max(32_000),
    expectedHeadId: boundedId.nullable().default(null),
    expectedTranscriptRevision: z.number().int().nonnegative().default(0),
  })
  .strict()
export const ChatMetadataPatchSchema = z
  .object({
    expectedMetadataRevision: z.number().int().nonnegative(),
    title: z.string().trim().min(1).max(200).optional(),
    favorite: z.boolean().optional(),
  })
  .strict()
  .refine((x) => x.title !== undefined || x.favorite !== undefined, 'No metadata change')
export const ChatListQuerySchema = z.object({
  section: z.enum(['favorites', 'chats']),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(2048).optional(),
})
export const ChatListSchema = z.object({
  data: z.array(ChatConversationSchema),
  nextCursor: z.string().nullable(),
  revision: z.string(),
})
export const ChatEventsQuerySchema = z.object({
  after: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(200).default(100),
})
export const ChatQueryMediaSchema = z
  .object({
    scope: z.enum(['archive', 'queue', 'all']).default('archive'),
    output: z.enum(['items', 'statistics', 'both']).default('both'),
    filters: z
      .object({
        types: z
          .array(z.enum(['book', 'movie', 'article', 'podcast_episode', 'song', 'video']))
          .min(1)
          .max(6)
          .optional(),
        query: z.string().trim().max(200).optional(),
        creator: z.string().trim().max(160).optional(),
        consumed: z
          .object({
            from: z.iso.date().optional(),
            toExclusive: z.iso.date().optional(),
            timezone: z.literal('America/New_York').default('America/New_York'),
          })
          .strict()
          .optional(),
        minimumRating: z.number().min(0).max(5).optional(),
        minimumOccurrences: z.number().int().min(1).max(1000).optional(),
      })
      .strict()
      .default({}),
    statistics: z
      .object({
        measures: z
          .array(z.enum(['distinct_items', 'consumption_occurrences']))
          .min(1)
          .max(2)
          .default(['distinct_items']),
        groupBy: z.enum(['media_type', 'year', 'month']).optional(),
      })
      .strict()
      .default({ measures: ['distinct_items'] }),
    sort: z.enum(['consumed_desc', 'title']).default('consumed_desc'),
    limit: z.number().int().min(1).max(30).default(15),
    cursor: z.string().max(2048).optional(),
  })
  .strict()
export const ChatMediaDetailsSchema = z
  .object({
    references: z
      .array(z.object({ kind: ChatMediaKindSchema, id: boundedId }).strict())
      .min(1)
      .max(5),
    includes: z
      .array(z.enum(['history', 'reviews', 'highlights', 'text']))
      .max(4)
      .default([]),
    passageQuery: z.string().trim().max(200).optional(),
    cursor: z.string().max(2048).optional(),
  })
  .strict()
export type ChatSend = z.infer<typeof ChatSendSchema>
export type ChatMetadataPatch = z.infer<typeof ChatMetadataPatchSchema>
export type ChatQueryMedia = z.infer<typeof ChatQueryMediaSchema>
export type ChatMediaDetails = z.infer<typeof ChatMediaDetailsSchema>
export const ChatEventSchema = z.object({
  sequence: z.number().int().positive(),
  runId: ChatRunIdSchema.nullable(),
  payload: z.discriminatedUnion('type', [
    z.object({ type: z.literal('message'), message: ChatMessageSchema }),
    z.object({ type: z.literal('metadata'), conversation: ChatConversationSchema }),
    z.object({ type: z.literal('run'), run: ChatPublicRunSchema }),
  ]),
})
export type ChatConversationRecord = z.infer<typeof ChatConversationSchema>
export type ChatMessageRecord = z.infer<typeof ChatMessageSchema>
export type ChatPublicRun = z.infer<typeof ChatPublicRunSchema>
export type ChatSnapshotRecord = z.infer<typeof ChatSnapshotSchema> & {
  latestRun?: ChatPublicRun | null
}
export type ChatMediaReference = z.infer<typeof ChatMediaKindSchema>
