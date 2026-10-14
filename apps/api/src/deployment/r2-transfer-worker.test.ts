import { describe, expect, it, vi } from 'vitest'
import worker from './r2-transfer-worker'

const secret = 'a'.repeat(64)
const digest = 'b'.repeat(64)

function setup() {
  const object = {
    key: 'synthetic/key',
    version: '1',
    size: 3,
    etag: 'example',
    httpEtag: '"example"',
    uploaded: new Date('2026-10-13T00:00:00Z'),
    storageClass: 'Standard',
    checksums: {
      sha256: new Uint8Array(32).fill(187).buffer,
      toJSON: () => ({ sha256: digest }),
    },
    httpMetadata: { contentType: 'text/plain; charset=utf-8' },
    customMetadata: { parserVersion: 'synthetic@1' },
    writeHttpMetadata: vi.fn(),
  } satisfies R2Object
  const bucket = {
    head: vi.fn().mockResolvedValue(object),
    get: vi.fn(),
    put: vi.fn().mockResolvedValue(object),
    createMultipartUpload: vi.fn(async () => {
      throw new Error('Unexpected multipart upload')
    }),
    resumeMultipartUpload: vi.fn(() => {
      throw new Error('Unexpected multipart upload')
    }),
    delete: vi.fn(async () => {
      throw new Error('Unexpected delete')
    }),
    list: vi.fn(async () => {
      throw new Error('Unexpected list')
    }),
  } satisfies R2Bucket
  const env = { RAW_BUCKET: bucket, TRANSFER_SECRET: secret }
  return { object, bucket, env }
}

function request(path: string, input: unknown, token = secret) {
  return new Request('https://transfer.example' + path, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
}

function put(bytes = 3, customMetadata = { parserVersion: 'synthetic@1' }) {
  const metadata = btoa(
    JSON.stringify({
      key: 'synthetic/key',
      bytes,
      sha256: digest,
      httpMetadata: { contentType: 'text/plain; charset=utf-8' },
      customMetadata,
    }),
  )
  return new Request('https://transfer.example/put', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + secret,
      'x-transfer-metadata': metadata,
      'content-length': String(bytes),
    },
    body: bytes ? new Uint8Array(bytes) : null,
  })
}

describe('temporary R2 transfer Worker', () => {
  it('denies missing and incorrect secrets before touching the bucket', async () => {
    const { bucket, env } = setup()
    for (const token of ['', 'c'.repeat(64)]) {
      expect(
        (await worker.fetch(request('/head', { key: 'synthetic/key' }, token), env)).status,
      ).toBe(403)
    }
    expect(
      (
        await worker.fetch(request('/head', { key: 'synthetic/key' }), {
          ...env,
          TRANSFER_SECRET: '',
        })
      ).status,
    ).toBe(403)
    expect(bucket.head).not.toHaveBeenCalled()
    expect(bucket.put).not.toHaveBeenCalled()
  })

  it('returns stored native checksum and exact metadata casing', async () => {
    const { env } = setup()
    const response = await worker.fetch(request('/head', { key: 'synthetic/key' }), env)
    expect(await response.json()).toEqual({
      size: 3,
      sha256: digest,
      httpMetadata: { contentType: 'text/plain; charset=utf-8' },
      customMetadata: { parserVersion: 'synthetic@1' },
    })
  })

  it('streams conditional writes with native SHA256 validation', async () => {
    const { bucket, env } = setup()
    const response = await worker.fetch(put(), env)
    expect(response.status).toBe(200)
    const [key, body, options] = bucket.put.mock.calls[0]!
    expect(key).toBe('synthetic/key')
    expect(body).toBeInstanceOf(ReadableStream)
    expect(options.onlyIf.get('if-none-match')).toBe('*')
    expect(options.sha256).toBe(digest)
    expect(options.customMetadata).toEqual({ parserVersion: 'synthetic@1' })
  })

  it('supports empty objects and refuses a failed create-only condition', async () => {
    const { bucket, env } = setup()
    expect((await worker.fetch(put(0), env)).status).toBe(200)
    expect(bucket.put.mock.calls[0]![1]).toEqual(new Uint8Array())
    bucket.put.mockResolvedValue(null)
    expect((await worker.fetch(put(), env)).status).toBe(409)
  })

  it('rejects oversized metadata and invalid lengths without a write', async () => {
    const { bucket, env } = setup()
    const invalid = put()
    invalid.headers.set('content-length', '2')
    expect((await worker.fetch(invalid, env)).status).toBe(400)
    const tooLarge = put()
    tooLarge.headers.set('x-transfer-metadata', 'a'.repeat(12_001))
    expect((await worker.fetch(tooLarge, env)).status).toBe(400)
    expect(bucket.put).not.toHaveBeenCalled()
  })
})
