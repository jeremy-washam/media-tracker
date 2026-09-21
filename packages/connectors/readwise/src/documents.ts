import {
  temporalDay,
  temporalInstant,
  temporalMonth,
  temporalYear,
  type MediaType,
  type TemporalBasis,
  type TemporalValue,
} from '@media-tracker/domain'
import { z } from 'zod'

const optionalString = z.string().nullable().optional()
const readerTagSchema = z
  .object({
    name: optionalString,
    type: optionalString,
    created: z.union([z.number(), z.string()]).nullable().optional(),
  })
  .passthrough()

export const ReaderDocumentSchema = z
  .object({
    id: z.string().min(1),
    url: optionalString,
    source_url: optionalString,
    title: optionalString,
    author: optionalString,
    source: optionalString,
    site_name: optionalString,
    summary: optionalString,
    notes: optionalString,
    image_url: optionalString,
    parent_id: optionalString,
    category: z.string(),
    location: optionalString,
    tags: z.record(z.string(), readerTagSchema).nullable().optional(),
    word_count: z.number().nonnegative().nullable().optional(),
    reading_time: z.union([z.string(), z.number()]).nullable().optional(),
    listening_time: z.union([z.string(), z.number()]).nullable().optional(),
    html_content: optionalString,
    reading_progress: z.number().nullable().optional(),
    created_at: optionalString,
    published_date: optionalString,
    saved_at: optionalString,
    first_opened_at: optionalString,
    last_opened_at: optionalString,
    updated_at: optionalString,
    last_moved_at: optionalString,
  })
  .passthrough()

export const ReaderPageSchema = z
  .object({
    count: z.number().nonnegative().optional(),
    nextPageCursor: z.string().nullable().optional(),
    results: z.array(ReaderDocumentSchema),
  })
  .passthrough()

export type ReaderDocument = z.infer<typeof ReaderDocumentSchema>
export type ReaderPage = z.infer<typeof ReaderPageSchema>

export interface NormalizedReaderDocument {
  readonly documentId: string
  readonly sourceRecordKey: string
  readonly sourceRecordedAt: TemporalValue | null
  readonly article: null | {
    readonly subtype: 'article' | 'newsletter' | 'pdf' | 'rss'
    readonly readerUrl: string | null
    readonly sourceUrl: string | null
    readonly category: string
    readonly location: string
    readonly title: string | null
    readonly author: string | null
    readonly publication: string | null
    readonly acquisitionSource: string | null
    readonly summary: string | null
    readonly imageUrl: string | null
    readonly note: string | null
    readonly wordCount: number | null
    readonly readingTimeRaw: string | null
    readonly readingTimeMinutes: number | null
    readonly listeningTimeRaw: string | null
    readonly readingProgress: number | null
    readonly progressValid: boolean
    readonly publishedAt: TemporalValue | null
    readonly createdAt: TemporalValue | null
    readonly savedAt: TemporalValue | null
    readonly firstOpenedAt: TemporalValue | null
    readonly lastOpenedAt: TemporalValue | null
    readonly lastMovedAt: TemporalValue | null
    readonly updatedAt: TemporalValue | null
    readonly tags: readonly {
      key: string
      name: string
      type: string | null
      created: string | null
    }[]
  }
  readonly archive: null | {
    readonly mediaType: MediaType
    readonly title: string | null
    readonly primaryCreatorName: string | null
    readonly description: string | null
    readonly canonicalUrl: string | null
    readonly imageUrl: string | null
    readonly publishedAt: TemporalValue | null
    readonly consumedAt: TemporalValue | null
    readonly sourceOccurrenceKey: string
  }
}

const readerMediaTypes: Readonly<Record<string, MediaType>> = {
  article: 'article',
  email: 'article',
  newsletter: 'article',
  pdf: 'article',
  rss: 'article',
  video: 'video',
  podcast: 'podcast_episode',
}

const articleSubtypes = {
  article: 'article',
  email: 'newsletter',
  newsletter: 'newsletter',
  pdf: 'pdf',
  rss: 'rss',
} as const

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed.length === 0 ? null : trimmed
}

export function normalizeReaderHttpUrl(value: string | null | undefined): string | null {
  const candidate = nonEmpty(value)
  if (candidate === null) return null
  try {
    const parsed = new URL(candidate)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null
  } catch {
    return null
  }
}

function rawDuration(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  return String(value)
}

export function parseReaderMinutes(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null
  const normalizedValue = value.trim().toLowerCase()
  const hours = normalizedValue.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/)
  const minutes = normalizedValue.match(/(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)\b/)
  if (hours !== null || minutes !== null) {
    const parsedHours = hours === null ? 0 : Number(hours[1])
    const parsedMinutes = minutes === null ? 0 : Number(minutes[1])
    const total = parsedHours * 60 + parsedMinutes
    return Number.isFinite(total) && total >= 0 ? total : null
  }
  const match = normalizedValue.match(/^\d+(?:\.\d+)?$/)
  if (match === null) return null
  const parsed = Number(match[0])
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

export function isReaderArticleCategory(
  category: string,
): category is keyof typeof articleSubtypes {
  return category.toLowerCase() in articleSubtypes
}

export function readerTemporal(
  value: string | null | undefined,
  basis: TemporalBasis = 'source_asserted',
): TemporalValue | null {
  const candidate = nonEmpty(value)
  if (candidate === null) return null
  try {
    if (/^\d{4}$/.test(candidate)) return temporalYear(candidate, basis)
    if (/^\d{4}-\d{2}$/.test(candidate)) return temporalMonth(candidate, basis)
    if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return temporalDay(candidate, basis)
    return temporalInstant(candidate, basis)
  } catch {
    return null
  }
}

export function parseReaderPage(rawBody: string): ReaderPage {
  return ReaderPageSchema.parse(JSON.parse(rawBody))
}

export function normalizeReaderDocument(document: ReaderDocument): NormalizedReaderDocument {
  const category = document.category.toLowerCase()
  const mediaType = readerMediaTypes[category] ?? null
  const location = nonEmpty(document.location)?.toLowerCase() ?? 'unknown'
  const belongsInArchive = location === 'archive' && mediaType !== null
  const subtype = articleSubtypes[category as keyof typeof articleSubtypes] ?? null
  const progress = document.reading_progress ?? null
  const progressValid =
    progress !== null && Number.isFinite(progress) && progress >= 0 && progress <= 1
  const tags = Object.entries(document.tags ?? {})
    .map(([key, tag]) => ({
      key,
      name: nonEmpty(tag.name) ?? key,
      type: nonEmpty(tag.type),
      created: tag.created === null || tag.created === undefined ? null : String(tag.created),
    }))
    .sort((left, right) => left.key.localeCompare(right.key))

  return {
    documentId: document.id,
    sourceRecordKey: `reader-document:${document.id}`,
    sourceRecordedAt: readerTemporal(document.updated_at),
    article:
      subtype === null
        ? null
        : {
            subtype,
            readerUrl: normalizeReaderHttpUrl(document.url),
            sourceUrl: normalizeReaderHttpUrl(document.source_url),
            category: document.category,
            location,
            title: nonEmpty(document.title),
            author: nonEmpty(document.author),
            publication: nonEmpty(document.site_name),
            acquisitionSource: nonEmpty(document.source),
            summary: nonEmpty(document.summary),
            imageUrl: normalizeReaderHttpUrl(document.image_url),
            note: nonEmpty(document.notes),
            wordCount: document.word_count ?? null,
            readingTimeRaw: rawDuration(document.reading_time),
            readingTimeMinutes: parseReaderMinutes(document.reading_time),
            listeningTimeRaw: rawDuration(document.listening_time),
            readingProgress: progressValid ? progress : null,
            progressValid,
            publishedAt: readerTemporal(document.published_date),
            createdAt: readerTemporal(document.created_at),
            savedAt: readerTemporal(document.saved_at),
            firstOpenedAt: readerTemporal(document.first_opened_at),
            lastOpenedAt: readerTemporal(document.last_opened_at),
            lastMovedAt: readerTemporal(document.last_moved_at),
            updatedAt: readerTemporal(document.updated_at),
            tags,
          },
    archive: belongsInArchive
      ? {
          mediaType,
          title: nonEmpty(document.title),
          primaryCreatorName: nonEmpty(document.author),
          description: nonEmpty(document.summary),
          canonicalUrl:
            normalizeReaderHttpUrl(document.source_url) ?? normalizeReaderHttpUrl(document.url),
          imageUrl: normalizeReaderHttpUrl(document.image_url),
          publishedAt: readerTemporal(document.published_date),
          consumedAt: readerTemporal(document.last_moved_at, 'inferred'),
          sourceOccurrenceKey: `reader-document:${document.id}`,
        }
      : null,
  }
}
