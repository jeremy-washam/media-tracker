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
  externalIdentityId,
  mediaItemId,
  rawObjectId,
  sourceRecordId,
  syncCursorId,
  syncRunId,
  utcInstant,
  type ArchiveEntryId,
  type ConnectionId,
  type ExternalIdentityId,
  type IdentityNamespace,
  type MediaItemId,
  type RawObjectId,
  type SourceRecordId,
} from '@media-tracker/domain'

import type { DatabaseClient, DatabaseStatement, DatabaseValue } from './database'

export interface ArchiveEntryWrite {
  readonly entry: ArchiveEntry
  readonly evidence: readonly ArchiveEntryEvidence[]
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

export interface CanonicalLedgerRepository {
  saveConnection(connection: SourceConnection): Promise<void>
  saveSyncRun(syncRun: SyncRun): Promise<void>
  findRawObjectId(connectionId: ConnectionId, acquisitionKey: string): Promise<RawObjectId | null>
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
  findSyncCursor(connectionId: ConnectionId, name: string): Promise<SyncCursor | null>
  commit(batch: CanonicalWriteBatch): Promise<void>
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

function archiveEntryStatement(database: DatabaseClient, entry: ArchiveEntry): DatabaseStatement {
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
      consumed_at_value = COALESCE(excluded.consumed_at_value, archive_entries.consumed_at_value),
      consumed_at_precision = COALESCE(excluded.consumed_at_precision, archive_entries.consumed_at_precision),
      consumed_at_basis = COALESCE(excluded.consumed_at_basis, archive_entries.consumed_at_basis),
      source_recorded_at_value = COALESCE(excluded.source_recorded_at_value, archive_entries.source_recorded_at_value),
      source_recorded_at_precision = COALESCE(excluded.source_recorded_at_precision, archive_entries.source_recorded_at_precision),
      source_recorded_at_basis = COALESCE(excluded.source_recorded_at_basis, archive_entries.source_recorded_at_basis),
      rating_value = COALESCE(excluded.rating_value, archive_entries.rating_value),
      rating_scale_minimum = COALESCE(excluded.rating_scale_minimum, archive_entries.rating_scale_minimum),
      rating_scale_maximum = COALESCE(excluded.rating_scale_maximum, archive_entries.rating_scale_maximum),
      review_text = COALESCE(excluded.review_text, archive_entries.review_text),
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

  async saveConnection(connection: SourceConnection): Promise<void> {
    await this.#run([connectionStatement(this.#database, connection)])
  }

  async saveSyncRun(syncRun: SyncRun): Promise<void> {
    await this.#run([syncRunStatement(this.#database, syncRun)])
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
    for (const { entry, evidence } of archiveEntries) {
      statements.push(archiveEntryStatement(this.#database, entry))
      for (const link of evidence) statements.push(evidenceStatement(this.#database, link))
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
