# Offline OpenAI adapter verification

- Checked: 2026-10-29; synthetic fixtures only
- No provider HTTP requests or real credentials
- Scope: request serialization, citation parsing and abort propagation

## Package versions

The executed scratch installation used ai 7.0.157, @ai-sdk/openai 4.0.105,
@ai-sdk/provider 4.0.34 and zod 4.6.7. This is not a production dependency change.
It does not prove live entitlement or Cloudflare runtime recovery.

To reproduce in a disposable directory, save the source below as probe.mjs and
install those exact package versions with npm. Run node probe.mjs. Every model
fetch is replaced with a local function; it writes output.json and reports PASS.

## Probe source

```js
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { createOpenAI } from '@ai-sdk/openai'
import { streamText, generateText, tool, jsonSchema } from 'ai'

const require = createRequire(import.meta.url)
const versions = Object.fromEntries(
  ['ai', '@ai-sdk/openai', '@ai-sdk/provider', 'zod'].map((name) => [
    name,
    require(`${name}/package.json`).version,
  ]),
)
const banned = [
  'background',
  'conversation',
  'max_output_tokens',
  'max_tool_calls',
  'metadata',
  'moderation',
  'multi_agent',
  'prompt',
  'prompt_cache_retention',
  'safety_identifier',
  'temperature',
  'top_logprobs',
  'top_p',
  'truncation',
  'user',
  'previous_response_id',
]
const schema = jsonSchema({
  type: 'object',
  properties: { query: { type: 'string' } },
  required: ['query'],
  additionalProperties: false,
})
function libraryTools(namespaced) {
  return Object.fromEntries(
    ['query_media', 'get_media_details'].map((name) => [
      name,
      tool({
        description: `Synthetic ${name} research fixture`,
        inputSchema: schema,
        ...(namespaced
          ? {
              providerOptions: {
                openai: {
                  namespace: { name: 'library', description: 'Read-only personal library tools' },
                },
              },
            }
          : {}),
      }),
    ]),
  )
}
const observations = []
async function capture(name, { namespaced = false, mode = 'stream', ...opts } = {}) {
  const calls = []
  const provider = createOpenAI({
    apiKey: 'FAKE_OFFLINE_KEY_NO_PROVIDER_REQUESTS',
    fetch: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) })
      throw new Error('EXPECTED_OFFLINE_CAPTURE_STOP')
    },
  })
  const args = {
    model: provider.responses('gpt-6.1-sol'),
    system: 'Use the library tools.',
    prompt: 'Find a film.',
    tools: libraryTools(namespaced),
    maxRetries: 0,
    onError: ({ error }) => {
      assert.ok(String(error).includes('EXPECTED_OFFLINE_CAPTURE_STOP'))
    },
    ...opts,
  }
  try {
    if (mode === 'generate') await generateText(args)
    else
      for await (const _ of streamText(args).fullStream) {
      }
  } catch (error) {
    if (!String(error).includes('EXPECTED_OFFLINE_CAPTURE_STOP')) throw error
  }
  assert.equal(calls.length, 1, `${name}: exactly one mocked fetch`)
  assert.equal(calls[0].url, 'https://api.openai.com/v1/responses')
  const body = calls[0].body
  const observation = {
    name,
    ...calls[0],
    bannedFieldsPresent: banned.filter((key) => key in body),
  }
  observations.push(observation)
  return body
}
const ordinary = await capture('ordinary_api_defaults')
assert.equal(ordinary.stream, true)
assert.equal(ordinary.store, undefined, 'ordinary API relies on server store default')
assert.equal(ordinary.tools[0].type, 'function')

const compatible = await capture('siwc_explicit_namespaced', {
  namespaced: true,
  providerOptions: { openai: { store: false, systemMessageMode: 'developer' } },
})
assert.equal(compatible.store, false)
assert.equal(compatible.stream, true)
assert.equal(compatible.input[0].role, 'developer')
assert.equal(compatible.tools.length, 1)
assert.equal(compatible.tools[0].type, 'namespace')
assert.equal(compatible.tools[0].name, 'library')
assert.deepEqual(
  compatible.tools[0].tools.map((x) => x.name),
  ['query_media', 'get_media_details'],
)
assert.deepEqual(
  banned.filter((k) => k in compatible),
  [],
)

const incompatible = await capture('siwc_deliberately_incompatible_options', {
  maxOutputTokens: 128,
  temperature: 0.2,
  topP: 0.9,
  providerOptions: {
    openai: {
      store: false,
      systemMessageMode: 'developer',
      metadata: { test: 'synthetic' },
      previousResponseId: 'resp_synthetic',
      maxToolCalls: 2,
    },
  },
})
for (const key of ['max_output_tokens', 'metadata', 'previous_response_id', 'max_tool_calls'])
  assert.ok(key in incompatible, key)
await capture('ordinary_nonstreaming_generateText', {
  mode: 'generate',
  providerOptions: { openai: { store: false } },
})

function sseResponse(events) {
  const body = events.map((x) => `event: ${x.type}\ndata: ${JSON.stringify(x)}\n\n`).join('')
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
}
const sseEvents = [
  {
    type: 'response.created',
    response: { id: 'resp_synthetic', created_at: 0, model: 'gpt-6.1-sol' },
  },
  {
    type: 'response.output_item.added',
    output_index: 0,
    item: { type: 'message', id: 'msg_synthetic' },
  },
  {
    type: 'response.output_text.delta',
    item_id: 'msg_synthetic',
    output_index: 0,
    delta: 'A cited film.',
  },
  {
    type: 'response.output_text.annotation.added',
    item_id: 'msg_synthetic',
    output_index: 0,
    annotation: {
      type: 'url_citation',
      url: 'https://example.com/synthetic-film',
      title: 'Synthetic film source',
      start_index: 0,
      end_index: 12,
    },
  },
  {
    type: 'response.output_item.done',
    output_index: 0,
    item: {
      type: 'message',
      id: 'msg_synthetic',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text: 'A cited film.', annotations: [] }],
    },
  },
  {
    type: 'response.completed',
    response: { usage: { input_tokens: 12, output_tokens: 4, total_tokens: 16 } },
  },
]
let sseFetches = 0
const sseProvider = createOpenAI({
  apiKey: 'FAKE_OFFLINE_KEY_NO_PROVIDER_REQUESTS',
  fetch: async () => {
    sseFetches++
    return sseResponse(sseEvents)
  },
})
const parsed = []
for await (const part of streamText({
  model: sseProvider.responses('gpt-6.1-sol'),
  prompt: 'Synthetic citation test',
  maxRetries: 0,
  tools: { web_search: sseProvider.tools.webSearch({}) },
  providerOptions: { openai: { store: false } },
}).fullStream)
  parsed.push(part)
const source = parsed.find((x) => x.type === 'source')
assert.equal(source?.url, 'https://example.com/synthetic-film')
assert.ok(parsed.some((x) => x.type === 'text-delta' && x.text === 'A cited film.'))
assert.ok(!parsed.some((x) => x.type === 'error'))
assert.equal(sseFetches, 1)

const abortController = new AbortController()
let abortSeen = false
const abortProvider = createOpenAI({
  apiKey: 'FAKE_OFFLINE_KEY_NO_PROVIDER_REQUESTS',
  fetch: async (_url, init) => {
    return await new Promise((_resolve, reject) => {
      const onAbort = () => {
        abortSeen = true
        reject(init.signal.reason ?? new DOMException('Aborted', 'AbortError'))
      }
      init.signal.addEventListener('abort', onAbort, { once: true })
      setTimeout(() => abortController.abort(), 10)
    })
  },
})
const abortedParts = []
for await (const part of streamText({
  model: abortProvider.responses('gpt-6.1-sol'),
  prompt: 'Synthetic stop test',
  maxRetries: 0,
  abortSignal: abortController.signal,
}).fullStream)
  abortedParts.push(part)
assert.equal(abortSeen, true)
assert.ok(abortedParts.some((x) => x.type === 'abort'))

const output = {
  versions,
  networkBoundary:
    'Every model fetch replaced with local function; only npm registry was contacted during package installation.',
  observations,
  sseParsing: { fetches: sseFetches, source, partTypes: parsed.map((x) => x.type) },
  abortPropagation: { abortSeen, partTypes: abortedParts.map((x) => x.type) },
  assertions: 'PASS',
}
fs.writeFileSync(new URL('./output.json', import.meta.url), JSON.stringify(output, null, 2) + '\n')
console.log(
  JSON.stringify(
    {
      versions,
      assertions: output.assertions,
      cases: observations.map(({ name, body, bannedFieldsPresent }) => ({
        name,
        stream: body.stream ?? false,
        store: body.store ?? 'server-default',
        firstRole: body.input?.[0]?.role,
        toolTypes: body.tools?.map((x) => x.type),
        bannedFieldsPresent,
      })),
      sseParsing: output.sseParsing,
      abortPropagation: output.abortPropagation,
    },
    null,
    2,
  ),
)
```

## Recorded output

```json
{
  "versions": {
    "ai": "7.0.157",
    "@ai-sdk/openai": "4.0.105",
    "@ai-sdk/provider": "4.0.34",
    "zod": "4.6.7"
  },
  "networkBoundary": "Every model fetch replaced with local function; only npm registry was contacted during package installation.",
  "observations": [
    {
      "name": "ordinary_api_defaults",
      "url": "https://api.openai.com/v1/responses",
      "body": {
        "model": "gpt-6.1-sol",
        "input": [
          {
            "role": "developer",
            "content": "Use the library tools."
          },
          {
            "role": "user",
            "content": [
              {
                "type": "input_text",
                "text": "Find a film."
              }
            ]
          }
        ],
        "tools": [
          {
            "type": "function",
            "name": "query_media",
            "description": "Synthetic query_media research fixture",
            "parameters": {
              "type": "object",
              "properties": {
                "query": {
                  "type": "string"
                }
              },
              "required": ["query"],
              "additionalProperties": false
            },
            "strict": false
          },
          {
            "type": "function",
            "name": "get_media_details",
            "description": "Synthetic get_media_details research fixture",
            "parameters": {
              "type": "object",
              "properties": {
                "query": {
                  "type": "string"
                }
              },
              "required": ["query"],
              "additionalProperties": false
            },
            "strict": false
          }
        ],
        "tool_choice": "auto",
        "stream": true
      },
      "bannedFieldsPresent": []
    },
    {
      "name": "siwc_explicit_namespaced",
      "url": "https://api.openai.com/v1/responses",
      "body": {
        "model": "gpt-6.1-sol",
        "input": [
          {
            "role": "developer",
            "content": "Use the library tools."
          },
          {
            "role": "user",
            "content": [
              {
                "type": "input_text",
                "text": "Find a film."
              }
            ]
          }
        ],
        "store": false,
        "include": ["reasoning.encrypted_content"],
        "tools": [
          {
            "type": "namespace",
            "name": "library",
            "description": "Read-only personal library tools",
            "tools": [
              {
                "type": "function",
                "name": "query_media",
                "description": "Synthetic query_media research fixture",
                "parameters": {
                  "type": "object",
                  "properties": {
                    "query": {
                      "type": "string"
                    }
                  },
                  "required": ["query"],
                  "additionalProperties": false
                },
                "strict": false
              },
              {
                "type": "function",
                "name": "get_media_details",
                "description": "Synthetic get_media_details research fixture",
                "parameters": {
                  "type": "object",
                  "properties": {
                    "query": {
                      "type": "string"
                    }
                  },
                  "required": ["query"],
                  "additionalProperties": false
                },
                "strict": false
              }
            ]
          }
        ],
        "tool_choice": "auto",
        "stream": true
      },
      "bannedFieldsPresent": []
    },
    {
      "name": "siwc_deliberately_incompatible_options",
      "url": "https://api.openai.com/v1/responses",
      "body": {
        "model": "gpt-6.1-sol",
        "input": [
          {
            "role": "developer",
            "content": "Use the library tools."
          },
          {
            "role": "user",
            "content": [
              {
                "type": "input_text",
                "text": "Find a film."
              }
            ]
          }
        ],
        "max_output_tokens": 128,
        "max_tool_calls": 2,
        "metadata": {
          "test": "synthetic"
        },
        "previous_response_id": "resp_synthetic",
        "store": false,
        "include": ["reasoning.encrypted_content"],
        "tools": [
          {
            "type": "function",
            "name": "query_media",
            "description": "Synthetic query_media research fixture",
            "parameters": {
              "type": "object",
              "properties": {
                "query": {
                  "type": "string"
                }
              },
              "required": ["query"],
              "additionalProperties": false
            },
            "strict": false
          },
          {
            "type": "function",
            "name": "get_media_details",
            "description": "Synthetic get_media_details research fixture",
            "parameters": {
              "type": "object",
              "properties": {
                "query": {
                  "type": "string"
                }
              },
              "required": ["query"],
              "additionalProperties": false
            },
            "strict": false
          }
        ],
        "tool_choice": "auto",
        "stream": true
      },
      "bannedFieldsPresent": [
        "max_output_tokens",
        "max_tool_calls",
        "metadata",
        "previous_response_id"
      ]
    },
    {
      "name": "ordinary_nonstreaming_generateText",
      "url": "https://api.openai.com/v1/responses",
      "body": {
        "model": "gpt-6.1-sol",
        "input": [
          {
            "role": "developer",
            "content": "Use the library tools."
          },
          {
            "role": "user",
            "content": [
              {
                "type": "input_text",
                "text": "Find a film."
              }
            ]
          }
        ],
        "store": false,
        "include": ["reasoning.encrypted_content"],
        "tools": [
          {
            "type": "function",
            "name": "query_media",
            "description": "Synthetic query_media research fixture",
            "parameters": {
              "type": "object",
              "properties": {
                "query": {
                  "type": "string"
                }
              },
              "required": ["query"],
              "additionalProperties": false
            },
            "strict": false
          },
          {
            "type": "function",
            "name": "get_media_details",
            "description": "Synthetic get_media_details research fixture",
            "parameters": {
              "type": "object",
              "properties": {
                "query": {
                  "type": "string"
                }
              },
              "required": ["query"],
              "additionalProperties": false
            },
            "strict": false
          }
        ],
        "tool_choice": "auto"
      },
      "bannedFieldsPresent": []
    }
  ],
  "sseParsing": {
    "fetches": 1,
    "source": {
      "type": "source",
      "sourceType": "url",
      "id": "7ThZ8lQASfkDd99I",
      "url": "https://example.com/synthetic-film",
      "title": "Synthetic film source"
    },
    "partTypes": [
      "start",
      "start-step",
      "text-start",
      "text-delta",
      "text-end",
      "source",
      "finish-step",
      "finish"
    ]
  },
  "abortPropagation": {
    "abortSeen": true,
    "partTypes": ["start", "abort"]
  },
  "assertions": "PASS"
}
```
