import OpenAI from 'openai'
import type { ResponseInput, Tool, ResponseOutputItem } from 'openai/resources/responses/responses'
import { publicChatUrl } from './security'

export interface ChatProviderResult {
  id: string
  status: string
  output: unknown[]
  raw: unknown
  calls: { id: string; name: string; arguments: string }[]
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  cacheWriteTokens: number
  webCalls: number
}
export type ChatProviderEvent =
  | { type: 'text'; id: string; text: string }
  | { type: 'summary'; id: string; text: string }
  | { type: 'citation'; id: string; title: string; url: string }
  | { type: 'web_activity'; id: string; status: 'running' | 'succeeded'; detail: string }
  | { type: 'completed'; result: ChatProviderResult }
export type ChatProviderInput =
  | { type: 'message'; role: 'user' | 'assistant'; text: string }
  | { type: 'tool_result'; callId: string; content: string }
  | { type: 'provider_output'; provider: string; items: unknown[] }
export interface ChatFunctionTool {
  name: string
  description: string
  parameters: Record<string, unknown>
}
export interface ChatProviderRequest {
  input: ChatProviderInput[]
  instructions: string
  mode: 'chat' | 'web' | 'title'
  tools?: ChatFunctionTool[]
  signal: AbortSignal
  maxOutputTokens: number
}
export interface ChatProvider {
  readonly id: string
  readonly model: string
  reservation(request: ChatProviderRequest): number
  charge(result: ChatProviderResult): number
  stream(request: ChatProviderRequest): AsyncIterable<ChatProviderEvent>
}
export class OpenAIChatProvider implements ChatProvider {
  readonly id = 'openai'
  private readonly client: OpenAI
  constructor(
    key: string,
    readonly model = 'gpt-6.1-sol',
    customFetch?: typeof fetch,
  ) {
    this.client = new OpenAI({
      apiKey: key,
      maxRetries: 0,
      timeout: 180_000,
      ...(customFetch ? { fetch: customFetch } : {}),
    })
  }
  reservation(request: ChatProviderRequest) {
    return chatProviderReservation(request)
  }
  charge(result: ChatProviderResult) {
    return chatProviderCharge(result)
  }
  async *stream(request: ChatProviderRequest): AsyncIterable<ChatProviderEvent> {
    const nativeInput = request.input.flatMap((item) => {
      if (item.type === 'message') return [{ role: item.role, content: item.text }]
      if (item.type === 'tool_result')
        return [{ type: 'function_call_output', call_id: item.callId, output: item.content }]
      if (item.provider !== this.id) throw new Error('chat_provider_checkpoint_mismatch')
      return item.items
    }) as ResponseInput
    const stream = await this.client.responses.create(
      {
        model: this.model,
        input: nativeInput,
        instructions: request.instructions,
        stream: true,
        store: false,
        reasoning: { effort: request.mode === 'title' ? 'low' : 'medium', summary: 'auto' },
        max_output_tokens: request.maxOutputTokens,
        service_tier: 'default',
        include: ['reasoning.encrypted_content'],
        ...(request.mode === 'web'
          ? {
              tools: [
                {
                  type: 'web_search',
                  search_context_size: 'low',
                  user_location: { type: 'approximate' },
                },
              ],
              tool_choice: 'required',
              max_tool_calls: 2,
            }
          : request.tools
            ? {
                tools: request.tools.map((tool) => ({
                  type: 'function',
                  strict: false,
                  ...tool,
                })) as Tool[],
                parallel_tool_calls: false,
              }
            : {}),
      },
      { signal: request.signal },
    )
    let terminal = false
    for await (const event of stream) {
      if (event.type === 'response.output_text.delta')
        yield { type: 'text', id: event.item_id, text: event.delta }
      else if (event.type === 'response.reasoning_summary_text.delta')
        yield { type: 'summary', id: `${event.item_id}:${event.summary_index}`, text: event.delta }
      else if (
        event.type === 'response.output_text.annotation.added' &&
        event.annotation?.type === 'url_citation'
      ) {
        const url = publicChatUrl(event.annotation.url)
        if (url)
          yield {
            type: 'citation',
            id: `web:${url}`,
            title: event.annotation.title.slice(0, 500),
            url,
          }
      } else if (
        event.type === 'response.web_search_call.in_progress' ||
        event.type === 'response.web_search_call.searching' ||
        event.type === 'response.web_search_call.completed'
      )
        yield {
          type: 'web_activity',
          id: event.item_id,
          status: event.type.endsWith('.completed') ? 'succeeded' : 'running',
          detail: event.type.endsWith('.searching')
            ? 'Searching the web'
            : event.type.endsWith('.completed')
              ? 'Web action completed'
              : 'Working with the web',
        }
      else if (
        event.type === 'response.completed' ||
        event.type === 'response.incomplete' ||
        event.type === 'response.failed'
      ) {
        terminal = true
        const response = event.response,
          usage = response.usage
        const writes =
          usage?.input_tokens_details && 'cache_write_tokens' in usage.input_tokens_details
            ? Number(usage.input_tokens_details.cache_write_tokens) || 0
            : 0
        yield {
          type: 'completed',
          result: {
            id: response.id,
            status: response.status ?? 'failed',
            output: response.output,
            raw: response,
            calls: response.output
              .filter(
                (item): item is Extract<ResponseOutputItem, { type: 'function_call' }> =>
                  item.type === 'function_call',
              )
              .map((item) => ({ id: item.call_id, name: item.name, arguments: item.arguments })),
            inputTokens: usage?.input_tokens ?? 0,
            outputTokens: usage?.output_tokens ?? 0,
            cachedTokens: usage?.input_tokens_details?.cached_tokens ?? 0,
            cacheWriteTokens: writes,
            webCalls: response.output.filter((item) => item.type === 'web_search_call').length,
          },
        }
      } else if (event.type === 'error') throw new Error('chat_provider_stream_error')
    }
    if (!terminal) throw new Error('chat_provider_stream_interrupted')
  }
}
/** Standard Sol prices, integer microdollars. Cache writes use their higher rate. */
export function chatProviderCharge(result: ChatProviderResult) {
  return Math.ceil(
    Math.max(0, result.inputTokens - result.cachedTokens - result.cacheWriteTokens) * 2 +
      result.cachedTokens * 0.1 +
      result.cacheWriteTokens * 2.5 +
      result.outputTokens * 10 +
      result.webCalls * 10_000,
  )
}
export function chatProviderReservation(
  request: Pick<
    ChatProviderRequest,
    'input' | 'instructions' | 'maxOutputTokens' | 'tools' | 'mode'
  >,
) {
  const bytes = new TextEncoder().encode(
    JSON.stringify(request.input) + request.instructions + JSON.stringify(request.tools ?? []),
  ).length
  if (bytes > 180_000) throw new Error('chat_context_limit')
  return Math.ceil(
    (bytes + 30_000) * 3 + request.maxOutputTokens * 12 + (request.mode === 'web' ? 50_000 : 0),
  )
}
