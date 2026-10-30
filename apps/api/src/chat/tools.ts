import { z } from 'zod'
import { ChatQueryMediaSchema, ChatMediaDetailsSchema } from '@media-tracker/contracts'
import { SqlChatMedia, D1DatabaseClient, ChatConflict } from '@media-tracker/db'
import type { ChatMediaKind } from '@media-tracker/domain'
import {
  createArticlesRepository,
  createBooksRepository,
  createMoviesRepository,
  createVideosRepository,
  type Bindings,
} from '../env'
import { chatCursor, readChatCursor, chatDigest } from './security'

export interface ChatToolResult {
  content: unknown
  references: { kind: ChatMediaKind; id: string; title: string }[]
  privateText: string[]
}
const mediaCursor = z
  .object({
    fingerprint: z.string(),
    revision: z.string(),
    offset: z.number().int().min(0).max(250_000),
  })
  .strict()
const detailCursor = z
  .object({
    fingerprint: z.string(),
    historyOffset: z.number().int().min(0).max(250_000),
    textOffset: z.number().int().min(0).max(250_000),
    highlightCursor: z.string().max(2048).nullable(),
    historyDone: z.boolean(),
    textDone: z.boolean(),
    highlightsDone: z.boolean(),
    revision: z.string(),
  })
  .strict()
const supportedKinds = new Set(['book', 'movie', 'article', 'podcast_episode', 'song', 'video'])
function boundedData(value: unknown, max = 24_000): unknown {
  // No credentials/storage references are part of repository detail contracts.
  // Clamp optional prose, keeping IDs, fields, date precision and nulls intact.
  if (typeof value === 'string') return value.slice(0, max)
  if (Array.isArray(value))
    return value.slice(0, 100).map((x) => boundedData(x, Math.min(max, 5000)))
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([name]) => !/(?:token|secret|storageKey|objectKey|rawObject)/i.test(name))
        .map(([name, data]) => [name, boundedData(data, Math.min(max, 5000))]),
    )
  return value
}
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(strings)
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings)
  return []
}
function privateProse(value: unknown): string[] {
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value)) return value.flatMap(privateProse)
  return Object.entries(value).flatMap(([key, data]) =>
    /note|review|highlight/i.test(key) ? strings(data) : privateProse(data),
  )
}
export async function queryChatMedia(env: Bindings, args: unknown): Promise<ChatToolResult> {
  const input = ChatQueryMediaSchema.parse(args),
    repository = new SqlChatMedia(new D1DatabaseClient(env.DB, env.DATABASE_USAGE_OBSERVER))
  if (
    input.filters.consumed?.from &&
    input.filters.consumed.toExclusive &&
    input.filters.consumed.from >= input.filters.consumed.toExclusive
  )
    throw new ChatConflict('chat_invalid_date_range', 400)
  const fingerprint = await chatDigest(JSON.stringify({ ...input, cursor: undefined })),
    secret = env.TOKEN_ENCRYPTION_KEY ?? env.OPENAI_API_KEY
  if (!secret) throw new ChatConflict('chat_unavailable', 503)
  const cursor = input.cursor
    ? mediaCursor.parse(await readChatCursor(input.cursor, 'media', secret))
    : null
  if (cursor && cursor.fingerprint !== fingerprint)
    throw new ChatConflict('chat_cursor_invalid', 400)
  const result = await repository.query(input, cursor?.offset ?? 0)
  if (cursor && cursor.revision !== result.revision) throw new ChatConflict('chat_cursor_stale')
  if (!result.stable) throw new ChatConflict('chat_cursor_stale')
  const nextCursor = result.more
    ? await chatCursor(
        'media',
        { fingerprint, revision: result.revision, offset: (cursor?.offset ?? 0) + input.limit },
        secret,
      )
    : null
  return {
    content: {
      ...result,
      more: undefined,
      nextCursor,
      asOf: new Date().toISOString(),
      citationFormat:
        'Cite returned items with Markdown [Title](library:KIND:ID). Reference only IDs in this result.',
    },
    references: result.items.map((item) => ({
      kind: item.type as ChatMediaKind,
      id: String(item.id),
      title: String(item.title ?? 'Untitled'),
    })),
    privateText: [],
  }
}
export async function getChatMediaDetails(env: Bindings, args: unknown): Promise<ChatToolResult> {
  const input = ChatMediaDetailsSchema.parse(args),
    repository = new SqlChatMedia(new D1DatabaseClient(env.DB, env.DATABASE_USAGE_OBSERVER)),
    secret = env.TOKEN_ENCRYPTION_KEY ?? env.OPENAI_API_KEY
  if (!secret) throw new ChatConflict('chat_unavailable', 503)
  if (input.cursor && input.references.length !== 1)
    throw new ChatConflict('chat_detail_cursor_requires_one_item', 400)
  const cursor = input.cursor
    ? detailCursor.parse(await readChatCursor(input.cursor, 'details', secret))
    : null
  const revision = await repository.revision()
  if (cursor && cursor.revision !== revision) throw new ChatConflict('chat_cursor_stale')
  const data: unknown[] = [],
    references: ChatToolResult['references'] = [],
    privateText: string[] = []
  for (const reference of input.references) {
    const fingerprint = await chatDigest(
      JSON.stringify({ ...input, references: [reference], cursor: undefined }),
    )
    if (cursor && cursor.fingerprint !== fingerprint)
      throw new ChatConflict('chat_cursor_invalid', 400)
    if (!supportedKinds.has(reference.kind)) {
      data.push({
        ...reference,
        availability: 'metadata_unavailable',
        reason:
          'This aggregate identity is available in the Library inspector; model-safe source provenance is not yet available for its enriched metadata.',
      })
      continue
    }
    const item = await repository.canonical(reference.id)
    if (!item || item.type !== reference.kind) {
      data.push({ ...reference, availability: 'not_found' })
      continue
    }
    const safeItem = { ...item }
    if (reference.kind === 'song' || reference.kind === 'podcast_episode')
      delete safeItem.description
    let details: unknown = safeItem
    if (reference.kind === 'book')
      details =
        (await createBooksRepository(env.DB, env.DATABASE_USAGE_OBSERVER).findBook(reference.id)) ??
        safeItem
    else if (reference.kind === 'movie')
      details =
        (await createMoviesRepository(env.DB, env.DATABASE_USAGE_OBSERVER).findMovie(
          reference.id,
        )) ?? safeItem
    else if (reference.kind === 'article')
      details =
        (await createArticlesRepository(env.DB, env.DATABASE_USAGE_OBSERVER).findArticle(
          reference.id,
        )) ?? safeItem
    else if (reference.kind === 'video')
      details =
        (await createVideosRepository(env.DB, env.DATABASE_USAGE_OBSERVER).findVideo(
          reference.id,
        )) ?? safeItem
    privateText.push(...privateProse(details))
    const history =
      !cursor?.historyDone && input.includes.some((x) => x === 'history' || x === 'reviews')
        ? await repository.history(reference.id, cursor?.historyOffset ?? 0)
        : []
    const selectedHistory = history
      .slice(0, 20)
      .map((row) => (input.includes.includes('reviews') ? row : { ...row, review_text: undefined }))
    if (input.includes.includes('reviews'))
      privateText.push(
        ...selectedHistory.flatMap((row) =>
          typeof row.review_text === 'string' ? [row.review_text] : [],
        ),
      )
    const article =
      reference.kind === 'article'
        ? createArticlesRepository(env.DB, env.DATABASE_USAGE_OBSERVER)
        : null
    const highlights =
      article && !cursor?.highlightsDone && input.includes.includes('highlights')
        ? await article.listArticleHighlights(reference.id, {
            limit: 10,
            ...(cursor?.highlightCursor ? { cursor: cursor.highlightCursor } : {}),
          })
        : null
    if (highlights) privateText.push(...strings(highlights.data))
    const passages: unknown[] = []
    let textMore = false
    if (article && !cursor?.textDone && input.includes.includes('text')) {
      const targets = await repository.articlePassages(
        reference.id,
        input.passageQuery,
        cursor?.textOffset ?? 0,
      )
      textMore = targets.length > 3
      for (const target of targets.slice(0, 3)) {
        const length = Math.min(target.byte_length, 10_000),
          object = await env.RAW_BUCKET.get(target.extracted_object_key, {
            range: { offset: target.byte_start, length },
          })
        if (!object) {
          passages.push({
            availability: 'unavailable',
            manifestId: target.manifest_id,
            ordinal: target.ordinal,
          })
          continue
        }
        const bytes = await object.arrayBuffer(),
          returnedSha256 = Array.from(
            new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
            (byte) => byte.toString(16).padStart(2, '0'),
          ).join('')
        if (
          bytes.byteLength !== length ||
          (length === target.byte_length && returnedSha256 !== target.sha256)
        ) {
          passages.push({
            availability: 'unavailable',
            manifestId: target.manifest_id,
            ordinal: target.ordinal,
            reason: 'integrity_mismatch',
          })
          continue
        }
        const text = new TextDecoder().decode(bytes)
        privateText.push(text)
        passages.push({
          text,
          manifestId: target.manifest_id,
          ordinal: target.ordinal,
          byteStart: target.byte_start,
          byteLength: length,
          chunkSha256: target.sha256,
          chunkByteLength: target.byte_length,
          returnedSha256,
          extractionVersion: target.extraction_version,
          coverage: target.coverage,
          truncated: length < target.byte_length,
        })
      }
    }
    if (reference.kind === 'article')
      privateText.push(
        ...strings(
          details && typeof details === 'object'
            ? Object.fromEntries(Object.entries(details).filter(([name]) => /note/i.test(name)))
            : null,
        ),
      )
    const more = history.length > 20 || textMore || !!highlights?.nextCursor
    const nextCursor = more
      ? await chatCursor(
          'details',
          {
            fingerprint,
            revision,
            historyDone: !!cursor?.historyDone || history.length <= 20,
            textDone: !!cursor?.textDone || !textMore,
            highlightsDone: !!cursor?.highlightsDone || !highlights?.nextCursor,
            historyOffset:
              (cursor?.historyOffset ?? 0) + (history.length > 20 ? 20 : history.length),
            textOffset: (cursor?.textOffset ?? 0) + passages.length,
            highlightCursor: highlights?.nextCursor ?? null,
          },
          secret,
        )
      : null
    data.push({
      ...reference,
      metadata: boundedData(details),
      history: boundedData(selectedHistory),
      highlights: boundedData(highlights?.data ?? []),
      passages,
      textAvailability: passages.length
        ? 'available'
        : input.includes.includes('text')
          ? 'unavailable'
          : 'not_requested',
      nextCursor,
      limitations:
        reference.kind === 'song' || reference.kind === 'podcast_episode'
          ? [
              'Enriched Spotify API catalog fields are excluded; this result uses owner-history canonical metadata.',
            ]
          : [],
    })
    references.push({
      kind: reference.kind,
      id: reference.id,
      title: String(item.title ?? 'Untitled'),
    })
  }
  return {
    content: {
      data,
      citationFormat: 'Use [Title](library:KIND:ID) with exactly a returned identity.',
    },
    references,
    privateText,
  }
}
