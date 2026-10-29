import { fetchReaderDocumentPage, parseReaderPage } from '@media-tracker/connector-readwise'
import type { SyncJob } from '@media-tracker/contracts'
import { createArticlesRepository } from './env'
import type { Bindings } from './env'
import { withReadwiseRetry } from './readwise-retry'

const encoder = new TextEncoder()

async function digest(bytes: Uint8Array): Promise<string> {
  const value = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(value)].map((part) => part.toString(16).padStart(2, '0')).join('')
}

function numericEntity(code: string, radix: 10 | 16): string {
  const point = Number.parseInt(code, radix)
  return Number.isInteger(point) &&
    point > 0 &&
    point <= 0x10ffff &&
    (point < 0xd800 || point > 0xdfff)
    ? String.fromCodePoint(point)
    : '\uFFFD'
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => numericEntity(code, 10))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => numericEntity(code, 16))
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
}

export function extractArticleText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\/(p|div|article|section|li|h[1-6])\s*>/gi, '\n\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .split(/\n{2,}/)
    .map((part) =>
      part
        .replace(/\s+/g, ' ')
        .replace(/\s+([.,;:!?])/g, '$1')
        .trim(),
    )
    .filter(Boolean)
    .join('\n\n')
}

export async function chunkArticleText(text: string) {
  const result: Array<{
    ordinal: number
    byteStart: number
    byteLength: number
    sha256: string
    text: string
  }> = []
  let current = '',
    currentByteLength = 0,
    byteStart = 0,
    lastWhitespaceIndex = -1
  const flush = async () => {
    if (!current) return
    const bytes = encoder.encode(current)
    result.push({
      ordinal: result.length,
      byteStart,
      byteLength: bytes.byteLength,
      sha256: await digest(bytes),
      text: current,
    })
    byteStart += bytes.byteLength
    current = ''
    currentByteLength = 0
    lastWhitespaceIndex = -1
  }
  for (const character of text) {
    const characterBytes = encoder.encode(character).byteLength
    if (currentByteLength + characterBytes > 3500 && current) {
      if (lastWhitespaceIndex > 0) {
        const remainder = current.slice(lastWhitespaceIndex)
        current = current.slice(0, lastWhitespaceIndex)
        await flush()
        current = remainder
        currentByteLength = encoder.encode(current).byteLength
        lastWhitespaceIndex = [...current.matchAll(/\s+/g)].at(-1)?.index ?? -1
      } else await flush()
    }
    current += character
    currentByteLength += characterBytes
    if (/\s/u.test(character)) lastWhitespaceIndex = current.length
  }
  await flush()
  return result
}

const chunksPerInvocation = 12

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError'
}

export async function acquireReadwiseArticleContent(
  bindings: Bindings,
  job: Extract<SyncJob, { operation: 'acquire_article_content' }> | SyncJob,
): Promise<void> {
  if (job.operation !== 'acquire_article_content' || !job.connectionId || !job.documentId) return
  if (!bindings.READWISE_TOKEN) throw new Error('Readwise is not configured')
  const documentId = job.documentId
  const token = bindings.READWISE_TOKEN
  const repository = createArticlesRepository(bindings.DB, bindings.DATABASE_USAGE_OBSERVER)
  const attemptedAt = new Date().toISOString()
  const attemptNumber = await repository.startContentJob(job.idempotencyKey, attemptedAt)
  const acquisitionId = `${job.idempotencyKey}:attempt:${attemptNumber}`
  const target = await repository.findContentTarget(job.connectionId, job.documentId)
  if (target === null) {
    await repository.completeContentJob(job.idempotencyKey, attemptedAt)
    return
  }
  const response = await withReadwiseRetry(() =>
    fetchReaderDocumentPage({
      token,
      documentId,
      withHtmlContent: true,
      limit: 1,
    }),
  )
  const responseSha256 = await digest(response.bytes)
  const responseObjectKey = `raw/readwise/content-api/${responseSha256.slice(0, 2)}/${responseSha256}.json`
  await bindings.RAW_BUCKET.put(responseObjectKey, response.bytes, {
    httpMetadata: { contentType: response.contentType },
    customMetadata: { sha256: responseSha256, parserVersion: 'readwise-html@1' },
  })
  await repository.recordContentRawAcquisition({
    id: acquisitionId,
    idempotencyKey: job.idempotencyKey,
    attemptNumber,
    connectionId: target.connectionId,
    readwiseDocumentId: target.readwiseDocumentId,
    storageKey: responseObjectKey,
    sha256: responseSha256,
    contentType: response.contentType,
    byteLength: response.bytes.byteLength,
    acquiredAt: attemptedAt,
    status: 'pending',
  })
  let page
  try {
    page = parseReaderPage(response.body)
  } catch (error) {
    await repository.recordContentRawAcquisition({
      id: acquisitionId,
      idempotencyKey: job.idempotencyKey,
      attemptNumber,
      connectionId: target.connectionId,
      readwiseDocumentId: target.readwiseDocumentId,
      storageKey: responseObjectKey,
      sha256: responseSha256,
      contentType: response.contentType,
      byteLength: response.bytes.byteLength,
      acquiredAt: attemptedAt,
      status: 'failed',
      error: errorName(error),
    })
    throw error
  }
  const document = page.results.find((item) => item.id === documentId)
  const html = document?.html_content?.trim()
  if (!html) {
    await repository.recordContentRawAcquisition({
      id: acquisitionId,
      idempotencyKey: job.idempotencyKey,
      attemptNumber,
      connectionId: target.connectionId,
      readwiseDocumentId: target.readwiseDocumentId,
      storageKey: responseObjectKey,
      sha256: responseSha256,
      contentType: response.contentType,
      byteLength: response.bytes.byteLength,
      acquiredAt: attemptedAt,
      status: 'processed',
    })
    await repository.failContentJob(job.idempotencyKey, attemptedAt, 'content_unavailable')
    return
  }
  const text = extractArticleText(html)
  if (!text) {
    await repository.recordContentRawAcquisition({
      id: acquisitionId,
      idempotencyKey: job.idempotencyKey,
      attemptNumber,
      connectionId: target.connectionId,
      readwiseDocumentId: target.readwiseDocumentId,
      storageKey: responseObjectKey,
      sha256: responseSha256,
      contentType: response.contentType,
      byteLength: response.bytes.byteLength,
      acquiredAt: attemptedAt,
      status: 'processed',
    })
    await repository.failContentJob(job.idempotencyKey, attemptedAt, 'no_indexable_text')
    return
  }
  const rawBytes = encoder.encode(html),
    textBytes = encoder.encode(text)
  const [rawSha256, extractedSha256] = await Promise.all([digest(rawBytes), digest(textBytes)])
  const rawObjectKey = `content/readwise/html/${rawSha256.slice(0, 2)}/${rawSha256}.html`
  const extractedObjectKey = `content/readwise/text/${extractedSha256.slice(0, 2)}/${extractedSha256}.txt`
  await Promise.all([
    bindings.RAW_BUCKET.put(rawObjectKey, rawBytes, {
      httpMetadata: { contentType: 'text/html; charset=utf-8' },
      customMetadata: { sha256: rawSha256, policyVersion: '1' },
    }),
    bindings.RAW_BUCKET.put(extractedObjectKey, textBytes, {
      httpMetadata: { contentType: 'text/plain; charset=utf-8' },
      customMetadata: { sha256: extractedSha256, extractionVersion: '1' },
    }),
  ])
  const now = new Date().toISOString()
  const manifestId = `readwise-content:${target.readwiseDocumentId}:${encodeURIComponent(target.sourceUpdatedAt ?? rawSha256)}`
  await repository.beginContent({
    ...target,
    manifestId,
    rawObjectKey,
    rawSha256,
    extractedObjectKey,
    extractedSha256,
    acquiredAt: now,
    processedAt: now,
    coverage: 'full',
  })
  await repository.recordContentRawAcquisition({
    id: acquisitionId,
    idempotencyKey: job.idempotencyKey,
    attemptNumber,
    connectionId: target.connectionId,
    readwiseDocumentId: target.readwiseDocumentId,
    storageKey: responseObjectKey,
    sha256: responseSha256,
    contentType: response.contentType,
    byteLength: response.bytes.byteLength,
    acquiredAt: attemptedAt,
    status: 'processed',
  })
  await bindings.SYNC_QUEUE.send({
    idempotencyKey: job.idempotencyKey,
    source: 'readwise',
    operation: 'index_article_content',
    manifestId,
    nextOrdinal: 0,
  })
}

export async function indexReadwiseArticleContent(
  bindings: Bindings,
  job: Extract<SyncJob, { operation: 'index_article_content' }> | SyncJob,
): Promise<void> {
  if (job.operation !== 'index_article_content' || !job.manifestId || job.nextOrdinal === undefined)
    return
  const repository = createArticlesRepository(bindings.DB, bindings.DATABASE_USAGE_OBSERVER)
  const manifest = await repository.findContentManifest(job.manifestId)
  if (manifest === null) {
    await repository.failContentJob(
      job.idempotencyKey,
      new Date().toISOString(),
      'manifest_missing',
    )
    return
  }
  if (manifest.state === 'failed') await repository.resumeContentManifest(job.manifestId)
  if (manifest.state === 'ready') {
    await repository.completeContentJob(job.idempotencyKey, new Date().toISOString())
    return
  }
  const object = await bindings.RAW_BUCKET.get(manifest.extractedObjectKey)
  if (object === null) throw new Error('Extracted Article text is missing')
  const contentChunks = await chunkArticleText(await object.text())
  if (
    !Number.isInteger(job.nextOrdinal) ||
    job.nextOrdinal < 0 ||
    job.nextOrdinal >= contentChunks.length
  )
    throw new RangeError('Article indexing ordinal is outside the extracted content')
  const batch = contentChunks.slice(job.nextOrdinal, job.nextOrdinal + chunksPerInvocation)
  await repository.applyContentChunkBatch(job.manifestId, batch)
  const nextOrdinal = job.nextOrdinal + batch.length
  if (nextOrdinal < contentChunks.length) {
    await bindings.SYNC_QUEUE.send({ ...job, nextOrdinal })
    return
  }
  if (!(await repository.hasContentChunkRange(job.manifestId, contentChunks.length)))
    throw new Error('Article indexing chunk range is incomplete; retry the missing delivery')
  await repository.finalizeContent(job.manifestId, job.idempotencyKey, new Date().toISOString())
}
