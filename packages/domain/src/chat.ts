/** Portable chat records. Provider-native checkpoints and credentials are never UI parts. */
export type ChatRunStatus =
  'queued' | 'running' | 'completed' | 'cancelled' | 'interrupted' | 'failed'
export type ChatMediaKind =
  | 'book'
  | 'movie'
  | 'article'
  | 'podcast_episode'
  | 'song'
  | 'video'
  | 'album'
  | 'artist'
  | 'show'
  | 'channel'
export type ChatPart =
  | { type: 'text'; id: string; text: string }
  | { type: 'reasoning_summary'; id: string; text: string }
  | {
      type: 'tool_activity'
      id: string
      name: string
      title: string
      detail: string
      status: 'running' | 'succeeded' | 'failed' | 'cancelled'
      startedAt: string
      finishedAt: string | null
      evidenceId: string | null
    }
  | { type: 'citation'; id: string; title: string; url: string }
  | {
      type: 'media_reference'
      id: string
      kind: ChatMediaKind
      itemId: string
      title: string
      evidenceId: string
    }

export interface ChatConversation {
  id: string
  title: string
  titleOrigin: 'fallback' | 'generated' | 'manual'
  favorite: boolean
  metadataRevision: number
  publicationRevision: number
  transcriptRevision: number
  headId: string | null
  activeRunId: string | null
  createdAt: string
  lastActivityAt: string
  deletedAt: string | null
}
export interface ChatMessage {
  id: string
  sequence: number
  parentId: string | null
  runId: string
  role: 'user' | 'assistant'
  status: 'streaming' | 'complete' | 'partial'
  parts: ChatPart[]
  createdAt: string
}
export interface ChatRun {
  id: string
  conversationId: string
  operationKey: string
  inputHash: string
  status: ChatRunStatus
  userMessageId: string
  assistantMessageId: string
  provider: string
  model: string
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  errorCode: string | null
  inputTokens: number
  outputTokens: number
  webCalls: number
  usageUnknown: boolean
  providerResponseId: string | null
  checkpointKey: string | null
}
export interface ChatSnapshot {
  conversation: ChatConversation
  messages: ChatMessage[]
  activeRun: ChatRun | null
  beforeSequence: number | null
  lastEventSequence: number
}
export type ChatEventPayload =
  | { type: 'message'; message: ChatMessage }
  | { type: 'run'; run: ChatRun }
  | { type: 'metadata'; conversation: ChatConversation }
export interface ChatEvent {
  sequence: number
  runId: string | null
  payload: ChatEventPayload
}
export function chatRunTerminal(status: ChatRunStatus): boolean {
  return status !== 'queued' && status !== 'running'
}
