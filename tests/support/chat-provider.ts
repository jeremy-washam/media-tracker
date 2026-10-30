import { Request, Response } from 'miniflare'

const heldResponses = new Map<string, { promise: Promise<void>; release: () => void }>()

/** Keep a real stream active until the test has observed the transition it exercises. */
export function holdSyntheticChatResponse(prompt: string) {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  const held = { promise, release }
  heldResponses.set(prompt, held)
  return () => {
    if (heldResponses.get(prompt) === held) heldResponses.delete(prompt)
    release()
  }
}

export function releaseSyntheticChatResponses() {
  for (const held of heldResponses.values()) held.release()
  heldResponses.clear()
}

/** Synthetic Responses transport; the production SDK, tool loop, D1 and SQLite remain real. */
export async function syntheticChatProvider(request: Request): Promise<Response> {
  const body = (await request.json()) as { input: Record<string, unknown>[]; instructions: string }
  const user = (body.input.filter((x) => x.role === 'user').at(-1)?.content as string) ?? '',
    last = body.input.filter((x) => x.type === 'function_call_output').at(-1)
  const id = `resp_${crypto.randomUUID()}`
  let text = 'A streamed answer that stays saved.',
    output: Record<string, unknown>[] = []
  const events: Record<string, unknown>[] = []
  if (body.instructions.startsWith('Write a short factual')) text = 'A saved conversation'
  else if (body.instructions.startsWith('Research only the public question')) {
    text = 'A public source supports this answer.'
    output = [
      {
        type: 'web_search_call',
        id: 'web1',
        status: 'completed',
        action: { type: 'search', query: 'public topic' },
      },
    ]
    events.push(
      { type: 'response.web_search_call.in_progress', item_id: 'web1' },
      { type: 'response.web_search_call.completed', item_id: 'web1' },
      {
        type: 'response.output_text.annotation.added',
        item_id: 'message',
        annotation: {
          type: 'url_citation',
          title: 'Public source',
          url: 'https://example.com/source',
          start_index: 0,
          end_index: 10,
        },
      },
    )
  } else if (/library/i.test(user)) {
    if (!last) {
      text = ''
      output = [
        {
          type: 'function_call',
          id: 'fc_query',
          call_id: 'query1',
          name: 'query_media',
          arguments: JSON.stringify({ filters: { types: ['book'] }, output: 'both' }),
        },
      ]
      events.push({
        type: 'response.reasoning_summary_text.delta',
        item_id: 'summary',
        summary_index: 0,
        delta: 'Checking the saved library records.',
      })
    } else {
      const result = JSON.parse(String(last.output)) as {
        data: {
          items?: { id: string; title: string }[]
          data?: { id: string; metadata: { title: string } }[]
        }
      }
      const book = result.data.items?.[0]
      if (book) {
        text = ''
        output = [
          {
            type: 'function_call',
            id: 'fc_details',
            call_id: 'details1',
            name: 'get_media_details',
            arguments: JSON.stringify({
              references: [{ kind: 'book', id: book.id }],
              includes: ['history', 'reviews'],
            }),
          },
        ]
      } else {
        const detail = result.data.data?.[0]
        text = detail
          ? `Your library includes [${detail.metadata.title}](library:book:${detail.id}).`
          : 'No matching saved item was found.'
      }
    }
  } else if (/web/i.test(user) && !last) {
    text = ''
    output = [
      {
        type: 'function_call',
        id: 'fc_web',
        call_id: 'search1',
        name: 'search_web',
        arguments: JSON.stringify({ query: 'public topic primary source' }),
      },
    ]
  } else if (/web/i.test(user))
    text = 'A public source supports this answer. [Public source](https://example.com/source).'
  if (text) {
    events.push({ type: 'response.output_text.delta', item_id: 'message', delta: text })
    output.push({
      type: 'message',
      id: 'message',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text, annotations: [] }],
    })
  }
  const completed = {
    type: 'response.completed',
    response: {
      id,
      status: 'completed',
      output,
      usage: { input_tokens: 100, output_tokens: 30, input_tokens_details: { cached_tokens: 0 } },
    },
  }
  const encode = (event: unknown) => new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
  const held = body.instructions.startsWith('Write a short factual')
    ? undefined
    : heldResponses.get(user)
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (const event of events) controller.enqueue(encode(event))
        if (held) await held.promise
        controller.enqueue(encode(completed))
        controller.close()
      } catch {
        /* Consumer cancellation stops the synthetic transport. */
      }
    },
  })
  return new Response(stream, { headers: { 'content-type': 'text/event-stream' } })
}
