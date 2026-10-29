import { HostedZipError, preflightHostedZip, hostedZipLimitMessage } from './hosted-zip'

/** Bound compressed upload bytes before Hono buffers the body, including chunked requests. */
export async function boundImportRequest(
  request: Request,
  hosted = true,
): Promise<Request | Response> {
  if (!hosted) return request
  if (
    request.method !== 'POST' ||
    !/^\/api\/connections\/(letterboxd|spotify|youtube)\/import$/.test(
      new URL(request.url).pathname,
    )
  )
    return request
  const maximum = 25 * 1024 * 1024
  const reject = () =>
    Response.json(
      { error: { code: 'BAD_REQUEST', message: hostedZipLimitMessage } },
      { status: 413, headers: { 'cache-control': 'no-store' } },
    )
  const length = request.headers.get('content-length')
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maximum)) return reject()
  if (!request.body) return request
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > maximum) {
        await reader.cancel()
        return reject()
      }
      chunks.push(next.value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    preflightHostedZip(bytes)
  } catch (error) {
    if (error instanceof HostedZipError) return reject()
    throw error
  }
  return new Request(request, { body: bytes })
}
