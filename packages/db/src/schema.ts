import {
  ARCHIVE_ADMISSION_REASONS,
  ARCHIVE_EVIDENCE_ROLES,
  IDENTITY_NAMESPACES,
  MEDIA_SOURCES,
  MEDIA_TYPES,
  type JsonObject,
} from '@media-tracker/domain'
import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

const connectionStatuses = [
  'connected',
  'disconnected',
  'degraded',
  'reauthorization_required',
] as const
const coverageLevels = ['complete', 'partial', 'best_effort'] as const
const syncRunKinds = ['backfill', 'reconcile', 'import', 'webhook', 'replay'] as const
const syncRunStatuses = [
  'pending',
  'running',
  'succeeded',
  'partially_succeeded',
  'failed',
] as const
const rawObjectKinds = ['api_page', 'webhook', 'rss', 'export', 'source_document'] as const
const processingStatuses = ['pending', 'processing', 'processed', 'failed'] as const
const temporalPrecisions = ['year', 'month', 'day', 'instant'] as const
const temporalBases = ['source_asserted', 'inferred'] as const
const recordDispositions = ['normalized', 'ignored', 'unresolved', 'invalid'] as const
const upstreamStates = ['active', 'removed', 'unknown'] as const
const identityScopes = ['global', 'connection'] as const

const inList = (values: readonly string[]): string => values.map((value) => `'${value}'`).join(', ')
const temporalCheck = (value: string, precision: string, basis: string) =>
  sql.raw(`((${value} IS NULL AND ${precision} IS NULL AND ${basis} IS NULL) OR
    (${value} IS NOT NULL AND ${precision} IN (${inList(temporalPrecisions)})
      AND ${basis} IN (${inList(temporalBases)})))`)

export const sources = sqliteTable('sources', {
  source: text('source', { enum: MEDIA_SOURCES }).primaryKey(),
  displayName: text('display_name').notNull(),
})

export const connections = sqliteTable(
  'connections',
  {
    id: text('id').primaryKey(),
    source: text('source', { enum: MEDIA_SOURCES })
      .notNull()
      .references(() => sources.source, { onDelete: 'restrict', onUpdate: 'restrict' }),
    label: text('label').notNull(),
    status: text('status', { enum: connectionStatuses }).notNull(),
    coverage: text('coverage', { enum: coverageLevels }).notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    check('connections_label_not_empty', sql`length(trim(${table.label})) > 0`),
    check('connections_status_valid', sql.raw(`status IN (${inList(connectionStatuses)})`)),
    check('connections_coverage_valid', sql.raw(`coverage IN (${inList(coverageLevels)})`)),
  ],
)

export const syncRuns = sqliteTable(
  'sync_runs',
  {
    id: text('id').primaryKey(),
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'restrict' }),
    kind: text('kind', { enum: syncRunKinds }).notNull(),
    status: text('status', { enum: syncRunStatuses }).notNull(),
    startedAt: text('started_at').notNull(),
    finishedAt: text('finished_at'),
    rawObjectCount: integer('raw_object_count').notNull().default(0),
    sourceRecordCount: integer('source_record_count').notNull().default(0),
    normalizedRecordCount: integer('normalized_record_count').notNull().default(0),
    failedRecordCount: integer('failed_record_count').notNull().default(0),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
  },
  (table) => [
    index('sync_runs_connection_started_idx').on(table.connectionId, table.startedAt),
    check('sync_runs_kind_valid', sql.raw(`kind IN (${inList(syncRunKinds)})`)),
    check('sync_runs_status_valid', sql.raw(`status IN (${inList(syncRunStatuses)})`)),
    check(
      'sync_runs_counts_nonnegative',
      sql`${table.rawObjectCount} >= 0 AND ${table.sourceRecordCount} >= 0 AND ${table.normalizedRecordCount} >= 0 AND ${table.failedRecordCount} >= 0`,
    ),
  ],
)

export const syncCursors = sqliteTable(
  'sync_cursors',
  {
    id: text('id').primaryKey(),
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    checkpoint: text('checkpoint_json', { mode: 'json' }).$type<JsonObject>().notNull(),
    committedAt: text('committed_at').notNull(),
    syncRunId: text('sync_run_id')
      .notNull()
      .references(() => syncRuns.id, { onDelete: 'restrict' }),
  },
  (table) => [
    uniqueIndex('sync_cursors_connection_name_unique').on(table.connectionId, table.name),
    check('sync_cursors_name_not_empty', sql`length(trim(${table.name})) > 0`),
    check(
      'sync_cursors_checkpoint_json_valid',
      sql`json_valid(${table.checkpoint}) AND json_type(${table.checkpoint}) = 'object'`,
    ),
  ],
)

export const rawObjects = sqliteTable(
  'raw_objects',
  {
    id: text('id').primaryKey(),
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'restrict' }),
    syncRunId: text('sync_run_id')
      .notNull()
      .references(() => syncRuns.id, { onDelete: 'restrict' }),
    kind: text('kind', { enum: rawObjectKinds }).notNull(),
    acquisitionKey: text('acquisition_key').notNull(),
    storageKey: text('storage_key').notNull(),
    sha256: text('sha256').notNull(),
    contentType: text('content_type').notNull(),
    byteLength: integer('byte_length').notNull(),
    acquiredAt: text('acquired_at').notNull(),
    processingStatus: text('processing_status', { enum: processingStatuses }).notNull(),
    lastParserVersion: text('last_parser_version'),
    processingError: text('processing_error'),
  },
  (table) => [
    uniqueIndex('raw_objects_connection_acquisition_unique').on(
      table.connectionId,
      table.acquisitionKey,
    ),
    uniqueIndex('raw_objects_id_connection_unique').on(table.id, table.connectionId),
    index('raw_objects_sync_run_idx').on(table.syncRunId),
    check('raw_objects_kind_valid', sql.raw(`kind IN (${inList(rawObjectKinds)})`)),
    check(
      'raw_objects_processing_status_valid',
      sql.raw(`processing_status IN (${inList(processingStatuses)})`),
    ),
    check('raw_objects_sha256_length', sql`length(${table.sha256}) = 64`),
    check('raw_objects_byte_length_nonnegative', sql`${table.byteLength} >= 0`),
  ],
)

export const sourceRecords = sqliteTable(
  'source_records',
  {
    id: text('id').primaryKey(),
    rawObjectId: text('raw_object_id').notNull(),
    connectionId: text('connection_id').notNull(),
    recordType: text('record_type').notNull(),
    recordPath: text('record_path').notNull(),
    sourceRecordKey: text('source_record_key'),
    sourceRecordedAtValue: text('source_recorded_at_value'),
    sourceRecordedAtPrecision: text('source_recorded_at_precision', {
      enum: temporalPrecisions,
    }),
    sourceRecordedAtBasis: text('source_recorded_at_basis', { enum: temporalBases }),
    observedAt: text('observed_at').notNull(),
    parserVersion: text('parser_version').notNull(),
    contentSha256: text('content_sha256'),
    disposition: text('disposition', { enum: recordDispositions }).notNull(),
    upstreamState: text('upstream_state', { enum: upstreamStates }).notNull(),
    errorCode: text('error_code'),
  },
  (table) => [
    foreignKey({
      columns: [table.rawObjectId, table.connectionId],
      foreignColumns: [rawObjects.id, rawObjects.connectionId],
      name: 'source_records_raw_object_connection_fk',
    }).onDelete('restrict'),
    uniqueIndex('source_records_replay_unique').on(
      table.rawObjectId,
      table.parserVersion,
      table.recordPath,
    ),
    index('source_records_logical_key_idx').on(table.connectionId, table.sourceRecordKey),
    check(
      'source_records_temporal_complete',
      temporalCheck(
        'source_recorded_at_value',
        'source_recorded_at_precision',
        'source_recorded_at_basis',
      ),
    ),
    check(
      'source_records_disposition_valid',
      sql.raw(`disposition IN (${inList(recordDispositions)})`),
    ),
    check(
      'source_records_upstream_state_valid',
      sql.raw(`upstream_state IN (${inList(upstreamStates)})`),
    ),
  ],
)

export const mediaItems = sqliteTable(
  'media_items',
  {
    id: text('id').primaryKey(),
    type: text('type', { enum: MEDIA_TYPES }).notNull(),
    title: text('title'),
    subtitle: text('subtitle'),
    primaryCreatorName: text('primary_creator_name'),
    description: text('description'),
    canonicalUrl: text('canonical_url'),
    imageUrl: text('image_url'),
    publishedAtValue: text('published_at_value'),
    publishedAtPrecision: text('published_at_precision', { enum: temporalPrecisions }),
    publishedAtBasis: text('published_at_basis', { enum: temporalBases }),
    durationMs: integer('duration_ms'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('media_items_type_updated_idx').on(table.type, table.updatedAt),
    check('media_items_type_valid', sql.raw(`type IN (${inList(MEDIA_TYPES)})`)),
    check(
      'media_items_published_temporal_complete',
      temporalCheck('published_at_value', 'published_at_precision', 'published_at_basis'),
    ),
    check(
      'media_items_duration_nonnegative',
      sql`${table.durationMs} IS NULL OR ${table.durationMs} >= 0`,
    ),
  ],
)

export const externalIdentities = sqliteTable(
  'external_identities',
  {
    id: text('id').primaryKey(),
    mediaItemId: text('media_item_id')
      .notNull()
      .references(() => mediaItems.id, { onDelete: 'restrict' }),
    namespace: text('namespace', { enum: IDENTITY_NAMESPACES }).notNull(),
    externalType: text('external_type').notNull(),
    externalId: text('external_id').notNull(),
    scope: text('scope', { enum: identityScopes }).notNull(),
    connectionId: text('connection_id').references(() => connections.id, { onDelete: 'restrict' }),
    canonicalUrl: text('canonical_url'),
    firstObservedSourceRecordId: text('first_observed_source_record_id')
      .notNull()
      .references(() => sourceRecords.id, { onDelete: 'restrict' }),
    lastObservedSourceRecordId: text('last_observed_source_record_id')
      .notNull()
      .references(() => sourceRecords.id, { onDelete: 'restrict' }),
    retiredAt: text('retired_at'),
  },
  (table) => [
    uniqueIndex('external_identities_id_media_item_unique').on(table.id, table.mediaItemId),
    uniqueIndex('external_identities_global_unique')
      .on(table.namespace, table.externalType, table.externalId)
      .where(sql`${table.scope} = 'global'`),
    uniqueIndex('external_identities_connection_unique')
      .on(table.connectionId, table.namespace, table.externalType, table.externalId)
      .where(sql`${table.scope} = 'connection'`),
    index('external_identities_media_item_idx').on(table.mediaItemId),
    check(
      'external_identities_namespace_valid',
      sql.raw(`namespace IN (${inList(IDENTITY_NAMESPACES)})`),
    ),
    check('external_identities_scope_valid', sql.raw(`scope IN (${inList(identityScopes)})`)),
    check(
      'external_identities_scope_connection_consistent',
      sql`(${table.scope} = 'global' AND ${table.connectionId} IS NULL) OR (${table.scope} = 'connection' AND ${table.connectionId} IS NOT NULL)`,
    ),
  ],
)

export const archiveEntries = sqliteTable(
  'archive_entries',
  {
    id: text('id').primaryKey(),
    mediaItemId: text('media_item_id')
      .notNull()
      .references(() => mediaItems.id, { onDelete: 'restrict' }),
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'restrict' }),
    consumedIdentityId: text('consumed_identity_id'),
    sourceOccurrenceKey: text('source_occurrence_key').notNull(),
    admissionReason: text('admission_reason', { enum: ARCHIVE_ADMISSION_REASONS }).notNull(),
    consumedAtValue: text('consumed_at_value'),
    consumedAtPrecision: text('consumed_at_precision', { enum: temporalPrecisions }),
    consumedAtBasis: text('consumed_at_basis', { enum: temporalBases }),
    sourceRecordedAtValue: text('source_recorded_at_value'),
    sourceRecordedAtPrecision: text('source_recorded_at_precision', {
      enum: temporalPrecisions,
    }),
    sourceRecordedAtBasis: text('source_recorded_at_basis', { enum: temporalBases }),
    ratingValue: real('rating_value'),
    ratingScaleMinimum: real('rating_scale_minimum'),
    ratingScaleMaximum: real('rating_scale_maximum'),
    reviewText: text('review_text'),
    upstreamState: text('upstream_state', { enum: upstreamStates }).notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.consumedIdentityId, table.mediaItemId],
      foreignColumns: [externalIdentities.id, externalIdentities.mediaItemId],
      name: 'archive_entries_consumed_identity_media_item_fk',
    }).onDelete('restrict'),
    uniqueIndex('archive_entries_connection_occurrence_unique').on(
      table.connectionId,
      table.sourceOccurrenceKey,
    ),
    index('archive_entries_media_consumed_idx').on(table.mediaItemId, table.consumedAtValue),
    check(
      'archive_entries_admission_reason_valid',
      sql.raw(`admission_reason IN (${inList(ARCHIVE_ADMISSION_REASONS)})`),
    ),
    check(
      'archive_entries_consumed_temporal_complete',
      temporalCheck('consumed_at_value', 'consumed_at_precision', 'consumed_at_basis'),
    ),
    check(
      'archive_entries_recorded_temporal_complete',
      temporalCheck(
        'source_recorded_at_value',
        'source_recorded_at_precision',
        'source_recorded_at_basis',
      ),
    ),
    check(
      'archive_entries_rating_complete',
      sql`((${table.ratingValue} IS NULL AND ${table.ratingScaleMinimum} IS NULL AND ${table.ratingScaleMaximum} IS NULL) OR (${table.ratingValue} IS NOT NULL AND ${table.ratingScaleMinimum} IS NOT NULL AND ${table.ratingScaleMaximum} IS NOT NULL AND ${table.ratingScaleMinimum} < ${table.ratingScaleMaximum} AND ${table.ratingValue} BETWEEN ${table.ratingScaleMinimum} AND ${table.ratingScaleMaximum}))`,
    ),
    check(
      'archive_entries_upstream_state_valid',
      sql.raw(`upstream_state IN (${inList(upstreamStates)})`),
    ),
  ],
)

export const archiveEntryEvidence = sqliteTable(
  'archive_entry_evidence',
  {
    id: text('id').primaryKey(),
    archiveEntryId: text('archive_entry_id')
      .notNull()
      .references(() => archiveEntries.id, { onDelete: 'restrict' }),
    sourceRecordId: text('source_record_id')
      .notNull()
      .references(() => sourceRecords.id, { onDelete: 'restrict' }),
    role: text('role', { enum: ARCHIVE_EVIDENCE_ROLES }).notNull(),
    linkedAt: text('linked_at').notNull(),
  },
  (table) => [
    uniqueIndex('archive_entry_evidence_link_unique').on(
      table.archiveEntryId,
      table.sourceRecordId,
      table.role,
    ),
    index('archive_entry_evidence_source_record_idx').on(table.sourceRecordId),
    check(
      'archive_entry_evidence_role_valid',
      sql.raw(`role IN (${inList(ARCHIVE_EVIDENCE_ROLES)})`),
    ),
  ],
)

export const schema = {
  archiveEntries,
  archiveEntryEvidence,
  connections,
  externalIdentities,
  mediaItems,
  rawObjects,
  sourceRecords,
  sources,
  syncCursors,
  syncRuns,
}

// Operational secret storage; never part of raw source evidence or browser responses.
export const connectionCredentials = sqliteTable('connection_credentials', {
  connectionId: text('connection_id')
    .primaryKey()
    .references(() => connections.id, { onDelete: 'restrict' }),
  bootstrapSha256: text('bootstrap_sha256').notNull(),
  ciphertext: text('ciphertext').notNull(),
  iv: text('iv').notNull(),
  updatedAt: text('updated_at').notNull(),
})
export const connectionRefreshLeases = sqliteTable('connection_refresh_leases', {
  connectionId: text('connection_id')
    .primaryKey()
    .references(() => connections.id, { onDelete: 'restrict' }),
  owner: text('owner').notNull(),
  expiresAt: integer('expires_at').notNull(),
})
