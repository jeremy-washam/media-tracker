import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { createWorkerRuntime, spotifyArchive, type WorkerRuntime } from '../support/worker-runtime'
import { hostedZipInflatedLimit } from '../../apps/api/src/hosted-zip'

let runtime: WorkerRuntime
beforeAll(async () => {
  runtime = await createWorkerRuntime({ seed: false, hosted: true })
})
afterAll(async () => {
  await runtime?.dispose()
})
describe('native Worker hosted ZIP limits', () => {
  it('rejects a compressed expansion bomb before creating source evidence', async () => {
    const bytes = zipSync({
      'Streaming_History_Audio_2026.json': new Uint8Array(hostedZipInflatedLimit + 1),
    })
    const response = await runtime.mf.dispatchFetch(
      new URL('/api/connections/spotify/import', runtime.url),
      { method: 'POST', body: bytes, headers: runtime.authHeaders },
    )
    expect(response.status).toBe(413)
    expect(await response.text()).toContain('local app import')
    expect(
      await runtime.database.prepare('SELECT COUNT(*) count FROM raw_objects').first(),
    ).toEqual({ count: 0 })
  })
  it('imports near-limit inflated JSON under the real Worker runtime', async () => {
    const members = unzipSync(spotifyArchive(1))
    const name = Object.keys(members)[0]!
    const sample = JSON.parse(strFromU8(members[name]!)) as Array<Record<string, unknown>>
    const template = sample[0]!
    const rows: Array<Record<string, unknown>> = []
    let length = 2
    // Distinct actual history rows exercise JSON parsing, projection creation,
    // prepared-manifest storage and the first bounded D1 normalization chunk.
    for (let index = 0; ; index++) {
      const row = { ...template, ts: new Date(Date.UTC(2026, 0, 1) + index * 1000).toISOString() }
      const size = JSON.stringify(row).length + (index === 0 ? 0 : 1)
      if (length + size > hostedZipInflatedLimit) break
      rows.push(row)
      length += size
    }
    const payload = strToU8(JSON.stringify(rows))
    const bytes = zipSync({ [name]: payload })
    const started = performance.now()
    const response = await runtime.api('/api/connections/spotify/import', {
      method: 'POST',
      body: bytes,
    })
    const first = (await response.json()) as { importId: string }
    expect(first).toMatchObject({ completed: false, archiveEpisodes: 1, nextOffset: 100 })
    expect(
      await runtime.database
        .prepare('SELECT COUNT(*) count FROM spotify_podcast_playback_observations')
        .first(),
    ).toEqual({ count: 100 })
    const resumed = await runtime.api(
      `/api/connections/spotify/import/${first.importId}/continue`,
      { method: 'POST' },
    )
    expect(await resumed.json()).toMatchObject({ completed: false, nextOffset: 200 })
    console.info(
      JSON.stringify({
        event: 'runtime.hosted_import_limit',
        inflatedBytes: payload.byteLength,
        historyRows: rows.length,
        compressedBytes: bytes.length,
        elapsedMs: Math.round(performance.now() - started),
      }),
    )
  })
})
