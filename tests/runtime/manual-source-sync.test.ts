import { once } from 'node:events'
import { request as httpRequest } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SourceSyncQueuedResponseSchema } from '../../packages/contracts/src/index'
import { createWorkerRuntime, type WorkerRuntime } from '../support/worker-runtime'

let runtime: WorkerRuntime
let releaseProvider: () => void
const providerGate = new Promise<void>((resolve) => {
  releaseProvider = resolve
})
beforeAll(async () => {
  runtime = await createWorkerRuntime({
    seed: false,
    hosted: true,
    sourceSync: true,
    beforeReadwiseResponse: () => providerGate,
  })
})
afterAll(async () => {
  releaseProvider()
  await runtime?.dispose()
})

describe('native hosted manual source dispatch', () => {
  it('returns acceptance before a held provider response and completes through the queue after the client closes', async () => {
    const request = httpRequest(new URL('/api/connections/readwise/sync', runtime.url), {
      method: 'POST',
      headers: { ...runtime.authHeaders, connection: 'close' },
      agent: false,
    })
    const socketClosed = new Promise<void>((resolve) => {
      request.once('socket', (socket) => socket.once('close', () => resolve()))
    })
    const responseReady = once(request, 'response')
    request.setTimeout(10_000, () => request.destroy(new Error('Queued acceptance timed out')))
    request.end()
    try {
      const [response] = await responseReady
      expect(response.statusCode).toBe(202)
      const chunks: Buffer[] = []
      for await (const chunk of response) chunks.push(Buffer.from(chunk))
      expect(
        SourceSyncQueuedResponseSchema.parse(JSON.parse(Buffer.concat(chunks).toString())),
      ).toMatchObject({
        status: 'queued',
        source: 'readwise',
      })
      await socketClosed
      expect(request.socket?.destroyed).toBe(true)
      await expect
        .poll(
          () => runtime.outboundRequests.some((value) => new URL(value).hostname === 'readwise.io'),
          { timeout: 10_000 },
        )
        .toBe(true)
      expect(
        await runtime.database.prepare('SELECT COUNT(*) count FROM sync_cursors').first(),
      ).toEqual({ count: 0 })
    } finally {
      request.destroy()
      releaseProvider()
    }
    await expect
      .poll(
        async () =>
          runtime.database
            .prepare(
              "SELECT outcome,attempts,retry_count FROM source_sync_admission WHERE source='readwise'",
            )
            .first(),
        { timeout: 20_000 },
      )
      .toEqual({ outcome: 'succeeded', attempts: 1, retry_count: 0 })
    const committed = await runtime.database
      .prepare(
        `SELECT r.status,r.raw_object_count,r.source_record_count,
        (SELECT COUNT(*) FROM sync_cursors c WHERE c.sync_run_id=r.id) committed_cursors,
        (SELECT COUNT(*) FROM raw_objects o WHERE o.sync_run_id=r.id) durable_raw
        FROM sync_runs r JOIN connections c ON c.id=r.connection_id
        WHERE c.source='readwise' ORDER BY r.started_at DESC LIMIT 1`,
      )
      .first<{
        status: string
        raw_object_count: number
        source_record_count: number
        committed_cursors: number
        durable_raw: number
      }>()
    expect(committed).toMatchObject({ status: 'succeeded' })
    expect(committed!.committed_cursors).toBeGreaterThan(0)
    expect(committed!.raw_object_count).toBeGreaterThan(0)
    expect(committed!.source_record_count).toBeGreaterThan(0)
    expect(committed!.durable_raw).toBe(committed!.raw_object_count)
    expect((await runtime.database.prepare('PRAGMA foreign_key_check').all()).results).toEqual([])
  })

  it('rejects an exhausted same-day allocation without enqueueing another provider scan', async () => {
    const sourceScans = () =>
      runtime.outboundRequests.filter((value) => {
        const url = new URL(value)
        // Article acquisitions can continue after source completion. Only source
        // scans, not independent content requests by exact ID, are excluded here.
        return url.hostname === 'readwise.io' && !url.searchParams.has('id')
      })
    const before = sourceScans().length
    const response = await runtime.mf.dispatchFetch(
      new URL('/api/connections/readwise/sync', runtime.url),
      {
        method: 'POST',
        headers: runtime.authHeaders,
      },
    )
    expect(response.status).toBe(503)
    expect((await response.json()) as unknown).toMatchObject({
      error: { code: 'SERVICE_UNAVAILABLE' },
    })
    expect(sourceScans()).toHaveLength(before)
    expect(
      await runtime.database
        .prepare(
          "SELECT outcome,attempts,retry_count FROM source_sync_admission WHERE source='readwise'",
        )
        .first(),
    ).toEqual({ outcome: 'succeeded', attempts: 1, retry_count: 0 })
  })
})
