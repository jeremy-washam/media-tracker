import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { once } from 'node:events'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createWorkerRuntime, type WorkerRuntime } from '../support/worker-runtime'

const stateKey = 'operations/operating-state.json'
let runtime: WorkerRuntime
let redirect = false
const received: Array<{ path: string; authorization: string | undefined }> = []
const server = createServer((request: IncomingMessage, response: ServerResponse) => {
  received.push({ path: request.url!, authorization: request.headers.authorization })
  response.setHeader('content-type', 'application/json')
  if (request.url === '/redirect-target') {
    response.end(JSON.stringify({ unexpectedCredentialForwarding: true }))
    return
  }
  if (redirect && request.url === '/client/v4/graphql') {
    response.writeHead(302, { location: `${fixtureUrl}/redirect-target` })
    response.end('{}')
    return
  }
  if (request.url === '/client/v4/graphql') {
    response.end(
      JSON.stringify({
        data: {
          viewer: {
            accounts: [
              {
                d1AnalyticsAdaptiveGroups: [],
                workersInvocationsAdaptive: [],
                queueMessageOperationsAdaptiveGroups: [],
                r2OperationsAdaptiveGroups: [],
                r2StorageAdaptiveGroups: [],
              },
            ],
          },
        },
      }),
    )
    return
  }
  if (request.url?.includes('/d1/database?')) {
    response.end(JSON.stringify({ success: true, result: [{ file_size: 1234 }] }))
    return
  }
  if (request.url?.includes('/queues/')) {
    response.end(
      JSON.stringify({
        success: true,
        result: { settings: { delivery_paused: request.method === 'PATCH' } },
      }),
    )
    return
  }
  response.writeHead(500).end('{}')
})
let fixtureUrl: string

beforeAll(async () => {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing fixture port')
  fixtureUrl = `http://127.0.0.1:${address.port}`
  runtime = await createWorkerRuntime({ seed: false, operatingMonitorFixture: fixtureUrl })
})
afterAll(async () => {
  await runtime?.dispose()
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
})

async function monitor() {
  const worker = await runtime.mf.getWorker()
  const result = await worker.scheduled({ cron: '*/10 * * * *' })
  expect(result.outcome).toBe('ok')
}

describe('native Worker operating monitor outbound fetch', () => {
  it('constructs a real workerd fetch and records healthy usage', async () => {
    await monitor()
    const bucket = await runtime.mf.getR2Bucket('RAW_BUCKET')
    await expect
      .poll(async () => (await bucket.get(stateKey))?.json())
      .toMatchObject({
        paused: false,
        reason: 'normal',
        estimatedTotalUsd: 5,
      })
    expect(received.map((request) => request.path)).toHaveLength(3)
    expect(
      received.every((request) => request.authorization === 'Bearer synthetic-operating-token'),
    ).toBe(true)
  })

  it('rejects a native 302 without following or forwarding the account credential', async () => {
    const bucket = await runtime.mf.getR2Bucket('RAW_BUCKET')
    await bucket.delete(stateKey)
    redirect = true
    const start = received.length
    const outboundStart = runtime.outboundRequests.length
    await monitor()
    await expect
      .poll(async () => (await bucket.get(stateKey))?.json())
      .toMatchObject({
        paused: true,
        reason: 'monitor_unavailable',
        queuePaused: true,
      })
    expect(received.slice(start).map((request) => request.path)).toEqual([
      '/client/v4/graphql',
      `/client/v4/accounts/${'a'.repeat(32)}/queues/${'b'.repeat(32)}`,
    ])
    expect(
      runtime.outboundRequests
        .slice(outboundStart)
        .every((url) => new URL(url).origin === 'https://api.cloudflare.com'),
    ).toBe(true)
    expect(received.some((request) => request.path === '/redirect-target')).toBe(false)
    expect(runtime.logs.join('')).toContain('OperatingMonitorHttp302')
    expect(runtime.logs.join('')).not.toContain('synthetic-operating-token')
  })
})
