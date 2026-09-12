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

export const ReaderDocumentSchema = z
  .object({
    id: z.string().min(1),
    url: optionalString,
    source_url: optionalString,
    title: optionalString,
    author: optionalString,
    summary: optionalString,
    image_url: optionalString,
    category: z.string(),
    location: z.string(),
    published_date: optionalString,
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

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed.length === 0 ? null : trimmed
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
  const mediaType = readerMediaTypes[document.category.toLowerCase()] ?? null
  const belongsInArchive = document.location.toLowerCase() === 'archive' && mediaType !== null

  return {
    documentId: document.id,
    sourceRecordKey: `reader-document:${document.id}`,
    sourceRecordedAt: readerTemporal(document.updated_at),
    archive: belongsInArchive
      ? {
          mediaType,
          title: nonEmpty(document.title),
          primaryCreatorName: nonEmpty(document.author),
          description: nonEmpty(document.summary),
          canonicalUrl: nonEmpty(document.source_url) ?? nonEmpty(document.url),
          imageUrl: nonEmpty(document.image_url),
          publishedAt: readerTemporal(document.published_date),
          consumedAt: readerTemporal(document.last_moved_at, 'inferred'),
          sourceOccurrenceKey: `reader-document:${document.id}`,
        }
      : null,
  }
}
