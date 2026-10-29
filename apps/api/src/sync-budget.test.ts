import { describe, expect, it, vi } from 'vitest'
import { SyncBudget, SyncDeferredError } from './sync-budget'

const limits = { requests: 2, pages: 2, records: 3, bytes: 64 }

describe('source sync resource ceilings', () => {
  it('stops at database usage or storage review thresholds before another request', async () => {
    const fetcher = vi.fn<typeof fetch>()
    const budget = new SyncBudget(limits, fetcher, Date.now, () => ({
      rowsRead: 0,
      rowsWritten: 1_000_000,
    }))
    await expect(budget.fetch('https://example.test')).rejects.toThrow('database allowance')
    const storage = new SyncBudget(limits, fetcher, Date.now, () => ({
      rowsRead: 0,
      rowsWritten: 0,
      databaseBytes: 3_000_000_000,
    }))
    await expect(storage.fetch('https://example.test')).rejects.toThrow('storage review')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('rejects redirects without forwarding authorization to another origin', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'https://other.example.test/' },
      }),
    )
    const budget = new SyncBudget(limits, fetcher)
    await expect(budget.fetch('https://example.test')).rejects.toThrow('redirect rejected')
    expect(fetcher).toHaveBeenCalledOnce()
    expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe('manual')
  })
  it('does not replace the native fetch receiver with a budget instance', async () => {
    const fetcher = vi.fn<typeof fetch>(async function (this: unknown) {
      expect(this).toBeUndefined()
      return new Response('ok')
    })
    expect(await (await new SyncBudget(limits, fetcher).fetch('https://example.test')).text()).toBe(
      'ok',
    )
  })
  it('charges failed dispatches and stops before the next network request', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('lost response'))
    const budget = new SyncBudget(limits, fetcher)
    await expect(budget.fetch('https://example.test')).rejects.toThrow('lost response')
    await expect(budget.fetch('https://example.test')).rejects.toThrow('lost response')
    await expect(budget.fetch('https://example.test')).rejects.toBeInstanceOf(SyncDeferredError)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(budget.usage.requests).toBe(2)
  })

  it('counts response bytes and cancels an oversized stream before buffering it', async () => {
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(65))
      },
      cancel,
    })
    const budget = new SyncBudget(
      limits,
      vi.fn<typeof fetch>().mockResolvedValue(new Response(body)),
    )
    await expect(budget.fetch('https://example.test')).rejects.toThrow('byte allowance')
    expect(cancel).toHaveBeenCalledOnce()
    expect(budget.usage.bytes).toBe(65)
  })

  it('preserves error status and body for provider retry handling', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('retry', {
        status: 429,
        headers: { 'retry-after': '30' },
      }),
    )
    const budget = new SyncBudget(limits, fetcher)
    const response = await budget.fetch('https://example.test')
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('30')
    expect(await response.text()).toBe('retry')
    expect(budget.usage).toMatchObject({ requests: 1, bytes: 5 })
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      redirect: 'manual',
      signal: expect.any(AbortSignal),
    })
  })

  it('keeps empty Spotify player responses valid', async () => {
    const budget = new SyncBudget(
      limits,
      vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 })),
    )
    expect((await budget.fetch('https://example.test')).status).toBe(204)
  })

  it('fails on deadline and overflow instead of returning a complete snapshot', () => {
    let now = 0
    const budget = new SyncBudget(limits, fetch, () => now)
    budget.page(2)
    expect(() => budget.page(2)).toThrow(SyncDeferredError)
    expect(budget.usage).toMatchObject({ pages: 1, records: 2 })
    budget.page(1)
    expect(() => budget.page(0)).toThrow(SyncDeferredError)
    now = 600_000
    expect(() => budget.check()).toThrow('time allowance')
  })
})
