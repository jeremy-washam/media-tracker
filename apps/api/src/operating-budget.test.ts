import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Bindings } from './env'
import {
  collectNativeUsage,
  estimateOperatingCost,
  monitorOperatingBudget,
  operatingWorkAllowed,
  OPERATING_STATE_KEY,
} from './operating-budget'
const now = Date.parse('2026-10-29T20:00:00Z')
const zero = {
  rowsRead: 0,
  rowsWritten: 0,
  requests: 0,
  cpuTimeUs: 0,
  queueOperations: 0,
  r2ClassA: 0,
  r2ClassB: 0,
  d1Bytes: 1e9,
  r2Bytes: 1e8,
}
function environment(initial?: unknown) {
  let state = initial
  let revision = 0
  const DB = {
    prepare: vi.fn(() => {
      throw new Error('D1 access forbidden')
    }),
  }
  const get = vi.fn(async () =>
    state === undefined
      ? null
      : { etag: `v${revision}`, size: JSON.stringify(state).length, json: async () => state },
  )
  const put = vi.fn(
    async (
      _key: string,
      body: string,
      options?: { onlyIf?: { etagMatches?: string; etagDoesNotMatch?: string } },
    ) => {
      if (options?.onlyIf?.etagMatches && options.onlyIf.etagMatches !== `v${revision}`) return null
      if (options?.onlyIf?.etagDoesNotMatch === '*' && state !== undefined) return null
      state = JSON.parse(body)
      revision++
      return { etag: `v${revision}` }
    },
  )
  return {
    env: {
      OPERATING_MONITOR_ENABLED: 'true',
      OPERATING_API_TOKEN: 'synthetic',
      CLOUDFLARE_ACCOUNT_ID: '1'.repeat(32),
      SYNC_QUEUE_ID: '2'.repeat(32),
      DB,
      RAW_BUCKET: { get, put },
    } as unknown as Bindings,
    get,
    put,
    DB,
    state: () => state,
  }
}
const state = (extra = {}) => ({
  version: 1,
  checkedAt: new Date(now).toISOString(),
  windowStart: new Date(now - 31 * 86400000).toISOString(),
  paused: false,
  reason: 'normal',
  estimatedTotalUsd: 5,
  queuePaused: false,
  ...extra,
})
function native(writes = 0) {
  return {
    data: {
      viewer: {
        accounts: [
          {
            d1AnalyticsAdaptiveGroups: [{ sum: { rowsRead: 100, rowsWritten: writes } }],
            workersInvocationsAdaptive: [{ sum: { requests: 100, cpuTimeUs: 1e6 } }],
            queueMessageOperationsAdaptiveGroups: [{ sum: { billableOperations: 100 } }],
            r2OperationsAdaptiveGroups: [
              { dimensions: { actionType: 'HeadObject' }, sum: { requests: 300 } },
              { dimensions: { actionType: 'PutObject' }, sum: { requests: 200 } },
            ],
            r2StorageAdaptiveGroups: [
              {
                dimensions: { bucketName: 'synthetic' },
                max: { payloadSize: 1e8, metadataSize: 100 },
              },
            ],
          },
        ],
      },
    },
  }
}
function fakeApi(writes = 0, queueFails = false) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/graphql') && init?.method !== 'POST')
      throw new Error('Expected GraphQL POST')
    if (url.endsWith('/graphql')) return Response.json(native(writes))
    if (url.includes('/d1/database'))
      return Response.json({ success: true, result: [{ file_size: 1e9 }] })
    if (url.includes('/queues/'))
      return queueFails
        ? new Response('', { status: 403 })
        : Response.json({ success: true, result: { settings: { delivery_paused: false } } })
    throw new Error('Unexpected outbound request')
  })
}
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
describe('operating emergency breaker', () => {
  it('cannot reopen a newer operator pause when the first state compare-and-swap loses', async () => {
    const { env, put, state: read } = environment(state())
    const apply = put.getMockImplementation()!
    const pausedAt = new Date(now - 60_000).toISOString()
    put.mockImplementationOnce(async (key, body, options) => {
      // An operator writes after this monitor reads v0, before it saves v0.
      await apply(key, JSON.stringify(state({ paused: true, reason: 'manual', pausedAt })))
      return apply(key, body, options)
    })
    vi.stubGlobal('fetch', fakeApi())
    const result = await monitorOperatingBudget(env, now)
    expect(read()).toMatchObject({ paused: true, reason: 'manual', pausedAt })
    expect(result).toMatchObject({ paused: true, reason: 'manual', pausedAt })
    expect(put.mock.calls[0]?.[2]?.onlyIf).toEqual({ etagMatches: 'v0' })
    expect(put).toHaveBeenCalledTimes(1)
  })
  it('cannot overwrite a newer pause while recording native queue-pause success', async () => {
    const { env, put, state: read } = environment()
    const apply = put.getMockImplementation()!
    const pausedAt = new Date(now - 60_000).toISOString()
    put.mockImplementationOnce(apply).mockImplementationOnce(async (key, body, options) => {
      // First save is v1. A new operator decision wins before the second save.
      await apply(key, JSON.stringify(state({ paused: true, reason: 'manual', pausedAt })))
      return apply(key, body, options)
    })
    vi.stubGlobal('fetch', fakeApi(70e6))
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await monitorOperatingBudget(env, now)
    expect(read()).toMatchObject({ paused: true, reason: 'manual', pausedAt })
    expect(put.mock.calls[0]?.[2]?.onlyIf).toEqual({ etagDoesNotMatch: '*' })
    expect(put.mock.calls[1]?.[2]?.onlyIf).toEqual({ etagMatches: 'v1' })
    expect(put).toHaveBeenCalledTimes(2)
  })

  it('prices included usage at the existing subscription and counts native CPU microseconds correctly', () => {
    expect(estimateOperatingCost(zero)).toBe(5)
    expect(estimateOperatingCost({ ...zero, cpuTimeUs: 31e9 })).toBeCloseTo(5.02)
    expect(estimateOperatingCost({ ...zero, rowsWritten: 70e6 })).toBe(25)
    expect(estimateOperatingCost({ ...zero, r2ClassA: 1e6 + 1 })).toBe(9.5)
    expect(() => estimateOperatingCost({ ...zero, rowsRead: NaN })).toThrow()
  })
  it('collects accountwide quantities and classifies R2 operations', async () => {
    const { env } = environment()
    const api = fakeApi()
    vi.stubGlobal('fetch', api)
    expect(await collectNativeUsage(env, now)).toMatchObject({
      rowsRead: 100,
      rowsWritten: 0,
      r2ClassA: 200,
      r2ClassB: 300,
      d1Bytes: 1e9,
      r2Bytes: 1e8 + 100,
    })
    const outbound = api.mock.calls.find(([input]) => String(input).endsWith('/graphql'))
    expect(outbound).toBeDefined()
    const query = (JSON.parse(outbound![1]!.body as string) as { query: string }).query
    expect(query).toContain('accountTag:"' + env.CLOUDFLARE_ACCOUNT_ID + '"')
    expect(query).not.toContain(String.fromCharCode(92, 34))
    expect(api.mock.calls.every(([, init]) => init?.redirect === 'manual')).toBe(true)
  })
  it('rejects analytics redirects without following them or reading private error content', async () => {
    const { env } = environment()
    const redirected = new Response('synthetic-private-response', {
      status: 302,
      headers: { location: 'https://elsewhere.invalid/synthetic-private-location' },
    })
    const read = vi.spyOn(redirected, 'json')
    const api = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      // Match Workers' accepted modes so this catches the original runtime bug.
      if (init?.redirect !== 'manual') throw new TypeError('Unsupported redirect mode')
      return redirected
    })
    vi.stubGlobal('fetch', api)
    await expect(collectNativeUsage(env, now)).rejects.toThrow(/^OperatingMonitorHttp302$/)
    expect(api).toHaveBeenCalledTimes(1)
    expect(String(api.mock.calls[0]![0])).toBe('https://api.cloudflare.com/client/v4/graphql')
    expect(read).not.toHaveBeenCalled()
  })
  it('keeps the gate closed and errors safe when native queue control redirects', async () => {
    const { env, state: read } = environment()
    const normal = fakeApi(70e6)
    const api = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'PATCH'
        ? new Response('synthetic-private-response', {
            status: 302,
            headers: { location: 'https://elsewhere.invalid/synthetic-private-location' },
          })
        : normal(input, init),
    )
    vi.stubGlobal('fetch', api)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await monitorOperatingBudget(env, now)
    expect(read()).toMatchObject({ paused: true, reason: 'spend', queuePaused: false })
    expect(api.mock.calls.every(([, init]) => init?.redirect === 'manual')).toBe(true)
    expect(api.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(1)
    expect(error).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify({ event: 'operations.queue_pause_failed' }),
    )
  })
  it.each([
    undefined,
    state({ paused: true, reason: 'spend' }),
    state({ checkedAt: new Date(now - 3600000).toISOString() }),
    state({ checkedAt: new Date(now + 120000).toISOString() }),
    {},
  ])('fails closed without a current unpaused state: %j', async (initial) => {
    const { env, DB } = environment(initial)
    expect(await operatingWorkAllowed(env, now)).toBe(false)
    expect(DB.prepare).not.toHaveBeenCalled()
  })
  it('caches only30seconds and then observes a pause without D1', async () => {
    const { env, get, put, DB } = environment(state())
    expect(await operatingWorkAllowed(env, now)).toBe(true)
    await put(OPERATING_STATE_KEY, JSON.stringify(state({ paused: true, reason: 'manual' })))
    expect(await operatingWorkAllowed(env, now + 31000)).toBe(false)
    expect(get).toHaveBeenCalledTimes(2)
    expect(DB.prepare).not.toHaveBeenCalled()
  })
  it('persists the gate before queue pause, never automatically resumes a sticky pause', async () => {
    const { env, put, state: read } = environment()
    const api = fakeApi(70e6)
    vi.stubGlobal('fetch', api)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(await monitorOperatingBudget(env, now)).toMatchObject({
      paused: true,
      reason: 'spend',
      queuePaused: true,
      pausedAt: new Date(now).toISOString(),
    })
    const nativePause = api.mock.calls.findIndex(
      ([input, init]) => String(input).includes('/queues/') && init?.method === 'PATCH',
    )
    expect(nativePause).toBeGreaterThanOrEqual(0)
    expect(put.mock.invocationCallOrder[0]).toBeLessThan(api.mock.invocationCallOrder[nativePause]!)
    vi.stubGlobal('fetch', fakeApi(0))
    await monitorOperatingBudget(env, now + 600000)
    expect(read()).toMatchObject({
      paused: true,
      reason: 'spend',
      pausedAt: new Date(now).toISOString(),
    })
  })
  it('retains application pause when queue API fails and retries control next cycle', async () => {
    const { env, state: read } = environment()
    vi.stubGlobal('fetch', fakeApi(70e6, true))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await monitorOperatingBudget(env, now)
    expect(read()).toMatchObject({ paused: true, queuePaused: false })
    vi.stubGlobal('fetch', fakeApi(70e6))
    await monitorOperatingBudget(env, now + 600000)
    expect(read()).toMatchObject({ paused: true, queuePaused: true })
  })
  it('rejects missing required native quantities rather than treating them as zero', async () => {
    const { env } = environment()
    const incomplete = native()
    delete (
      incomplete.data.viewer.accounts[0]!.d1AnalyticsAdaptiveGroups[0]!.sum as {
        rowsWritten?: number
      }
    ).rowsWritten
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).endsWith('/graphql')
          ? Response.json(incomplete)
          : Response.json({ success: true, result: [{ file_size: 1e9 }] }),
      ),
    )
    await expect(collectNativeUsage(env, now)).rejects.toThrow()
  })
  it('rejects partial GraphQL errors without publishing a healthy estimate', async () => {
    const { env } = environment()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ ...native(), errors: [{ message: 'synthetic partial result' }] }),
      ),
    )
    await expect(collectNativeUsage(env, now)).rejects.toThrow('OperatingMonitorApiError')
  })
  it('keeps an existing malformed state closed even after healthy analytics', async () => {
    const { env, state: read } = environment({ unexpected: 'synthetic corrupt state' })
    vi.stubGlobal('fetch', fakeApi())
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await monitorOperatingBudget(env, now)
    expect(read()).toMatchObject({ paused: true, reason: 'monitor_unavailable', queuePaused: true })
  })
  it('allows a transient analytics failure only while the previous successful state is fresh', async () => {
    const { env, state: read } = environment(state())
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 403 })),
    )
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await monitorOperatingBudget(env, now + 600000)
    expect(read()).toMatchObject({ paused: false })
    await monitorOperatingBudget(env, now + 3600000)
    expect(read()).toMatchObject({ paused: true, reason: 'monitor_unavailable' })
  })
})
