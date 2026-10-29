import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { boundImportRequest } from './import-request'
const url = 'https://synthetic.example/api/connections/spotify/import'
describe('hosted import byte boundary', () => {
  it('rejects oversized declared uploads before reading them', async () => {
    const response = await boundImportRequest(
      new Request(url, { method: 'POST', headers: { 'content-length': String(26 * 1024 * 1024) } }),
    )
    expect(response).toBeInstanceOf(Response)
    expect((response as Response).status).toBe(413)
  })
  it('bounds streamed uploads without Content-Length and cancels the stream', async () => {
    let cancelled = false
    const body = new ReadableStream({
      pull(c) {
        c.enqueue(new Uint8Array(26 * 1024 * 1024))
      },
      cancel() {
        cancelled = true
      },
    })
    const request = new Request(url, { method: 'POST', body, duplex: 'half' } as RequestInit)
    expect(((await boundImportRequest(request)) as Response).status).toBe(413)
    expect(cancelled).toBe(true)
  })
  it('rejects a compressed ZIP bomb before passing the body to an import handler', async () => {
    const bytes = zipSync({ 'history.json': new Uint8Array(9 * 1024 * 1024) })
    const response = await boundImportRequest(new Request(url, { method: 'POST', body: bytes }))
    expect(response).toBeInstanceOf(Response)
    expect((response as Response).status).toBe(413)
    expect(await (response as Response).text()).toContain('local app import')
  })
  it('preserves the existing local import path without hosted decompression restrictions', async () => {
    const original = new Request(url, { method: 'POST', body: 'local upload' })
    const accepted = await boundImportRequest(original, false)
    expect(accepted).toBe(original)
  })
  it('preserves accepted bytes, method and private request headers', async () => {
    const bytes = zipSync({ 'history.json': strToU8('[]') })
    const request = (await boundImportRequest(
      new Request(url, {
        method: 'POST',
        body: bytes,
        headers: { 'x-synthetic': 'present' },
      }),
    )) as Request
    expect(new Uint8Array(await request.arrayBuffer())).toEqual(bytes)
    expect(request.method).toBe('POST')
    expect(request.headers.get('x-synthetic')).toBe('present')
  })
})
