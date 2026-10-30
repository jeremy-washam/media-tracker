import { describe, it, expect, vi } from 'vitest'
import type { ChatMessage, ChatPart } from '@media-tracker/domain'
import { executeChatTurn, type ChatTurnHooks } from './turn'
import {
  OpenAIChatProvider,
  chatProviderCharge,
  type ChatProvider,
  type ChatProviderEvent,
  type ChatProviderResult,
  type ChatProviderRequest,
} from './provider'
import { chatCursor, readChatCursor, validatePublicSearch, publicChatUrl } from './security'

const result = (calls: ChatProviderResult['calls'] = []): ChatProviderResult => ({
  id: 'response-1',
  status: 'completed',
  output: [{ opaque_example_provider_checkpoint: 'never public' }],
  raw: { secret_native_checkpoint: 'opaque reasoning' },
  calls,
  usageKnown: true,
  inputTokens: 100,
  outputTokens: 20,
  cachedTokens: 10,
  cacheWriteTokens: 0,
  webCalls: 0,
})
const message: ChatMessage = {
  id: 'user',
  runId: 'run',
  parentId: null,
  sequence: 1,
  role: 'user',
  status: 'complete',
  createdAt: '2026-10-30',
  parts: [{ type: 'text', id: 'text', text: 'Help with my private reading journal' }],
}
function setup() {
  const controller = new AbortController(),
    parts: ChatPart[][] = []
  const hooks: ChatTurnHooks = {
    now: () => '2026-10-30T12:00:00Z',
    checkAllowed: vi.fn(async () => {}),
    reserve: vi.fn(async () => {}),
    settle: vi.fn(async () => {}),
    checkpoint: vi.fn(async () => {}),
    parts: (p) => parts.push(p),
    tool: vi.fn(async () => ({
      content: { data: 'private canary source note stays inside our library' },
      references: [{ kind: 'book' as const, id: 'book', title: 'A book' }],
      privateText: ['private canary source note stays inside our library'],
    })),
    evidence: vi.fn(async () => 'evidence-1'),
  }
  return { controller, hooks, parts }
}
class OtherProvider implements ChatProvider {
  readonly id = 'other'
  readonly model = 'sparse-model'
  reservation() {
    return 1234
  }
  charge() {
    return 17
  }
  requests: ChatProviderRequest[] = []
  constructor(private readonly steps: ChatProviderEvent[][]) {}
  async *stream(request: ChatProviderRequest) {
    this.requests.push(request)
    for (const event of this.steps.shift() ?? []) yield event
  }
}
describe('portable owned chat orchestration', () => {
  it('supports sparse summaries and an unrelated native checkpoint format while persisting only public parts', async () => {
    const test = setup(),
      provider = new OtherProvider([
        [
          {
            type: 'completed',
            result: result([{ id: 'call-1', name: 'query_media', arguments: '{}' }]),
          },
        ],
        [
          { type: 'text', id: 'answer', text: 'Found a book.' },
          { type: 'completed', result: result() },
        ],
      ])
    const answer = await executeChatTurn({
      runId: 'run',
      provider,
      messages: [message],
      signal: test.controller.signal,
      hooks: test.hooks,
    })
    expect(
      provider.requests[1]?.input.some(
        (x) => x.type === 'provider_output' && x.provider === 'other',
      ),
    ).toBe(true)
    expect(answer.parts.some((x) => x.type === 'reasoning_summary')).toBe(false)
    expect(answer.parts.filter((x) => x.type === 'tool_activity')).toHaveLength(1)
    expect(JSON.stringify(answer)).not.toContain('opaque_example')
    expect(test.hooks.reserve).toHaveBeenCalledTimes(2)
    expect(test.hooks.checkpoint).toHaveBeenCalledTimes(2)
    expect(test.hooks.settle).toHaveBeenCalledTimes(2)
  })
  it('isolates public web inputs from the private conversation and library results', async () => {
    const test = setup(),
      provider = new OtherProvider([
        [
          {
            type: 'completed',
            result: result([
              { id: 'library', name: 'get_media_details', arguments: '{}' },
              {
                id: 'web',
                name: 'search_web',
                arguments: JSON.stringify({ query: 'Ursula Le Guin essays' }),
              },
            ]),
          },
        ],
        [
          { type: 'web_activity', id: 'search', status: 'running', detail: 'Searching' },
          { type: 'text', id: 'webtext', text: 'Public results' },
          {
            type: 'citation',
            id: 'cite',
            title: 'Primary source',
            url: 'https://example.com/essay',
          },
          { type: 'completed', result: result() },
        ],
        [
          { type: 'text', id: 'answer', text: 'Answer' },
          { type: 'completed', result: result() },
        ],
      ])
    const answer = await executeChatTurn({
      runId: 'run',
      provider,
      messages: [message],
      signal: test.controller.signal,
      hooks: test.hooks,
    })
    const web = provider.requests.find((x) => x.mode === 'web')!
    expect(web.input).toEqual([{ type: 'message', role: 'user', text: 'Ursula Le Guin essays' }])
    expect(JSON.stringify(web)).not.toContain('canary')
    expect(JSON.stringify(web)).not.toContain('private reading journal')
    expect(answer.parts.filter((x) => x.type === 'tool_activity')).toHaveLength(2)
    expect(answer.parts.some((x) => x.type === 'citation')).toBe(true)
  })
  it('blocks known private excerpts from web queries without faking a successful tool result', async () => {
    const test = setup(),
      provider = new OtherProvider([
        [
          {
            type: 'completed',
            result: result([
              { id: 'library', name: 'get_media_details', arguments: '{}' },
              {
                id: 'web',
                name: 'search_web',
                arguments: JSON.stringify({
                  query: 'private canary source note stays inside our library',
                }),
              },
            ]),
          },
        ],
        [
          { type: 'text', id: 'answer', text: 'The private query was blocked.' },
          { type: 'completed', result: result() },
        ],
      ])
    const answer = await executeChatTurn({
      runId: 'run',
      provider,
      messages: [message],
      signal: test.controller.signal,
      hooks: test.hooks,
    })
    expect(provider.requests.some((x) => x.mode === 'web')).toBe(false)
    expect(answer.parts.find((x) => x.type === 'tool_activity' && x.id === 'web')).toMatchObject({
      status: 'failed',
    })
    expect(test.hooks.reserve).toHaveBeenCalledTimes(2)
  })
  it('keeps the reservation when a completed provider response has no usable usage report', async () => {
    const test = setup(),
      provider = new OtherProvider([
        [
          { type: 'text', id: 'answer', text: 'Complete answer' },
          { type: 'completed', result: { ...result(), usageKnown: false } },
        ],
      ])
    await executeChatTurn({
      runId: 'run',
      provider,
      messages: [message],
      signal: test.controller.signal,
      hooks: test.hooks,
    })
    expect(test.hooks.checkpoint).toHaveBeenCalledOnce()
    expect(test.hooks.settle).not.toHaveBeenCalled()
  })
  it('retains an unknown reservation after a broken stream and never automatically retries inference', async () => {
    const test = setup(),
      stream = vi.fn(async function* () {
        yield { type: 'text', id: 'answer', text: 'Partial' } as ChatProviderEvent
        throw new Error('connection lost')
      })
    await expect(
      executeChatTurn({
        runId: 'run',
        provider: { id: 'other', model: 'test', stream, reservation: () => 1234, charge: () => 17 },
        messages: [message],
        signal: test.controller.signal,
        hooks: test.hooks,
      }),
    ).rejects.toThrow('connection lost')
    expect(stream).toHaveBeenCalledTimes(1)
    expect(test.hooks.reserve).toHaveBeenCalledTimes(1)
    expect(test.hooks.settle).not.toHaveBeenCalled()
    expect(test.parts[0]?.[0]).toEqual({ type: 'text', id: 'answer', text: 'Partial' })
  })
})
describe('OpenAI transport and egress boundaries', () => {
  it('requests store:false, keeps hidden reasoning private, and streams actual approved summaries', async () => {
    let submitted: Record<string, unknown> = {}
    const customFetch = vi.fn(async (_input: unknown, init?: RequestInit) => {
      submitted = JSON.parse(String(init?.body))
      const completed = {
        id: 'resp_test',
        status: 'completed',
        output: [],
        usage: { input_tokens: 10, output_tokens: 3, input_tokens_details: { cached_tokens: 0 } },
      }
      const events = [
        {
          type: 'response.reasoning_summary_text.delta',
          item_id: 'reasoning',
          summary_index: 0,
          delta: 'Checking sources.',
        },
        { type: 'response.output_text.delta', item_id: 'message', delta: 'Answer.' },
        {
          type: 'response.output_text.annotation.added',
          item_id: 'message',
          annotation: {
            type: 'url_citation',
            title: 'Source',
            url: 'https://example.com/source?query=' + 'a'.repeat(1000),
            start_index: 0,
            end_index: 1,
          },
        },
        { type: 'response.completed', response: completed },
      ]
      return new Response(
        events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''),
        { headers: { 'content-type': 'text/event-stream' } },
      )
    })
    const provider = new OpenAIChatProvider(
        'synthetic-test-key',
        'gpt-6.1-sol',
        customFetch as typeof fetch,
      ),
      events: ChatProviderEvent[] = []
    for await (const event of provider.stream({
      input: [{ type: 'message', role: 'user', text: 'Question' }],
      instructions: 'Be useful',
      mode: 'chat',
      signal: new AbortController().signal,
      maxOutputTokens: 128,
    }))
      events.push(event)
    expect(submitted.store).toBe(false)
    expect(submitted.reasoning).toEqual({ effort: 'medium', summary: 'auto' })
    expect(submitted.input).toEqual([{ role: 'user', content: 'Question' }])
    expect(events[0]).toEqual({ type: 'summary', id: 'reasoning:0', text: 'Checking sources.' })
    expect(events[1]).toEqual({ type: 'text', id: 'message', text: 'Answer.' })
    const citation = events.find((event) => event.type === 'citation')
    expect(citation?.id.length).toBeLessThanOrEqual(160)
    expect(customFetch).toHaveBeenCalledTimes(1)
  })
  it('does not retry a failed provider submission', async () => {
    const customFetch = vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: 'Synthetic failure' } }), {
            status: 503,
            headers: { 'content-type': 'application/json' },
          }),
      ),
      provider = new OpenAIChatProvider(
        'synthetic-test-key',
        'gpt-6.1-sol',
        customFetch as typeof fetch,
      )
    await expect(async () => {
      for await (const event of provider.stream({
        input: [],
        instructions: 'Test',
        mode: 'chat',
        maxOutputTokens: 128,
        signal: new AbortController().signal,
      }))
        void event
    }).rejects.toThrow()
    expect(customFetch).toHaveBeenCalledTimes(1)
  })
  it('authenticates cursor scope and rejects local URLs and obvious credentials', async () => {
    const cursor = await chatCursor('test', { offset: 2 }, 'synthetic-secret')
    expect(await readChatCursor(cursor, 'test', 'synthetic-secret')).toEqual({ offset: 2 })
    await expect(readChatCursor(cursor, 'other', 'synthetic-secret')).rejects.toThrow(
      'chat_cursor_invalid',
    )
    await expect(readChatCursor(cursor + 'x', 'test', 'synthetic-secret')).rejects.toThrow(
      'chat_cursor_invalid',
    )
    expect(publicChatUrl('http://127.0.0.1/private')).toBeNull()
    expect(publicChatUrl('http://localhost./private')).toBeNull()
    expect(publicChatUrl('javascript:alert(1)')).toBeNull()
    expect(() => validatePublicSearch('email user@example.com', [])).toThrow(
      'chat_private_search_blocked',
    )
    expect(chatProviderCharge(result())).toBe(381)
  })
})
