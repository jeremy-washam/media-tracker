import type {
  ArchiveEntry,
  ArchiveEntryEvidence,
  ExternalIdentity,
  MediaItem,
  RawObject,
  SourceConnection,
  SourceRecord,
  SyncCursor,
  SyncRun,
  TemporalValue,
} from '@media-tracker/domain'
import {
  archiveEntryId,
  connectionId,
  externalIdentityId,
  mediaItemId,
  rawObjectId,
  sourceRecordId,
  syncCursorId,
  syncRunId,
  utcInstant,
  type ArchiveEntryId,
  type CalendarDate,
  type ConnectionId,
  type ExternalIdentityId,
  type IdentityNamespace,
  type MediaSource,
  type MediaItemId,
  type RawObjectId,
  type SourceRecordId,
  type UtcInstant,
} from '@media-tracker/domain'

import type { DatabaseClient, DatabaseStatement, DatabaseValue } from './database'

export interface ArchiveEntryWrite {
  readonly entry: ArchiveEntry
  readonly evidence: readonly ArchiveEntryEvidence[]
  readonly replaceRating?: boolean
  readonly replaceReview?: boolean
  readonly latestConsumedAt?: boolean
}

export interface CanonicalWriteBatch {
  readonly syncRun?: SyncRun
  readonly rawObjects?: readonly RawObject[]
  readonly sourceRecords?: readonly SourceRecord[]
  readonly mediaItems?: readonly MediaItem[]
  readonly externalIdentities?: readonly ExternalIdentity[]
  readonly archiveEntries?: readonly ArchiveEntryWrite[]
  /** Written last, in the same atomic batch as every covered D1 write. */
  readonly cursor?: SyncCursor
  readonly retireOccurrences?: readonly { id: ArchiveEntry['id']; evidence: ArchiveEntryEvidence }[]
}

export interface ExternalIdentityLookup {
  readonly namespace: IdentityNamespace
  readonly externalType: string
  readonly externalId: string
  readonly connectionId: ConnectionId | null
}

export interface ExternalIdentityReference {
  readonly id: ExternalIdentityId
  readonly mediaItemId: MediaItemId
}

export interface MediaSummaryRecord {
  readonly id: MediaItemId
  readonly type: MediaItem['type']
  readonly title: string | null
}

export interface ArchiveOccurrenceReference {
  readonly id: ArchiveEntryId
  readonly sourceOccurrenceKey: string
  readonly consumedIdentityId: ExternalIdentityId | null
}

export interface CanonicalLedgerRepository {
  connectionActivity(
    connectionId: ConnectionId,
  ): Promise<{ lastAttemptedSyncAt: string | null; lastExportAt: string | null }>
  findRawObject(connectionId: ConnectionId, acquisitionKey: string): Promise<RawObject | null>
  findArchiveOccurrence(
    connectionId: ConnectionId,
    key: string,
  ): Promise<ArchiveOccurrenceReference | null>
  findOccurrencesAt(
    connectionId: ConnectionId,
    itemId: MediaItemId,
    instant: string,
  ): Promise<readonly ArchiveOccurrenceReference[]>
  listConnections(): Promise<readonly SourceConnection[]>
  listMediaPage(input: {
    limit: number
    type?: MediaItem['type']
    cursor?: string
  }): Promise<MediaPage>
  listSyncRuns(
    limit: number,
    cursor?: string,
  ): Promise<{ data: readonly SyncRunRecord[]; nextCursor: string | null }>
  listIncompleteImports(connectionId: ConnectionId): Promise<readonly IncompleteImport[]>
  saveConnection(connection: SourceConnection): Promise<void>
  saveSyncRun(syncRun: SyncRun): Promise<void>
  findConnectionBySource(source: MediaSource): Promise<SourceConnection | null>
  findLastSuccessfulSyncAt(connectionId: ConnectionId): Promise<UtcInstant | null>
  findRawObjectId(connectionId: ConnectionId, acquisitionKey: string): Promise<RawObjectId | null>
  listSourceRecordIds(
    rawId: RawObjectId,
    parserVersion: string,
  ): Promise<ReadonlyMap<string, SourceRecordId>>
  findSourceRecordId(
    rawObjectId: RawObjectId,
    parserVersion: string,
    recordPath: string,
  ): Promise<SourceRecordId | null>
  findExternalIdentity(lookup: ExternalIdentityLookup): Promise<ExternalIdentityReference | null>
  findArchiveEntryId(
    connectionId: ConnectionId,
    sourceOccurrenceKey: string,
  ): Promise<ArchiveEntryId | null>
  findArchiveEntriesByMediaAndConsumedDay(
    connectionId: ConnectionId,
    mediaItemId: MediaItemId,
    consumedOn: CalendarDate,
  ): Promise<readonly ArchiveOccurrenceReference[]>
  findArchiveEntriesByConsumedIdentity(
    connectionId: ConnectionId,
    identityId: ExternalIdentityId,
  ): Promise<readonly ArchiveOccurrenceReference[]>
  findMediaByExactTitleAndYear(
    type: MediaItem['type'],
    title: string,
    year: string,
  ): Promise<readonly MediaItemId[]>
  findSyncCursor(connectionId: ConnectionId, name: string): Promise<SyncCursor | null>
  listMedia(limit?: number): Promise<readonly MediaSummaryRecord[]>
  findMedia(id: MediaItemId): Promise<MediaSummaryRecord | null>
  commit(batch: CanonicalWriteBatch): Promise<void>
}

export interface MediaPage {
  data: readonly MediaSummaryRecord[]
  nextCursor: string | null
  totalCount: number
  filteredCount: number
  counts: Partial<Record<MediaItem['type'], number>>
}
export interface SyncRunRecord {
  id: string
  connectionId: string
  connectionLabel: string
  source: MediaSource
  kind: SyncRun['kind']
  status: SyncRun['status']
  startedAt: string
  finishedAt: string | null
  sourceRecords: number
  normalizedRecords: number
  failedRecords: number
  errorCode: string | null
  errorMessage: string | null
  catalogProgress?: {
    state: 'running' | 'waiting' | 'awaiting_worker' | 'succeeded' | 'failed'
    requestedCount: number
    returnedCount: number
    unavailableCount: number
    lastActivityAt: string
    nextAttemptAt: string | null
  }
}
export interface IncompleteImport {
  importId: string
  status: RawObject['processingStatus']
  nextOffset: number
  totalRecords: number | null
}
function occurrenceReference(row: {
  id: string
  source_occurrence_key: string
  consumed_identity_id: string | null
}): ArchiveOccurrenceReference {
  return {
    id: archiveEntryId(row.id),
    sourceOccurrenceKey: row.source_occurrence_key,
    consumedIdentityId:
      row.consumed_identity_id === null ? null : externalIdentityId(row.consumed_identity_id),
  }
}
function decodeCursor(cursor: string | undefined): { value: string; id: string } | null {
  if (cursor === undefined) return null
  try {
    const parsed = JSON.parse(decodeURIComponent(cursor)) as { value?: unknown; id?: unknown }
    if (typeof parsed.value !== 'string' || typeof parsed.id !== 'string') throw new Error()
    return { value: parsed.value, id: parsed.id }
  } catch {
    throw new TypeError('Invalid pagination cursor')
  }
}

type TemporalColumns = readonly [DatabaseValue, DatabaseValue, DatabaseValue]

function temporalColumns(value: TemporalValue | null): TemporalColumns {
  return value === null ? [null, null, null] : [value.value, value.precision, value.basis]
}

function statement(
  database: DatabaseClient,
  query: string,
  values: readonly DatabaseValue[],
): DatabaseStatement {
  return database.prepare(query).bind(...values)
}

function connectionStatement(
  database: DatabaseClient,
  connection: SourceConnection,
): DatabaseStatement {
  return statement(
    database,
    `INSERT INTO connections (
      id, source, label, status, coverage, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      label = excluded.label,
      status = excluded.status,
      coverage = excluded.coverage,
      updated_at = excluded.updated_at`,
    [
      connection.id,
      connection.source,
      connection.label,
      connection.status,
      connection.coverage,
      connection.createdAt,
      connection.updatedAt,
    ],
  )
}

function syncRunStatement(database: DatabaseClient, syncRun: SyncRun): DatabaseStatement {
  return statement(
    database,
    `INSERT INTO sync_runs (
      id, connection_id, kind, status, started_at, finished_at,
      raw_object_count, source_record_count, normalized_record_count,
      failed_record_count, error_code, error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      finished_at = excluded.finished_at,
      raw_object_count = excluded.raw_object_count,
      source_record_count = excluded.source_record_count,
      normalized_record_count = excluded.normalized_record_count,
      failed_record_count = excluded.failed_record_count,
      error_code = excluded.error_code,
      error_message = excluded.error_message`,
    [
      syncRun.id,
      syncRun.connectionId,
      syncRun.kind,
      syncRun.status,
      syncRun.startedAt,
      syncRun.finishedAt,
      syncRun.counts.rawObjects,
      syncRun.counts.sourceRecords,
      syncRun.counts.normalizedRecords,
      syncRun.counts.failedRecords,
      syncRun.errorCode,
      syncRun.errorMessage,
    ],
  )
}

function rawObjectStatement(database: DatabaseClient, rawObject: RawObject): DatabaseStatement {
  return statement(
    database,
    `INSERT INTO raw_objects (
      id, connection_id, sync_run_id, kind, acquisition_key, storage_key,
      sha256, content_type, byte_length, acquired_at, processing_status,
      last_parser_version, processing_error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      processing_status = excluded.processing_status,
      last_parser_version = excluded.last_parser_version,
      processing_error = excluded.processing_error`,
    [
      rawObject.id,
      rawObject.connectionId,
      rawObject.syncRunId,
      rawObject.kind,
      rawObject.acquisitionKey,
      rawObject.storageKey,
      rawObject.sha256,
      rawObject.contentType,
      rawObject.byteLength,
      rawObject.acquiredAt,
      rawObject.processingStatus,
      rawObject.lastParserVersion,
      rawObject.processingError,
    ],
  )
}

function sourceRecordStatement(database: DatabaseClient, record: SourceRecord): DatabaseStatement {
  const sourceRecordedAt = temporalColumns(record.sourceRecordedAt)
  return statement(
    database,
    `INSERT INTO source_records (
      id, raw_object_id, connection_id, record_type, record_path,
      source_record_key, source_recorded_at_value, source_recorded_at_precision,
      source_recorded_at_basis, observed_at, parser_version, content_sha256,
      disposition, upstream_state, error_code
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(raw_object_id, parser_version, record_path) DO NOTHING`,
    [
      record.id,
      record.rawObjectId,
      record.connectionId,
      record.recordType,
      record.recordPath,
      record.sourceRecordKey,
      ...sourceRecordedAt,
      record.observedAt,
      record.parserVersion,
      record.contentSha256,
      record.disposition,
      record.upstreamState,
      record.errorCode,
    ],
  )
}

function mediaItemStatement(database: DatabaseClient, item: MediaItem): DatabaseStatement {
  const publishedAt = temporalColumns(item.publishedAt)
  return statement(
    database,
    `INSERT INTO media_items (
      id, type, title, subtitle, primary_creator_name, description, canonical_url,
      image_url, published_at_value, published_at_precision, published_at_basis,
      duration_ms, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      title = COALESCE(excluded.title, media_items.title),
      subtitle = COALESCE(excluded.subtitle, media_items.subtitle),
      primary_creator_name = COALESCE(excluded.primary_creator_name, media_items.primary_creator_name),
      description = COALESCE(excluded.description, media_items.description),
      canonical_url = COALESCE(excluded.canonical_url, media_items.canonical_url),
      image_url = COALESCE(excluded.image_url, media_items.image_url),
      published_at_value = COALESCE(excluded.published_at_value, media_items.published_at_value),
      published_at_precision = COALESCE(excluded.published_at_precision, media_items.published_at_precision),
      published_at_basis = COALESCE(excluded.published_at_basis, media_items.published_at_basis),
      duration_ms = COALESCE(excluded.duration_ms, media_items.duration_ms),
      updated_at = excluded.updated_at`,
    [
      item.id,
      item.type,
      item.title,
      item.subtitle,
      item.primaryCreatorName,
      item.description,
      item.canonicalUrl,
      item.imageUrl,
      ...publishedAt,
      item.durationMs,
      item.createdAt,
      item.updatedAt,
    ],
  )
}

function externalIdentityStatement(
  database: DatabaseClient,
  identity: ExternalIdentity,
): DatabaseStatement {
  const connectionId = identity.scope.kind === 'connection' ? identity.scope.connectionId : null
  return statement(
    database,
    `INSERT INTO external_identities (
      id, media_item_id, namespace, external_type, external_id, scope,
      connection_id, canonical_url, first_observed_source_record_id,
      last_observed_source_record_id, retired_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      media_item_id = excluded.media_item_id,
      canonical_url = COALESCE(excluded.canonical_url, external_identities.canonical_url),
      last_observed_source_record_id = excluded.last_observed_source_record_id,
      retired_at = excluded.retired_at`,
    [
      identity.id,
      identity.mediaItemId,
      identity.namespace,
      identity.externalType,
      identity.externalId,
      identity.scope.kind,
      connectionId,
      identity.canonicalUrl,
      identity.firstObservedSourceRecordId,
      identity.lastObservedSourceRecordId,
      identity.retiredAt,
    ],
  )
}

function archiveEntryStatement(
  database: DatabaseClient,
  write: ArchiveEntryWrite,
): DatabaseStatement {
  const { entry } = write
  const consumedAt = temporalColumns(entry.consumedAt)
  const sourceRecordedAt = temporalColumns(entry.sourceRecordedAt)
  const rating = entry.sourceRating
  return statement(
    database,
    `INSERT INTO archive_entries (
      id, media_item_id, connection_id, consumed_identity_id,
      source_occurrence_key, admission_reason, consumed_at_value,
      consumed_at_precision, consumed_at_basis, source_recorded_at_value,
      source_recorded_at_precision, source_recorded_at_basis, rating_value,
      rating_scale_minimum, rating_scale_maximum, review_text, upstream_state,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(connection_id, source_occurrence_key) DO UPDATE SET
      media_item_id = excluded.media_item_id,
      consumed_identity_id = excluded.consumed_identity_id,
      admission_reason = excluded.admission_reason,
      consumed_at_value = ${write.latestConsumedAt ? 'MAX(COALESCE(excluded.consumed_at_value, archive_entries.consumed_at_value), COALESCE(archive_entries.consumed_at_value, excluded.consumed_at_value))' : 'COALESCE(excluded.consumed_at_value, archive_entries.consumed_at_value)'},
      consumed_at_precision = COALESCE(excluded.consumed_at_precision, archive_entries.consumed_at_precision),
      consumed_at_basis = COALESCE(excluded.consumed_at_basis, archive_entries.consumed_at_basis),
      source_recorded_at_value = COALESCE(excluded.source_recorded_at_value, archive_entries.source_recorded_at_value),
      source_recorded_at_precision = COALESCE(excluded.source_recorded_at_precision, archive_entries.source_recorded_at_precision),
      source_recorded_at_basis = COALESCE(excluded.source_recorded_at_basis, archive_entries.source_recorded_at_basis),
      rating_value = ${write.replaceRating ? 'excluded.rating_value' : 'COALESCE(excluded.rating_value, archive_entries.rating_value)'},
      rating_scale_minimum = ${write.replaceRating ? 'excluded.rating_scale_minimum' : 'COALESCE(excluded.rating_scale_minimum, archive_entries.rating_scale_minimum)'},
      rating_scale_maximum = ${write.replaceRating ? 'excluded.rating_scale_maximum' : 'COALESCE(excluded.rating_scale_maximum, archive_entries.rating_scale_maximum)'},
      review_text = ${write.replaceReview ? 'excluded.review_text' : 'COALESCE(excluded.review_text, archive_entries.review_text)'},
      upstream_state = excluded.upstream_state,
      updated_at = excluded.updated_at`,
    [
      entry.id,
      entry.mediaItemId,
      entry.connectionId,
      entry.consumedIdentityId,
      entry.sourceOccurrenceKey,
      entry.admissionReason,
      ...consumedAt,
      ...sourceRecordedAt,
      rating?.value ?? null,
      rating?.scaleMinimum ?? null,
      rating?.scaleMaximum ?? null,
      entry.reviewText,
      entry.upstreamState,
      entry.createdAt,
      entry.updatedAt,
    ],
  )
}

function evidenceStatement(
  database: DatabaseClient,
  evidence: ArchiveEntryEvidence,
): DatabaseStatement {
  return statement(
    database,
    `INSERT INTO archive_entry_evidence (
      id, archive_entry_id, source_record_id, role, linked_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(archive_entry_id, source_record_id, role) DO NOTHING`,
    [
      evidence.id,
      evidence.archiveEntryId,
      evidence.sourceRecordId,
      evidence.role,
      evidence.linkedAt,
    ],
  )
}

function cursorStatement(database: DatabaseClient, cursor: SyncCursor): DatabaseStatement {
  return statement(
    database,
    `INSERT INTO sync_cursors (
      id, connection_id, name, checkpoint_json, committed_at, sync_run_id
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(connection_id, name) DO UPDATE SET
      checkpoint_json = excluded.checkpoint_json,
      committed_at = excluded.committed_at,
      sync_run_id = excluded.sync_run_id`,
    [
      cursor.id,
      cursor.connectionId,
      cursor.name,
      JSON.stringify(cursor.checkpoint),
      cursor.committedAt,
      cursor.syncRunId,
    ],
  )
}

function requireAdmissionEvidence(writes: readonly ArchiveEntryWrite[]): void {
  for (const { entry, evidence } of writes) {
    if (!evidence.some((link) => link.archiveEntryId === entry.id && link.role === 'admission')) {
      throw new TypeError(`Archive entry ${entry.id} requires admission evidence`)
    }
    if (evidence.some((link) => link.archiveEntryId !== entry.id)) {
      throw new TypeError(`Archive entry ${entry.id} contains evidence for another entry`)
    }
  }
}

export class SqlCanonicalLedgerRepository implements CanonicalLedgerRepository {
  readonly #database: DatabaseClient

  constructor(database: DatabaseClient) {
    this.#database = database
  }

  async connectionActivity(
    connection: ConnectionId,
  ): Promise<{ lastAttemptedSyncAt: string | null; lastExportAt: string | null }> {
    const row = await statement(
      this.#database,
      `SELECT
      (SELECT MAX(started_at) FROM sync_runs WHERE connection_id=?) lastAttemptedSyncAt,
      (SELECT MAX(acquired_at) FROM raw_objects WHERE connection_id=? AND kind='export' AND processing_status='processed') lastExportAt`,
      [connection, connection],
    ).first<{ lastAttemptedSyncAt: string | null; lastExportAt: string | null }>()
    return row ?? { lastAttemptedSyncAt: null, lastExportAt: null }
  }
  async findRawObject(connection: ConnectionId, acquisitionKey: string): Promise<RawObject | null> {
    const row = await statement(
      this.#database,
      'SELECT * FROM raw_objects WHERE connection_id = ? AND acquisition_key = ?',
      [connection, acquisitionKey],
    ).first<{
      id: string
      sync_run_id: string
      kind: RawObject['kind']
      storage_key: string
      sha256: string
      content_type: string
      byte_length: number
      acquired_at: string
      processing_status: RawObject['processingStatus']
      last_parser_version: string | null
      processing_error: string | null
    }>()
    return row === null
      ? null
      : {
          id: rawObjectId(row.id),
          connectionId: connection,
          syncRunId: syncRunId(row.sync_run_id),
          kind: row.kind,
          acquisitionKey,
          storageKey: row.storage_key,
          sha256: row.sha256,
          contentType: row.content_type,
          byteLength: row.byte_length,
          acquiredAt: utcInstant(row.acquired_at),
          processingStatus: row.processing_status,
          lastParserVersion: row.last_parser_version,
          processingError: row.processing_error,
        }
  }
  async findArchiveOccurrence(
    connection: ConnectionId,
    key: string,
  ): Promise<ArchiveOccurrenceReference | null> {
    const row = await statement(
      this.#database,
      'SELECT id, source_occurrence_key, consumed_identity_id, upstream_state FROM archive_entries WHERE connection_id = ? AND source_occurrence_key = ?',
      [connection, key],
    ).first<{
      id: string
      source_occurrence_key: string
      consumed_identity_id: string | null
      upstream_state: string
    }>()
    if (row === null) return null
    if (row.upstream_state !== 'removed') return occurrenceReference(row)
    // A reconciled RSS occurrence keeps its original key and evidence, while its
    // evidence is also attached to the surviving active Diary occurrence. Replay
    // must update that survivor instead of reviving the retired duplicate.
    const successors = await statement(
      this.#database,
      `SELECT DISTINCT target.id, target.source_occurrence_key, target.consumed_identity_id
       FROM archive_entry_evidence old_evidence
       JOIN archive_entry_evidence new_evidence
         ON new_evidence.source_record_id=old_evidence.source_record_id
        AND new_evidence.role=old_evidence.role
       JOIN archive_entries target ON target.id=new_evidence.archive_entry_id
       WHERE old_evidence.archive_entry_id=? AND target.id<>?
         AND target.connection_id=? AND target.upstream_state='active'
       LIMIT 2`,
      [row.id, row.id, connection],
    ).all<{ id: string; source_occurrence_key: string; consumed_identity_id: string | null }>()
    return successors.results.length === 1
      ? occurrenceReference(successors.results[0]!)
      : occurrenceReference(row)
  }
  async findOccurrencesAt(
    connection: ConnectionId,
    itemId: MediaItemId,
    instant: string,
  ): Promise<readonly ArchiveOccurrenceReference[]> {
    const rows = await statement(
      this.#database,
      "SELECT id, source_occurrence_key, consumed_identity_id FROM archive_entries WHERE connection_id = ? AND media_item_id = ? AND consumed_at_value = ? AND consumed_at_precision = 'instant' AND upstream_state = 'active' ORDER BY created_at, id",
      [connection, itemId, instant],
    ).all<{ id: string; source_occurrence_key: string; consumed_identity_id: string | null }>()
    return rows.results.map(occurrenceReference)
  }
  async listConnections(): Promise<readonly SourceConnection[]> {
    const rows = await this.#database
      .prepare('SELECT * FROM connections ORDER BY created_at, id')
      .all<{
        id: string
        source: MediaSource
        label: string
        status: SourceConnection['status']
        coverage: SourceConnection['coverage']
        created_at: string
        updated_at: string
      }>()
    return rows.results.map((r) => ({
      id: connectionId(r.id),
      source: r.source,
      label: r.label,
      status: r.status,
      coverage: r.coverage,
      createdAt: utcInstant(r.created_at),
      updatedAt: utcInstant(r.updated_at),
    }))
  }
  async listIncompleteImports(connection: ConnectionId): Promise<readonly IncompleteImport[]> {
    const rows = await statement(
      this.#database,
      `SELECT r.sha256, r.processing_status,
      (SELECT checkpoint_json FROM sync_cursors c WHERE c.connection_id=r.connection_id AND json_extract(c.checkpoint_json, '$.archiveSha256')=r.sha256 AND (r.last_parser_version IS NULL OR c.name LIKE '%:' || r.last_parser_version) ORDER BY committed_at DESC LIMIT 1) checkpoint
      FROM raw_objects r WHERE r.connection_id=? AND r.kind='export' AND r.processing_status != 'processed' ORDER BY r.acquired_at DESC`,
      [connection],
    ).all<{
      sha256: string
      processing_status: RawObject['processingStatus']
      checkpoint: string | null
    }>()
    return rows.results.map((r) => {
      const c =
        r.checkpoint === null
          ? null
          : (JSON.parse(r.checkpoint) as { nextOffset?: number; totalRecords?: number })
      return {
        importId: r.sha256,
        status: r.processing_status,
        nextOffset: c?.nextOffset ?? 0,
        totalRecords: c?.totalRecords ?? null,
      }
    })
  }
  async listMediaPage(input: {
    limit: number
    type?: MediaItem['type']
    cursor?: string
  }): Promise<MediaPage> {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100)
      throw new RangeError('Invalid media limit')
    const cursor = decodeCursor(input.cursor)
    const rows = await statement(
      this.#database,
      `WITH history AS (
      SELECT m.id, m.type, m.title, COALESCE(MAX(a.consumed_at_value),'') sort_value
      FROM media_items m JOIN archive_entries a ON a.media_item_id=m.id WHERE a.upstream_state='active'
      GROUP BY m.id, m.type, m.title)
      SELECT * FROM history WHERE (? IS NULL OR type=?) AND (? IS NULL OR sort_value < ? OR (sort_value = ? AND id < ?))
      ORDER BY sort_value DESC,id DESC LIMIT ?`,
      [
        input.type ?? null,
        input.type ?? null,
        cursor?.value ?? null,
        cursor?.value ?? null,
        cursor?.value ?? null,
        cursor?.id ?? null,
        input.limit + 1,
      ],
    ).all<{ id: string; type: MediaItem['type']; title: string | null; sort_value: string }>()
    const totals = await this.#database
      .prepare(
        `SELECT m.type, COUNT(DISTINCT m.id) count FROM media_items m JOIN archive_entries a ON a.media_item_id=m.id WHERE a.upstream_state='active' GROUP BY m.type`,
      )
      .all<{ type: MediaItem['type']; count: number }>()
    const counts: MediaPage['counts'] = {
      article: 0,
      video: 0,
      podcast_episode: 0,
      movie: 0,
      book: 0,
      song: 0,
      ...Object.fromEntries(totals.results.map((r) => [r.type, r.count])),
    }
    const totalCount = totals.results.reduce((sum, r) => sum + r.count, 0)
    const page = rows.results.slice(0, input.limit)
    const last = page.at(-1)
    return {
      data: page.map((r) => ({ id: mediaItemId(r.id), type: r.type, title: r.title })),
      counts,
      totalCount,
      filteredCount: input.type === undefined ? totalCount : (counts[input.type] ?? 0),
      nextCursor:
        rows.results.length > input.limit && last !== undefined
          ? encodeURIComponent(JSON.stringify({ value: last.sort_value, id: last.id }))
          : null,
    }
  }
  async listSyncRuns(
    limit: number,
    encodedCursor?: string,
  ): Promise<{ data: readonly SyncRunRecord[]; nextCursor: string | null }> {
    const cursor = decodeCursor(encodedCursor)
    const at = new Date().toISOString()
    const rows = await statement(
      this.#database,
      `SELECT s.id,s.connection_id connectionId,c.label connectionLabel,c.source,s.kind,s.status,
        s.started_at startedAt,s.finished_at finishedAt,
        COALESCE(j.returned_count,s.source_record_count) sourceRecords,
        COALESCE(j.returned_count,s.normalized_record_count) normalizedRecords,
        s.failed_record_count failedRecords,s.error_code errorCode,s.error_message errorMessage,
        CASE WHEN j.id IS NULL THEN NULL
          WHEN j.state IN ('succeeded','failed') THEN j.state
          WHEN j.lease_expires_at>? THEN 'running'
          WHEN j.next_attempt_at>? THEN 'waiting'
          ELSE 'awaiting_worker' END catalogState,
        j.requested_count requestedCount,j.returned_count returnedCount,
        j.unavailable_count unavailableCount,j.updated_at lastActivityAt,j.next_attempt_at nextAttemptAt
       FROM sync_runs s JOIN connections c ON c.id=s.connection_id
       LEFT JOIN spotify_catalog_backfill_jobs j ON j.sync_run_id=s.id
       WHERE (? IS NULL OR s.started_at < ? OR (s.started_at = ? AND s.id < ?))
       ORDER BY s.started_at DESC,s.id DESC LIMIT ?`,
      [
        at,
        at,
        cursor?.value ?? null,
        cursor?.value ?? null,
        cursor?.value ?? null,
        cursor?.id ?? null,
        limit + 1,
      ],
    ).all<
      SyncRunRecord & {
        catalogState: NonNullable<SyncRunRecord['catalogProgress']>['state'] | null
        requestedCount: number | null
        returnedCount: number | null
        unavailableCount: number | null
        lastActivityAt: string | null
        nextAttemptAt: string | null
      }
    >()
    const data = rows.results.slice(0, limit).map((row) => {
      const {
        catalogState,
        requestedCount,
        returnedCount,
        unavailableCount,
        lastActivityAt,
        nextAttemptAt,
        ...run
      } = row
      return {
        ...run,
        ...(catalogState === null
          ? {}
          : {
              catalogProgress: {
                state: catalogState,
                requestedCount: requestedCount ?? 0,
                returnedCount: returnedCount ?? 0,
                unavailableCount: unavailableCount ?? 0,
                lastActivityAt: lastActivityAt!,
                nextAttemptAt,
              },
            }),
      }
    })
    const last = data.at(-1)
    return {
      data,
      nextCursor:
        rows.results.length > limit && last !== undefined
          ? encodeURIComponent(JSON.stringify({ value: last.startedAt, id: last.id }))
          : null,
    }
  }
  async saveConnection(connection: SourceConnection): Promise<void> {
    await this.#run([connectionStatement(this.#database, connection)])
  }

  async saveSyncRun(syncRun: SyncRun): Promise<void> {
    await this.#run([syncRunStatement(this.#database, syncRun)])
  }

  async findConnectionBySource(source: MediaSource): Promise<SourceConnection | null> {
    const row = await statement(
      this.#database,
      `SELECT id, source, label, status, coverage, created_at, updated_at
       FROM connections WHERE source = ? ORDER BY created_at LIMIT 1`,
      [source],
    ).first<{
      id: string
      source: MediaSource
      label: string
      status: SourceConnection['status']
      coverage: SourceConnection['coverage']
      created_at: string
      updated_at: string
    }>()
    if (row === null) return null
    return {
      id: connectionId(row.id),
      source: row.source,
      label: row.label,
      status: row.status,
      coverage: row.coverage,
      createdAt: utcInstant(row.created_at),
      updatedAt: utcInstant(row.updated_at),
    }
  }

  async findLastSuccessfulSyncAt(connectionId: ConnectionId): Promise<UtcInstant | null> {
    const row = await statement(
      this.#database,
      `SELECT finished_at FROM sync_runs
       WHERE connection_id = ? AND status = 'succeeded' AND finished_at IS NOT NULL
       ORDER BY finished_at DESC LIMIT 1`,
      [connectionId],
    ).first<{ finished_at: string }>()
    return row === null ? null : utcInstant(row.finished_at)
  }

  async findRawObjectId(
    connectionId: ConnectionId,
    acquisitionKey: string,
  ): Promise<RawObjectId | null> {
    const row = await statement(
      this.#database,
      'SELECT id FROM raw_objects WHERE connection_id = ? AND acquisition_key = ?',
      [connectionId, acquisitionKey],
    ).first<{ id: string }>()
    return row === null ? null : rawObjectId(row.id)
  }

  async listSourceRecordIds(
    rawId: RawObjectId,
    parserVersion: string,
  ): Promise<ReadonlyMap<string, SourceRecordId>> {
    const rows = await statement(
      this.#database,
      'SELECT record_path, id FROM source_records WHERE raw_object_id = ? AND parser_version = ?',
      [rawId, parserVersion],
    ).all<{ record_path: string; id: string }>()
    return new Map(rows.results.map((row) => [row.record_path, sourceRecordId(row.id)]))
  }
  async findSourceRecordId(
    rawId: RawObjectId,
    parserVersion: string,
    recordPath: string,
  ): Promise<SourceRecordId | null> {
    const row = await statement(
      this.#database,
      `SELECT id FROM source_records
       WHERE raw_object_id = ? AND parser_version = ? AND record_path = ?`,
      [rawId, parserVersion, recordPath],
    ).first<{ id: string }>()
    return row === null ? null : sourceRecordId(row.id)
  }

  async findExternalIdentity(
    lookup: ExternalIdentityLookup,
  ): Promise<ExternalIdentityReference | null> {
    const scope = lookup.connectionId === null ? 'global' : 'connection'
    const row = await statement(
      this.#database,
      `SELECT id, media_item_id
       FROM external_identities
       WHERE namespace = ? AND external_type = ? AND external_id = ? AND scope = ?
         AND ((? IS NULL AND connection_id IS NULL) OR connection_id = ?)`,
      [
        lookup.namespace,
        lookup.externalType,
        lookup.externalId,
        scope,
        lookup.connectionId,
        lookup.connectionId,
      ],
    ).first<{ id: string; media_item_id: string }>()
    return row === null
      ? null
      : { id: externalIdentityId(row.id), mediaItemId: mediaItemId(row.media_item_id) }
  }

  async findArchiveEntryId(
    connectionId: ConnectionId,
    sourceOccurrenceKey: string,
  ): Promise<ArchiveEntryId | null> {
    const row = await statement(
      this.#database,
      'SELECT id FROM archive_entries WHERE connection_id = ? AND source_occurrence_key = ?',
      [connectionId, sourceOccurrenceKey],
    ).first<{ id: string }>()
    return row === null ? null : archiveEntryId(row.id)
  }

  async findArchiveEntriesByMediaAndConsumedDay(
    connectionId: ConnectionId,
    itemId: MediaItemId,
    consumedOn: CalendarDate,
  ): Promise<readonly ArchiveOccurrenceReference[]> {
    const result = await statement(
      this.#database,
      `SELECT id, source_occurrence_key, consumed_identity_id FROM archive_entries
       WHERE connection_id = ? AND media_item_id = ?
         AND consumed_at_value = ? AND consumed_at_precision = 'day'
       ORDER BY id LIMIT 2`,
      [connectionId, itemId, consumedOn],
    ).all<{ id: string; source_occurrence_key: string; consumed_identity_id: string | null }>()
    return result.results.map((row) => ({
      id: archiveEntryId(row.id),
      sourceOccurrenceKey: row.source_occurrence_key,
      consumedIdentityId:
        row.consumed_identity_id === null ? null : externalIdentityId(row.consumed_identity_id),
    }))
  }

  async findArchiveEntriesByConsumedIdentity(
    connectionId: ConnectionId,
    identityId: ExternalIdentityId,
  ): Promise<readonly ArchiveOccurrenceReference[]> {
    const result = await statement(
      this.#database,
      `SELECT id, source_occurrence_key, consumed_identity_id FROM archive_entries
       WHERE connection_id = ? AND consumed_identity_id = ?
       ORDER BY id LIMIT 2`,
      [connectionId, identityId],
    ).all<{ id: string; source_occurrence_key: string; consumed_identity_id: string | null }>()
    return result.results.map((row) => ({
      id: archiveEntryId(row.id),
      sourceOccurrenceKey: row.source_occurrence_key,
      consumedIdentityId:
        row.consumed_identity_id === null ? null : externalIdentityId(row.consumed_identity_id),
    }))
  }

  async findMediaByExactTitleAndYear(
    type: MediaItem['type'],
    title: string,
    year: string,
  ): Promise<readonly MediaItemId[]> {
    const result = await statement(
      this.#database,
      `SELECT id FROM media_items
       WHERE type = ? AND title = ? AND published_at_value = ?
         AND published_at_precision = 'year'
       ORDER BY id LIMIT 2`,
      [type, title, year],
    ).all<{ id: string }>()
    return result.results.map((row) => mediaItemId(row.id))
  }

  async findSyncCursor(connectionId: ConnectionId, name: string): Promise<SyncCursor | null> {
    const row = await statement(
      this.#database,
      `SELECT id, name, checkpoint_json, committed_at, sync_run_id
       FROM sync_cursors WHERE connection_id = ? AND name = ?`,
      [connectionId, name],
    ).first<{
      id: string
      name: string
      checkpoint_json: string
      committed_at: string
      sync_run_id: string
    }>()
    if (row === null) return null
    return {
      id: syncCursorId(row.id),
      connectionId,
      name: row.name,
      checkpoint: JSON.parse(row.checkpoint_json) as SyncCursor['checkpoint'],
      committedAt: utcInstant(row.committed_at),
      syncRunId: syncRunId(row.sync_run_id),
    }
  }

  async listMedia(limit = 1000): Promise<readonly MediaSummaryRecord[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
      throw new RangeError('Media list limit must be an integer from 1 through 1000')
    }
    const result = await statement(
      this.#database,
      `SELECT media_items.id, media_items.type, media_items.title
       FROM media_items
       INNER JOIN archive_entries ON archive_entries.media_item_id = media_items.id
       WHERE archive_entries.upstream_state = 'active'
       GROUP BY media_items.id, media_items.type, media_items.title
       ORDER BY MAX(COALESCE(archive_entries.consumed_at_value, archive_entries.created_at)) DESC,
                media_items.id DESC
       LIMIT ?`,
      [limit],
    ).all<{ id: string; type: MediaItem['type']; title: string | null }>()
    return result.results.map((row) => ({
      id: mediaItemId(row.id),
      type: row.type,
      title: row.title,
    }))
  }

  async findMedia(id: MediaItemId): Promise<MediaSummaryRecord | null> {
    const row = await statement(
      this.#database,
      `SELECT media_items.id, media_items.type, media_items.title
       FROM media_items
       WHERE media_items.id = ?
         AND EXISTS (
           SELECT 1
           FROM archive_entries
           WHERE archive_entries.media_item_id = media_items.id
             AND archive_entries.upstream_state = 'active'
         )`,
      [id],
    ).first<{ id: string; type: MediaItem['type']; title: string | null }>()
    return row === null ? null : { id: mediaItemId(row.id), type: row.type, title: row.title }
  }

  async commit(batch: CanonicalWriteBatch): Promise<void> {
    const archiveEntries = batch.archiveEntries ?? []
    requireAdmissionEvidence(archiveEntries)

    const statements: DatabaseStatement[] = []
    if (batch.syncRun !== undefined) {
      statements.push(syncRunStatement(this.#database, batch.syncRun))
    }
    for (const rawObject of batch.rawObjects ?? []) {
      statements.push(rawObjectStatement(this.#database, rawObject))
    }
    for (const sourceRecord of batch.sourceRecords ?? []) {
      statements.push(sourceRecordStatement(this.#database, sourceRecord))
    }
    for (const mediaItem of batch.mediaItems ?? []) {
      statements.push(mediaItemStatement(this.#database, mediaItem))
    }
    for (const identity of batch.externalIdentities ?? []) {
      statements.push(externalIdentityStatement(this.#database, identity))
    }
    for (const write of archiveEntries) {
      const { evidence } = write
      statements.push(archiveEntryStatement(this.#database, write))
      for (const link of evidence) statements.push(evidenceStatement(this.#database, link))
    }
    for (const retired of batch.retireOccurrences ?? []) {
      if (retired.evidence.archiveEntryId !== retired.id || retired.evidence.role !== 'removal')
        throw new TypeError('Retirement requires matching removal evidence')
      statements.push(
        statement(
          this.#database,
          "UPDATE archive_entries SET upstream_state = 'removed', updated_at = ? WHERE id = ?",
          [retired.evidence.linkedAt, retired.id],
        ),
      )
      statements.push(evidenceStatement(this.#database, retired.evidence))
    }
    if (batch.cursor !== undefined) statements.push(cursorStatement(this.#database, batch.cursor))

    if (statements.length > 0) await this.#run(statements)
  }

  async #run(statements: readonly DatabaseStatement[]): Promise<void> {
    const results = await this.#database.batch(statements)
    if (results.length !== statements.length || results.some((result) => !result.success)) {
      throw new Error('Database batch did not complete successfully')
    }
  }
}
