import { z } from 'zod'
import {
  ChatConversationSchema,
  ChatListSchema,
  ChatPublicRunSchema,
  ChatSnapshotSchema,
  ChatEventSchema,
  type ChatSnapshotRecord,
} from '@media-tracker/contracts'
import type { QueryClient, InfiniteData } from '@tanstack/react-query'

const prefix = '/api/chat'
export const snapshotSchema = ChatSnapshotSchema.extend({
  latestRun: ChatPublicRunSchema.nullable().optional(),
})
export class ChatApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code)
  }
}
export async function chatRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${prefix}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
    cache: 'no-store',
  })
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok)
    throw new ChatApiError(
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : 'chat_network_error',
      response.status,
    )
  return schema.parse(data)
}
export const chatKeys = {
  lists: ['chat', 'lists'] as const,
  snapshot: (id: string) => ['chat', 'snapshot', id] as const,
}
export const chatAccepted = z.object({ run: ChatPublicRunSchema, snapshot: ChatSnapshotSchema })
export const chatConfig = z.object({
  enabled: z.boolean(),
  provider: z.string(),
  model: z.string(),
  creditLimitUsd: z.number(),
  creditExpiresAt: z.string().nullable(),
  capabilities: z.record(z.string(), z.boolean()),
})
export { ChatListSchema, ChatConversationSchema }
export function refreshChatLists(client: QueryClient) {
  client.setQueriesData<InfiniteData<z.infer<typeof ChatListSchema>>>(
    { queryKey: chatKeys.lists },
    (old) => (old ? { pages: old.pages.slice(0, 1), pageParams: old.pageParams.slice(0, 1) } : old),
  )
  void client.invalidateQueries({ queryKey: chatKeys.lists })
}
export function applyChatEvent(
  current: ChatSnapshotRecord,
  event: z.infer<typeof ChatEventSchema>,
): ChatSnapshotRecord {
  if (event.sequence <= current.lastEventSequence) return current
  const next = { ...current, lastEventSequence: event.sequence }
  if (event.payload.type === 'metadata') next.conversation = event.payload.conversation
  else if (event.payload.type === 'message') {
    const message = event.payload.message
    next.messages = [...current.messages.filter((x) => x.id !== message.id), message].sort(
      (a, b) => a.sequence - b.sequence,
    )
  } else {
    const run = event.payload.run
    next.latestRun = run
    next.activeRun = run.status === 'queued' || run.status === 'running' ? run : null
  }
  return next
}
export function chatErrorText(error: unknown): string {
  const code = error instanceof ChatApiError ? error.code : ''
  const texts: Record<string, string> = {
    chat_run_active: 'A response is already running in this chat.',
    chat_head_conflict:
      'This chat changed in another tab. Your draft is saved; review the latest messages before sending.',
    chat_metadata_conflict: 'This chat changed in another tab. Refresh and try again.',
    chat_cursor_stale: 'The list changed. Refresh to load the latest chats.',
    chat_credit_limit:
      'The configured credit allowance is used or reserved. No additional request was sent.',
    chat_credit_unavailable: 'The included credits are unavailable or expired.',
    chat_provider_quota: 'OpenAI reported a usage or credit limit. Your messages are saved.',
    chat_provider_access: 'OpenAI could not authorize this request.',
    chat_not_found: 'This chat was deleted or could not be found.',
    chat_concurrency_limit: 'Two chats are already running. Wait or stop one before sending.',
    chat_interrupted: 'The response was interrupted. The partial answer is saved.',
    chat_response_limit: 'The response reached its limit. The partial answer is saved.',
    chat_paused: 'Chat is paused.',
    chat_tool_step_limit: 'The response reached its tool limit. The partial answer is saved.',
  }
  return texts[code] ?? 'Could not complete this request. Your messages are saved.'
}
