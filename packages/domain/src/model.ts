import type {
  ArchiveEntryEvidenceId,
  ArchiveEntryId,
  ConnectionId,
  ExternalIdentityId,
  MediaItemId,
  RawObjectId,
  SourceRecordId,
  SyncCursorId,
  SyncRunId,
} from './ids'
import type { TemporalValue, UtcInstant } from './temporal'

export const MEDIA_SOURCES = ['readwise', 'hardcover', 'letterboxd', 'spotify', 'youtube'] as const

export type MediaSource = (typeof MEDIA_SOURCES)[number]

export const MEDIA_TYPES = ['article', 'video', 'podcast_episode', 'movie', 'book', 'song'] as const

export type MediaType = (typeof MEDIA_TYPES)[number]

export const IDENTITY_NAMESPACES = [...MEDIA_SOURCES, 'tmdb', 'isbn', 'asin'] as const

export type IdentityNamespace = (typeof IDENTITY_NAMESPACES)[number]

export type JsonPrimitive = boolean | number | string | null
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue }
export type JsonObject = { readonly [key: string]: JsonValue }

export interface SourceDefinition {
  readonly source: MediaSource
  readonly displayName: string
}

export type ConnectionStatus =
  'connected' | 'disconnected' | 'degraded' | 'reauthorization_required'

export type CoverageLevel = 'complete' | 'partial' | 'best_effort'

export interface SourceConnection {
  readonly id: ConnectionId
  readonly source: MediaSource
  readonly label: string
  readonly status: ConnectionStatus
  readonly coverage: CoverageLevel
  readonly createdAt: UtcInstant
  readonly updatedAt: UtcInstant
}

export type SyncRunKind = 'backfill' | 'reconcile' | 'import' | 'webhook' | 'replay'
export type SyncRunStatus = 'pending' | 'running' | 'succeeded' | 'partially_succeeded' | 'failed'

export interface SyncRunCounts {
  readonly rawObjects: number
  readonly sourceRecords: number
  readonly normalizedRecords: number
  readonly failedRecords: number
}

export interface SyncRun {
  readonly id: SyncRunId
  readonly connectionId: ConnectionId
  readonly kind: SyncRunKind
  readonly status: SyncRunStatus
  readonly startedAt: UtcInstant
  readonly finishedAt: UtcInstant | null
  readonly counts: SyncRunCounts
  readonly errorCode: string | null
  readonly errorMessage: string | null
}

export interface SyncCursor {
  readonly id: SyncCursorId
  readonly connectionId: ConnectionId
  readonly name: string
  readonly checkpoint: JsonObject
  readonly committedAt: UtcInstant
  readonly syncRunId: SyncRunId
}

export type RawObjectKind = 'api_page' | 'webhook' | 'rss' | 'export' | 'source_document'
export type RawObjectProcessingStatus = 'pending' | 'processing' | 'processed' | 'failed'

export interface RawObject {
  readonly id: RawObjectId
  readonly connectionId: ConnectionId
  readonly syncRunId: SyncRunId
  readonly kind: RawObjectKind
  readonly acquisitionKey: string
  readonly storageKey: string
  readonly sha256: string
  readonly contentType: string
  readonly byteLength: number
  readonly acquiredAt: UtcInstant
  readonly processingStatus: RawObjectProcessingStatus
  readonly lastParserVersion: string | null
  readonly processingError: string | null
}

export type SourceRecordDisposition = 'normalized' | 'ignored' | 'unresolved' | 'invalid'
export type UpstreamRecordState = 'active' | 'removed' | 'unknown'

export interface SourceRecord {
  readonly id: SourceRecordId
  readonly rawObjectId: RawObjectId
  readonly connectionId: ConnectionId
  readonly recordType: string
  readonly recordPath: string
  readonly sourceRecordKey: string | null
  readonly sourceRecordedAt: TemporalValue | null
  readonly observedAt: UtcInstant
  readonly parserVersion: string
  readonly contentSha256: string | null
  readonly disposition: SourceRecordDisposition
  readonly upstreamState: UpstreamRecordState
  readonly errorCode: string | null
}

export interface MediaItem {
  readonly id: MediaItemId
  readonly type: MediaType
  readonly title: string | null
  readonly subtitle: string | null
  readonly primaryCreatorName: string | null
  readonly description: string | null
  readonly canonicalUrl: string | null
  readonly imageUrl: string | null
  readonly publishedAt: TemporalValue | null
  readonly durationMs: number | null
  readonly createdAt: UtcInstant
  readonly updatedAt: UtcInstant
}

export type IdentityScope =
  Readonly<{ kind: 'global' }> | Readonly<{ connectionId: ConnectionId; kind: 'connection' }>

export interface ExternalIdentity {
  readonly id: ExternalIdentityId
  readonly mediaItemId: MediaItemId
  readonly namespace: IdentityNamespace
  readonly externalType: string
  readonly externalId: string
  readonly scope: IdentityScope
  readonly canonicalUrl: string | null
  readonly firstObservedSourceRecordId: SourceRecordId
  readonly lastObservedSourceRecordId: SourceRecordId
  readonly retiredAt: UtcInstant | null
}

export const ARCHIVE_ADMISSION_REASONS = [
  'readwise_archive_state',
  'hardcover_read_status',
  'hardcover_finished_read',
  'letterboxd_watched_state',
  'letterboxd_diary_entry',
  'spotify_positive_playback',
  'spotify_positive_resume_position',
  'spotify_fully_played',
  'youtube_watched_activity',
] as const

export type ArchiveAdmissionReason = (typeof ARCHIVE_ADMISSION_REASONS)[number]

export interface SourceRating {
  readonly value: number
  readonly scaleMinimum: number
  readonly scaleMaximum: number
}

export function sourceRating(
  value: number,
  scaleMinimum: number,
  scaleMaximum: number,
): SourceRating {
  if (![value, scaleMinimum, scaleMaximum].every(Number.isFinite)) {
    throw new TypeError('Rating values must be finite numbers')
  }
  if (scaleMinimum >= scaleMaximum) {
    throw new RangeError('Rating scale minimum must be less than its maximum')
  }
  if (value < scaleMinimum || value > scaleMaximum) {
    throw new RangeError('Rating value must be within its source scale')
  }

  return { value, scaleMinimum, scaleMaximum }
}

export interface ArchiveEntry {
  readonly id: ArchiveEntryId
  readonly mediaItemId: MediaItemId
  readonly connectionId: ConnectionId
  readonly consumedIdentityId: ExternalIdentityId | null
  readonly sourceOccurrenceKey: string
  readonly admissionReason: ArchiveAdmissionReason
  readonly consumedAt: TemporalValue | null
  readonly sourceRecordedAt: TemporalValue | null
  readonly sourceRating: SourceRating | null
  readonly reviewText: string | null
  readonly upstreamState: UpstreamRecordState
  readonly createdAt: UtcInstant
  readonly updatedAt: UtcInstant
}

export const ARCHIVE_EVIDENCE_ROLES = [
  'admission',
  'occurrence_time',
  'metadata',
  'rating',
  'review',
  'removal',
] as const

export type ArchiveEvidenceRole = (typeof ARCHIVE_EVIDENCE_ROLES)[number]

export interface ArchiveEntryEvidence {
  readonly id: ArchiveEntryEvidenceId
  readonly archiveEntryId: ArchiveEntryId
  readonly sourceRecordId: SourceRecordId
  readonly role: ArchiveEvidenceRole
  readonly linkedAt: UtcInstant
}
