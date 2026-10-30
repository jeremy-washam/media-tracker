import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Response as RuntimeResponse } from 'miniflare'
import { createWorkerRuntime, type WorkerRuntime } from '../support/worker-runtime'

let runtime: WorkerRuntime,
  submissions = 0
let releaseSlow: (() => void) | undefined
const waitSlow = new Promise<void>((resolve) => {
  releaseSlow = resolve
})
function completion(text: string) {
  const response = {
    id: `resp_synthetic_${submissions}`,
    status: 'completed',
    output: [
      {
        id: 'msg_synthetic',
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text, annotations: [] }],
      },
    ],
    usage: { input_tokens: 10, output_tokens: 5, input_tokens_details: { cached_tokens: 0 } },
  }
  return new RuntimeResponse(
    [
      { type: 'response.output_text.delta', item_id: 'msg_synthetic', delta: text },
      { type: 'response.completed', response },
    ]
      .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
      .join(''),
    { headers: { 'content-type': 'text/event-stream' } },
  )
}
async function read(path: string, init?: Parameters<WorkerRuntime['api']>[1]) {
  const response = await runtime.mf.dispatchFetch(new URL(path, runtime.url), {
    ...init,
    headers: {
      ...runtime.authHeaders,
      ...Object.fromEntries(new Headers(init?.headers as HeadersInit)),
    },
  })
  return { status: response.status, data: (await response.json()) as Record<string, unknown> }
}
async function finished(id: string, runId: string) {
  for (let n = 0; n < 100; n++) {
    const response = await read(`/api/chat/conversations/${id}/runs/${runId}`)
    if (
      (response.data.status as string) !== 'queued' &&
      (response.data.status as string) !== 'running'
    )
      return response.data
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('Synthetic chat did not finish')
}
beforeAll(async () => {
  runtime = await createWorkerRuntime({
    seed: false,
    chat: true,
    hosted: true,
    chatProvider: async (request) => {
      submissions++
      const body = (await request.json()) as {
        mode?: string
        input: unknown[]
        instructions: string
      }
      if (JSON.stringify(body.input).includes('Slow fixture')) await waitSlow
      return completion(
        body.instructions.startsWith('Write a short factual')
          ? 'Synthetic chat title'
          : 'A streamed synthetic answer.',
      )
    },
  })
})
afterAll(async () => {
  releaseSlow?.()
  await runtime?.dispose()
})
describe('real SQLite Durable Object lifecycle behind owner Access', () => {
  it('denies unauthenticated Chat HTTP and observation before the object is addressed', async () => {
    const response = await runtime.mf.dispatchFetch(new URL('/api/chat/config', runtime.url))
    expect(response.status).toBe(401)
    expect(submissions).toBe(0)
  })
  it('rejects cross-site browser mutations even when the owner session is present', async () => {
    const denied = await read('/api/chat/conversations', {
      method: 'POST',
      headers: { origin: 'https://untrusted.example', 'content-type': 'application/json' },
      body: JSON.stringify({
        operationKey: crypto.randomUUID(),
        text: 'This must not be submitted',
      }),
    })
    expect(denied.status).toBe(403)
    expect(submissions).toBe(0)
  })
  it('streams a durable admitted turn, deduplicates creation, persists a title and exports without provider internals', async () => {
    const operationKey = crypto.randomUUID(),
      body = JSON.stringify({ operationKey, text: 'Synthetic first question' }),
      first = await read('/api/chat/conversations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      })
    expect(first.status, JSON.stringify(first.data)).toBe(202)
    const run = first.data.run as { id: string; conversationId: string },
      id = run.conversationId
    const duplicate = await read('/api/chat/conversations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
    expect(duplicate.status).toBe(202)
    expect((duplicate.data.run as { id: string }).id).toBe(run.id)
    const state = await finished(id, run.id)
    expect(state.status).toBe('completed')
    const events = await runtime.api(`/api/chat/conversations/${id}/runs/${run.id}/events?after=0`)
    expect(events.headers.get('content-type')).toBe('text/event-stream')
    const text = await events.text()
    expect(text).toContain('A streamed synthetic answer.')
    expect(text).not.toContain('checkpointKey')
    expect(text).not.toContain('providerResponseId')
    expect(text).not.toContain('inputHash')
    const exportResponse = await runtime.api(`/api/chat/conversations/${id}/export`)
    expect(exportResponse.status).toBe(200)
    const archive = await exportResponse.text()
    expect(archive).toContain('imladris-chat')
    expect(archive).toContain('Synthetic first question')
    expect(archive).toContain('A streamed synthetic answer.')
    expect(archive).not.toContain('synthetic-chat-key')
    for (let n = 0; n < 50; n++) {
      const snapshot = await read(`/api/chat/conversations/${id}`)
      if ((snapshot.data.conversation as { titleOrigin: string }).titleOrigin === 'generated') break
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    const snapshot = await read(`/api/chat/conversations/${id}`)
    expect((snapshot.data.conversation as { title: string }).title).toBe('Synthetic chat title')
    expect(submissions).toBe(2)
    const favorite = await read(`/api/chat/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expectedMetadataRevision: 1, favorite: true }),
    })
    expect(favorite.status).toBe(200)
    const favorites = await read('/api/chat/conversations?section=favorites')
    expect(favorites.status).toBe(200)
    expect(favorites.data.data).toHaveLength(1)
    const chats = await read('/api/chat/conversations?section=chats')
    expect(chats.data.data).toHaveLength(0)
    const deletion = await read(`/api/chat/conversations/${id}`, { method: 'DELETE' })
    expect(deletion.status, JSON.stringify(deletion.data)).toBe(202)
    expect((await read(`/api/chat/conversations/${id}`)).status).toBe(404)
    expect(
      (
        await read('/api/chat/conversations', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        })
      ).status,
    ).toBe(404)
  })
  it('acknowledges Stop before a late provider result and never turns it into a completed response', async () => {
    const response = await read('/api/chat/conversations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operationKey: crypto.randomUUID(), text: 'Slow fixture question' }),
    })
    expect(response.status).toBe(202)
    const run = response.data.run as { id: string; conversationId: string }
    for (let n = 0; n < 100; n++) {
      if (
        (await read(`/api/chat/conversations/${run.conversationId}/runs/${run.id}`)).data.status ===
        'running'
      )
        break
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    const cancelled = await read(
      `/api/chat/conversations/${run.conversationId}/runs/${run.id}/cancel`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
    )
    expect(cancelled.status, JSON.stringify({ run, cancelled })).toBe(200)
    expect((cancelled.data.run as { status: string }).status).toBe('cancelled')
    releaseSlow?.()
    const state = await finished(run.conversationId, run.id)
    expect(state.status).toBe('cancelled')
    const repeated = await read(
      `/api/chat/conversations/${run.conversationId}/runs/${run.id}/cancel`,
      { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } },
    )
    expect((repeated.data.run as { status: string }).status).toBe('cancelled')
  })
})
