import { z } from 'zod'

const strings = z.record(z.string(), z.string())
const objectInput = z.object({
  key: z.string().min(1).max(1024),
  bytes: z.number().int().min(0).max(95_000_000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  httpMetadata: z
    .object({
      contentType: z.string().optional(),
      contentLanguage: z.string().optional(),
      contentDisposition: z.string().optional(),
      contentEncoding: z.string().optional(),
      cacheControl: z.string().optional(),
      cacheExpiry: z.string().datetime().optional(),
    })
    .strict(),
  customMetadata: strings,
})

async function authenticated(request: Request, secret: string): Promise<boolean> {
  const supplied = request.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!secret || !supplied || !/^[a-f0-9]{64}$/.test(supplied)) return false
  const encoder = new TextEncoder()
  const expected = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const candidate = await crypto.subtle.importKey(
    'raw',
    encoder.encode(supplied),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const message = encoder.encode('Imladris private deployment transfer')
  return crypto.subtle.verify(
    'HMAC',
    candidate,
    await crypto.subtle.sign('HMAC', expected, message),
    message,
  )
}

function metadata(object: R2Object) {
  return {
    size: object.size,
    sha256: object.checksums.sha256
      ? Array.from(new Uint8Array(object.checksums.sha256), (b) =>
          b.toString(16).padStart(2, '0'),
        ).join('')
      : null,
    httpMetadata: object.httpMetadata ?? {},
    customMetadata: object.customMetadata ?? {},
  }
}

const worker = {
  async fetch(request: Request, env: R2TransferBindings): Promise<Response> {
    if (!(await authenticated(request, env.TRANSFER_SECRET)))
      return new Response(null, { status: 403 })
    if (request.method !== 'POST') return new Response(null, { status: 405 })
    const route = new URL(request.url).pathname
    try {
      if (route === '/put') {
        const encoded = request.headers.get('x-transfer-metadata') ?? ''
        if (encoded.length > 12_000) return new Response(null, { status: 400 })
        const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))
        const input = objectInput.parse(JSON.parse(new TextDecoder().decode(bytes)))
        if (
          Number(request.headers.get('content-length')) !== input.bytes ||
          (input.bytes > 0 && !request.body)
        )
          return new Response(null, { status: 400 })
        const httpMetadata: R2HTTPMetadata = {}
        for (const key of [
          'contentType',
          'contentLanguage',
          'contentDisposition',
          'contentEncoding',
          'cacheControl',
        ] as const) {
          const value = input.httpMetadata[key]
          if (value !== undefined) httpMetadata[key] = value
        }
        if (input.httpMetadata.cacheExpiry)
          httpMetadata.cacheExpiry = new Date(input.httpMetadata.cacheExpiry)
        const object = await env.RAW_BUCKET.put(input.key, request.body ?? new Uint8Array(), {
          onlyIf: new Headers({ 'If-None-Match': '*' }),
          httpMetadata,
          customMetadata: input.customMetadata,
          sha256: input.sha256,
        })
        return object ? Response.json(metadata(object)) : new Response(null, { status: 409 })
      }
      if (!['/head', '/get'].includes(route)) return new Response(null, { status: 404 })
      if (Number(request.headers.get('content-length')) > 4096)
        return new Response(null, { status: 400 })
      const input = z.object({ key: z.string().min(1).max(1024) }).parse(await request.json())
      if (route === '/head') {
        const object = await env.RAW_BUCKET.head(input.key)
        return object ? Response.json(metadata(object)) : new Response(null, { status: 404 })
      }
      const object = await env.RAW_BUCKET.get(input.key)
      return object
        ? new Response(object.body, {
            headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' },
          })
        : new Response(null, { status: 404 })
    } catch {
      return new Response(null, { status: 400 })
    }
  },
}

export default worker
