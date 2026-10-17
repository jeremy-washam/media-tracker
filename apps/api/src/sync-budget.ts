export type SyncSource = 'readwise' | 'hardcover' | 'letterboxd' | 'spotify'

export interface SyncLimits {
  requests: number
  bytes: number
  pages: number
  records: number
}

// Initial reconciliation ceilings; retries consume the same request allowance.
// No catalog backlog or article HTML acquisition is included in these grants.
export const sourceSyncLimits: Record<SyncSource, SyncLimits> = {
  letterboxd: { requests: 2, pages: 1, records: 500, bytes: 4 * 1024 * 1024 },
  hardcover: { requests: 128, pages: 64, records: 7_000, bytes: 32 * 1024 * 1024 },
  readwise: { requests: 64, pages: 32, records: 10_000, bytes: 16 * 1024 * 1024 },
  spotify: { requests: 32, pages: 24, records: 1_000, bytes: 8 * 1024 * 1024 },
}

export class SyncDeferredError extends Error {
  constructor(
    reason: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(reason)
    this.name = 'SyncDeferredError'
  }
}

export class SyncBudget {
  readonly usage = { requests: 0, bytes: 0, pages: 0, records: 0 }
  readonly deadline: number
  constructor(
    readonly limits: SyncLimits,
    private readonly fetcher: typeof fetch = fetch,
    private readonly clock: () => number = Date.now,
  ) {
    this.deadline = this.clock() + 10 * 60_000
  }

  check() {
    if (this.clock() >= this.deadline) throw new SyncDeferredError('Sync time allowance exhausted')
  }

  page(records: number) {
    this.check()
    if (
      !Number.isSafeInteger(records) ||
      records < 0 ||
      this.usage.pages + 1 > this.limits.pages ||
      this.usage.records + records > this.limits.records
    )
      throw new SyncDeferredError('Sync page or record allowance exhausted')
    this.usage.pages += 1
    this.usage.records += records
  }

  readonly fetch: typeof fetch = async (input, init) => {
    this.check()
    if (this.usage.requests >= this.limits.requests)
      throw new SyncDeferredError('Sync provider request allowance exhausted')
    // Reserve before dispatch: failed requests and lost responses still count.
    this.usage.requests += 1
    const signals = [AbortSignal.timeout(Math.min(30_000, this.deadline - this.clock()))]
    if (init?.signal) signals.push(init.signal)
    else if (input instanceof Request) signals.push(input.signal)
    // Native Workers fetch requires an unbound call, not SyncBudget as `this`.
    const fetcher = this.fetcher
    const response = await fetcher(input, {
      ...init,
      redirect: 'manual',
      signal: AbortSignal.any(signals),
    })
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel()
      throw new SyncDeferredError('Provider redirect rejected during sync')
    }
    if (!response.body) return response
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        this.check()
        const next = await reader.read()
        if (next.done) break
        size += next.value.byteLength
        this.usage.bytes += next.value.byteLength
        if (size > 8 * 1024 * 1024 || this.usage.bytes > this.limits.bytes)
          throw new SyncDeferredError('Sync response byte allowance exhausted')
        chunks.push(next.value)
      }
    } catch (error) {
      await reader.cancel().catch(() => undefined)
      throw error
    } finally {
      reader.releaseLock()
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return new Response(bytes, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  }
}
