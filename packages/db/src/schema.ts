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
  primaryKey,
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

export const hardcoverBookWorks = sqliteTable(
  'hardcover_book_works',
  {
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id),
    workId: integer('work_id').notNull(),
    mediaItemId: text('media_item_id')
      .notNull()
      .references(() => mediaItems.id),
    canonicalWorkId: integer('canonical_work_id'),
    title: text('title').notNull(),
    subtitle: text('subtitle'),
    description: text('description'),
    slug: text('slug'),
    pages: integer('pages'),
    audioSeconds: integer('audio_seconds'),
    releaseDate: text('release_date'),
    releasePrecision: text('release_precision', { enum: ['year', 'month', 'day'] }),
    coverUrl: text('cover_url'),
    coverColor: text('cover_color'),
    communityRating: real('community_rating'),
    communityRatingsCount: integer('community_ratings_count').notNull(),
    usersReadCount: integer('users_read_count').notNull(),
    defaultCoverEditionId: integer('default_cover_edition_id'),
    sourceRecordId: text('source_record_id')
      .notNull()
      .references(() => sourceRecords.id),
    sourceUpdatedAt: text('source_updated_at'),
    lastSeenRunId: text('last_seen_run_id')
      .notNull()
      .references(() => syncRuns.id),
    upstreamState: text('upstream_state', { enum: upstreamStates }).notNull(),
    firstObservedAt: text('first_observed_at').notNull(),
    lastObservedAt: text('last_observed_at').notNull(),
    retiredAt: text('retired_at'),
  },
  (table) => [
    primaryKey({ columns: [table.connectionId, table.workId] }),
    uniqueIndex('hardcover_book_works_connection_media_unique').on(
      table.connectionId,
      table.mediaItemId,
    ),
  ],
)

export const hardcoverUserBooks = sqliteTable(
  'hardcover_user_books',
  {
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id),
    userBookId: integer('user_book_id').notNull(),
    mediaItemId: text('media_item_id')
      .notNull()
      .references(() => mediaItems.id),
    workId: integer('work_id').notNull(),
    currentEditionId: integer('current_edition_id'),
    statusId: integer('status_id').notNull(),
    statusLabel: text('status_label'),
    dateAdded: text('date_added'),
    readCount: integer('read_count').notNull(),
    personalRating: real('personal_rating'),
    reviewText: text('review_text'),
    reviewHasSpoilers: integer('review_has_spoilers', { mode: 'boolean' }).notNull(),
    reviewedAt: text('reviewed_at'),
    sourceUpdatedAt: text('source_updated_at'),
    sourceRecordId: text('source_record_id')
      .notNull()
      .references(() => sourceRecords.id),
    lastSeenRunId: text('last_seen_run_id')
      .notNull()
      .references(() => syncRuns.id),
    upstreamState: text('upstream_state', { enum: upstreamStates }).notNull(),
    firstObservedAt: text('first_observed_at').notNull(),
    lastObservedAt: text('last_observed_at').notNull(),
    retiredAt: text('retired_at'),
  },
  (table) => [
    primaryKey({ columns: [table.connectionId, table.userBookId] }),
    uniqueIndex('hardcover_user_books_connection_work_unique').on(table.connectionId, table.workId),
  ],
)

export const hardcoverBookEditions = sqliteTable(
  'hardcover_book_editions',
  {
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id),
    editionId: integer('edition_id').notNull(),
    mediaItemId: text('media_item_id')
      .notNull()
      .references(() => mediaItems.id),
    workId: integer('work_id').notNull(),
    canonicalEditionId: integer('canonical_edition_id'),
    title: text('title'),
    subtitle: text('subtitle'),
    editionInformation: text('edition_information'),
    readingFormatId: integer('reading_format_id'),
    readingFormat: text('reading_format'),
    rawFormat: text('raw_format'),
    pages: integer('pages'),
    audioSeconds: integer('audio_seconds'),
    releaseDate: text('release_date'),
    publisher: text('publisher'),
    language: text('language'),
    isbn10: text('isbn_10'),
    isbn13: text('isbn_13'),
    asin: text('asin'),
    coverUrl: text('cover_url'),
    coverColor: text('cover_color'),
    sourceRecordId: text('source_record_id')
      .notNull()
      .references(() => sourceRecords.id),
    lastSeenRunId: text('last_seen_run_id')
      .notNull()
      .references(() => syncRuns.id),
    upstreamState: text('upstream_state', { enum: upstreamStates }).notNull(),
    firstObservedAt: text('first_observed_at').notNull(),
    lastObservedAt: text('last_observed_at').notNull(),
    retiredAt: text('retired_at'),
  },
  (table) => [primaryKey({ columns: [table.connectionId, table.editionId] })],
)

export const hardcoverContributors = sqliteTable(
  'hardcover_contributors',
  {
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id),
    contributorId: integer('contributor_id').notNull(),
    name: text('name').notNull(),
    slug: text('slug'),
    sourceRecordId: text('source_record_id')
      .notNull()
      .references(() => sourceRecords.id),
    lastSeenRunId: text('last_seen_run_id')
      .notNull()
      .references(() => syncRuns.id),
    upstreamState: text('upstream_state', { enum: upstreamStates }).notNull(),
    firstObservedAt: text('first_observed_at').notNull(),
    lastObservedAt: text('last_observed_at').notNull(),
    retiredAt: text('retired_at'),
  },
  (table) => [primaryKey({ columns: [table.connectionId, table.contributorId] })],
)

const contributorLinkColumns = () => ({
  connectionId: text('connection_id')
    .notNull()
    .references(() => connections.id),
  contributorId: integer('contributor_id').notNull(),
  roleId: integer('role_id'),
  roleName: text('role_name').notNull(),
  contribution: text('contribution'),
  isPrimary: integer('is_primary', { mode: 'boolean' }).notNull(),
  position: integer('position').notNull(),
  sourceRecordId: text('source_record_id')
    .notNull()
    .references(() => sourceRecords.id),
  lastSeenRunId: text('last_seen_run_id')
    .notNull()
    .references(() => syncRuns.id),
  upstreamState: text('upstream_state', { enum: upstreamStates }).notNull(),
})

export const hardcoverWorkContributors = sqliteTable(
  'hardcover_work_contributors',
  { ...contributorLinkColumns(), workId: integer('work_id').notNull() },
  (table) => [
    primaryKey({
      columns: [table.connectionId, table.workId, table.contributorId, table.roleName],
    }),
  ],
)

export const hardcoverEditionContributors = sqliteTable(
  'hardcover_edition_contributors',
  { ...contributorLinkColumns(), editionId: integer('edition_id').notNull() },
  (table) => [
    primaryKey({
      columns: [table.connectionId, table.editionId, table.contributorId, table.roleName],
    }),
  ],
)

export const hardcoverSeries = sqliteTable(
  'hardcover_series',
  {
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id),
    seriesId: integer('series_id').notNull(),
    name: text('name').notNull(),
    slug: text('slug'),
    booksCount: integer('books_count'),
    sourceRecordId: text('source_record_id')
      .notNull()
      .references(() => sourceRecords.id),
    lastSeenRunId: text('last_seen_run_id')
      .notNull()
      .references(() => syncRuns.id),
    upstreamState: text('upstream_state', { enum: upstreamStates }).notNull(),
    firstObservedAt: text('first_observed_at').notNull(),
    lastObservedAt: text('last_observed_at').notNull(),
    retiredAt: text('retired_at'),
  },
  (table) => [primaryKey({ columns: [table.connectionId, table.seriesId] })],
)

export const hardcoverWorkSeries = sqliteTable(
  'hardcover_work_series',
  {
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id),
    workId: integer('work_id').notNull(),
    seriesId: integer('series_id').notNull(),
    position: real('position'),
    compilation: integer('compilation', { mode: 'boolean' }).notNull(),
    featured: integer('featured', { mode: 'boolean' }).notNull(),
    sourceRecordId: text('source_record_id')
      .notNull()
      .references(() => sourceRecords.id),
    lastSeenRunId: text('last_seen_run_id')
      .notNull()
      .references(() => syncRuns.id),
    upstreamState: text('upstream_state', { enum: upstreamStates }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.connectionId, table.workId, table.seriesId] })],
)

export const hardcoverWorkTaxonomy = sqliteTable(
  'hardcover_work_taxonomy',
  {
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id),
    workId: integer('work_id').notNull(),
    category: text('category').notNull(),
    value: text('value').notNull(),
    slug: text('slug').notNull(),
    sourceRecordId: text('source_record_id')
      .notNull()
      .references(() => sourceRecords.id),
    lastSeenRunId: text('last_seen_run_id')
      .notNull()
      .references(() => syncRuns.id),
    upstreamState: text('upstream_state', { enum: upstreamStates }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.connectionId, table.workId, table.category, table.slug] }),
  ],
)

export const hardcoverUserBookReads = sqliteTable(
  'hardcover_user_book_reads',
  {
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id),
    readId: integer('read_id').notNull(),
    userBookId: integer('user_book_id').notNull(),
    mediaItemId: text('media_item_id')
      .notNull()
      .references(() => mediaItems.id),
    archiveEntryId: text('archive_entry_id').references(() => archiveEntries.id),
    editionId: integer('edition_id'),
    startedAt: text('started_at'),
    pausedAt: text('paused_at'),
    finishedAt: text('finished_at'),
    finishedAtPrecisionRaw: text('finished_at_precision_raw'),
    progress: real('progress'),
    progressPages: integer('progress_pages'),
    progressSeconds: integer('progress_seconds'),
    sourceRecordId: text('source_record_id')
      .notNull()
      .references(() => sourceRecords.id),
    lastSeenRunId: text('last_seen_run_id')
      .notNull()
      .references(() => syncRuns.id),
    upstreamState: text('upstream_state', { enum: upstreamStates }).notNull(),
    firstObservedAt: text('first_observed_at').notNull(),
    lastObservedAt: text('last_observed_at').notNull(),
    retiredAt: text('retired_at'),
  },
  (table) => [primaryKey({ columns: [table.connectionId, table.readId] })],
)

export const bookLibraryProjection = sqliteTable('book_library_projection', {
  mediaItemId: text('media_item_id')
    .primaryKey()
    .references(() => mediaItems.id),
  connectionId: text('connection_id')
    .notNull()
    .references(() => connections.id),
  userBookId: integer('user_book_id').notNull(),
  workId: integer('work_id').notNull(),
  title: text('title').notNull(),
  normalizedTitle: text('normalized_title').notNull(),
  subtitle: text('subtitle'),
  primaryAuthorName: text('primary_author_name'),
  normalizedPrimaryAuthor: text('normalized_primary_author'),
  coverUrl: text('cover_url'),
  coverColor: text('cover_color'),
  publicationDate: text('publication_date'),
  publicationPrecision: text('publication_precision', { enum: ['year', 'month', 'day'] }),
  primarySeriesName: text('primary_series_name'),
  currentStatusId: integer('current_status_id').notNull(),
  queueAddedAt: text('queue_added_at'),
  inQueue: integer('in_queue', { mode: 'boolean' }).notNull(),
  inArchive: integer('in_archive', { mode: 'boolean' }).notNull(),
  currentlyReading: integer('currently_reading', { mode: 'boolean' }).notNull(),
  personalRating: real('personal_rating'),
  latestReadId: integer('latest_read_id'),
  latestReadDate: text('latest_read_date'),
  latestReadPrecision: text('latest_read_precision', { enum: ['year', 'month', 'day'] }),
  latestReadFormat: text('latest_read_format'),
  currentEditionFormat: text('current_edition_format'),
  supportedReadCount: integer('supported_read_count').notNull(),
  sourceRefreshedAt: text('source_refreshed_at').notNull(),
  projectionVersion: integer('projection_version').notNull(),
})

export const bookIdentifiers = sqliteTable(
  'book_identifiers',
  {
    mediaItemId: text('media_item_id')
      .notNull()
      .references(() => mediaItems.id),
    type: text('type', { enum: ['isbn_10', 'isbn_13', 'asin'] }).notNull(),
    normalizedValue: text('normalized_value').notNull(),
    displayValue: text('display_value').notNull(),
  },
  (table) => [primaryKey({ columns: [table.mediaItemId, table.type, table.normalizedValue] })],
)

export const queueEntries = sqliteTable(
  'queue_entries',
  {
    id: text('id').primaryKey(),
    mediaItemId: text('media_item_id')
      .notNull()
      .references(() => mediaItems.id, { onDelete: 'restrict' }),
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'restrict' }),
    sourceMembershipKey: text('source_membership_key').notNull(),
    relationshipType: text('relationship_type').notNull(),
    addedAtValue: text('added_at_value'),
    addedAtPrecision: text('added_at_precision', { enum: temporalPrecisions }),
    addedAtBasis: text('added_at_basis', { enum: temporalBases }),
    upstreamState: text('upstream_state', { enum: upstreamStates }).notNull(),
    firstObservedAt: text('first_observed_at').notNull(),
    lastObservedAt: text('last_observed_at').notNull(),
    retiredObservedAt: text('retired_observed_at'),
    projectionVersion: integer('projection_version').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('queue_entries_connection_membership_unique').on(
      table.connectionId,
      table.sourceMembershipKey,
    ),
    index('queue_entries_media_state_idx').on(table.mediaItemId, table.upstreamState),
    index('queue_entries_connection_added_idx').on(
      table.connectionId,
      table.upstreamState,
      table.addedAtValue,
      table.mediaItemId,
    ),
    check(
      'queue_entries_added_temporal_complete',
      temporalCheck('added_at_value', 'added_at_precision', 'added_at_basis'),
    ),
  ],
)

export const queueEntryEvidence = sqliteTable(
  'queue_entry_evidence',
  {
    id: text('id').primaryKey(),
    queueEntryId: text('queue_entry_id')
      .notNull()
      .references(() => queueEntries.id, { onDelete: 'restrict' }),
    sourceRecordId: text('source_record_id')
      .notNull()
      .references(() => sourceRecords.id, { onDelete: 'restrict' }),
    role: text('role', { enum: ['membership', 'added_time', 'removal'] }).notNull(),
    linkedAt: text('linked_at').notNull(),
  },
  (table) => [
    uniqueIndex('queue_entry_evidence_unique').on(
      table.queueEntryId,
      table.sourceRecordId,
      table.role,
    ),
    index('queue_entry_evidence_source_idx').on(table.sourceRecordId),
  ],
)

export const letterboxdMovieState = sqliteTable(
  'letterboxd_movie_state',
  {
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'restrict' }),
    mediaItemId: text('media_item_id')
      .notNull()
      .references(() => mediaItems.id, { onDelete: 'restrict' }),
    filmUri: text('film_uri').notNull(),
    importedTitle: text('imported_title').notNull(),
    releaseYear: text('release_year').notNull(),
    currentRatingValue: real('current_rating_value'),
    ratingSourceRecordId: text('rating_source_record_id').references(() => sourceRecords.id, {
      onDelete: 'restrict',
    }),
    liked: integer('liked', { mode: 'boolean' }).notNull(),
    likeSourceRecordId: text('like_source_record_id').references(() => sourceRecords.id, {
      onDelete: 'restrict',
    }),
    lastCompleteExportRawObjectId: text('last_complete_export_raw_object_id')
      .notNull()
      .references(() => rawObjects.id, { onDelete: 'restrict' }),
    firstObservedAt: text('first_observed_at').notNull(),
    lastObservedAt: text('last_observed_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.connectionId, table.mediaItemId] }),
    uniqueIndex('letterboxd_movie_state_connection_uri_unique').on(
      table.connectionId,
      table.filmUri,
    ),
    index('letterboxd_movie_state_rating_idx').on(table.currentRatingValue, table.mediaItemId),
  ],
)

export const letterboxdMovieViewings = sqliteTable(
  'letterboxd_movie_viewings',
  {
    archiveEntryId: text('archive_entry_id')
      .primaryKey()
      .references(() => archiveEntries.id, { onDelete: 'restrict' }),
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'restrict' }),
    mediaItemId: text('media_item_id')
      .notNull()
      .references(() => mediaItems.id, { onDelete: 'restrict' }),
    diaryUri: text('diary_uri'),
    rewatch: integer('rewatch', { mode: 'boolean' }).notNull(),
    logUrl: text('log_url'),
    sourceRecordId: text('source_record_id')
      .notNull()
      .references(() => sourceRecords.id, { onDelete: 'restrict' }),
    projectionVersion: integer('projection_version').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('letterboxd_movie_viewings_media_idx').on(table.mediaItemId, table.archiveEntryId),
  ],
)

export const movieLibraryProjection = sqliteTable('movie_library_projection', {
  mediaItemId: text('media_item_id')
    .primaryKey()
    .references(() => mediaItems.id, { onDelete: 'restrict' }),
  connectionId: text('connection_id')
    .notNull()
    .references(() => connections.id, { onDelete: 'restrict' }),
  filmUri: text('film_uri'),
  importedTitle: text('imported_title').notNull(),
  displayTitle: text('display_title').notNull(),
  normalizedTitle: text('normalized_title').notNull(),
  releaseYear: text('release_year'),
  posterUrl: text('poster_url'),
  directorNames: text('director_names'),
  runtimeMinutes: integer('runtime_minutes'),
  currentRatingValue: real('current_rating_value'),
  liked: integer('liked', { mode: 'boolean' }).notNull(),
  reviewed: integer('reviewed', { mode: 'boolean' }).notNull(),
  inArchive: integer('in_archive', { mode: 'boolean' }).notNull(),
  inQueue: integer('in_queue', { mode: 'boolean' }).notNull(),
  queueAddedOn: text('queue_added_on'),
  latestKnownWatchedOn: text('latest_known_watched_on'),
  activeWatchCount: integer('active_watch_count').notNull(),
  hasUnknownWatchedDate: integer('has_unknown_watched_date', { mode: 'boolean' }).notNull(),
  sourceRefreshedAt: text('source_refreshed_at').notNull(),
  projectionVersion: integer('projection_version').notNull(),
})

export const readwiseDocuments = sqliteTable(
  'readwise_documents',
  {
    id: text('id').primaryKey(),
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id),
    documentId: text('document_id').notNull(),
    mediaItemId: text('media_item_id').references(() => mediaItems.id),
    externalIdentityId: text('external_identity_id').references(() => externalIdentities.id),
    readerUrl: text('reader_url'),
    sourceUrl: text('source_url'),
    rawCategory: text('raw_category').notNull(),
    subtype: text('subtype', { enum: ['article', 'newsletter', 'pdf', 'rss'] }),
    currentLocation: text('current_location').notNull(),
    upstreamState: text('upstream_state', { enum: upstreamStates }).notNull(),
    title: text('title'),
    normalizedTitle: text('normalized_title'),
    author: text('author'),
    authorKey: text('author_key'),
    publication: text('publication'),
    publicationKey: text('publication_key'),
    acquisitionSource: text('acquisition_source'),
    summary: text('summary'),
    imageUrl: text('image_url'),
    documentNote: text('document_note'),
    wordCount: integer('word_count'),
    readingTimeRaw: text('reading_time_raw'),
    readingTimeMinutes: real('reading_time_minutes'),
    readingTimeParserVersion: integer('reading_time_parser_version').notNull(),
    listeningTimeRaw: text('listening_time_raw'),
    readingProgress: real('reading_progress'),
    progressValid: integer('progress_valid', { mode: 'boolean' }).notNull(),
    publishedAtValue: text('published_at_value'),
    publishedAtPrecision: text('published_at_precision', { enum: temporalPrecisions }),
    publishedAtBasis: text('published_at_basis', { enum: temporalBases }),
    createdAtSource: text('created_at_source'),
    savedAt: text('saved_at'),
    firstOpenedAt: text('first_opened_at'),
    lastOpenedAt: text('last_opened_at'),
    lastMovedAt: text('last_moved_at'),
    updatedAtSource: text('updated_at_source'),
    lastSourceRecordId: text('last_source_record_id')
      .notNull()
      .references(() => sourceRecords.id),
    lastObservedAt: text('last_observed_at').notNull(),
    lastSnapshotRunId: text('last_snapshot_run_id').references(() => syncRuns.id),
    projectionVersion: integer('projection_version').notNull(),
  },
  (table) => [
    uniqueIndex('readwise_documents_connection_document_unique').on(
      table.connectionId,
      table.documentId,
    ),
    index('readwise_documents_media_connection_idx').on(table.mediaItemId, table.connectionId),
    index('readwise_documents_location_idx').on(
      table.connectionId,
      table.currentLocation,
      table.upstreamState,
      table.savedAt,
      table.mediaItemId,
    ),
  ],
)

export const readwiseProjectionState = sqliteTable('readwise_projection_state', {
  connectionId: text('connection_id')
    .primaryKey()
    .references(() => connections.id),
  documentsSnapshotRunId: text('documents_snapshot_run_id').references(() => syncRuns.id),
  documentsSnapshotCompletedAt: text('documents_snapshot_completed_at'),
  documentsParserVersion: text('documents_parser_version'),
  incrementalWatermark: text('incremental_watermark'),
  tagsSnapshotRunId: text('tags_snapshot_run_id').references(() => syncRuns.id),
  tagsSnapshotCompletedAt: text('tags_snapshot_completed_at'),
  highlightsSnapshotRunId: text('highlights_snapshot_run_id').references(() => syncRuns.id),
  highlightsSnapshotCompletedAt: text('highlights_snapshot_completed_at'),
  highlightsParserVersion: text('highlights_parser_version'),
  fullTextPolicy: text('full_text_policy', { enum: ['archive_queue', 'disabled'] }).notNull(),
  contentAcquisitionVersion: integer('content_acquisition_version').notNull(),
  contentIndexVersion: integer('content_index_version').notNull(),
  projectionRunId: text('projection_run_id').references(() => syncRuns.id),
  projectionRebuiltAt: text('projection_rebuilt_at'),
  projectionVersion: integer('projection_version').notNull(),
})

export const readwiseTags = sqliteTable(
  'readwise_tags',
  {
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id),
    tagKey: text('tag_key').notNull(),
    displayName: text('display_name').notNull(),
    sourceRecordId: text('source_record_id')
      .notNull()
      .references(() => sourceRecords.id),
    upstreamState: text('upstream_state', { enum: upstreamStates }).notNull(),
    firstObservedAt: text('first_observed_at').notNull(),
    lastObservedAt: text('last_observed_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.connectionId, table.tagKey] })],
)

export const readwiseDocumentTags = sqliteTable(
  'readwise_document_tags',
  {
    readwiseDocumentId: text('readwise_document_id')
      .notNull()
      .references(() => readwiseDocuments.id),
    tagKey: text('tag_key').notNull(),
    sourceType: text('source_type'),
    createdValue: text('created_value'),
    upstreamState: text('upstream_state', { enum: upstreamStates }).notNull(),
    sourceRecordId: text('source_record_id')
      .notNull()
      .references(() => sourceRecords.id),
    firstObservedAt: text('first_observed_at').notNull(),
    lastObservedAt: text('last_observed_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.readwiseDocumentId, table.tagKey] })],
)

export const readwiseHighlightContainers = sqliteTable(
  'readwise_highlight_containers',
  {
    id: text('id').primaryKey(),
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id),
    userBookId: integer('user_book_id').notNull(),
    externalId: text('external_id'),
    readwiseDocumentId: text('readwise_document_id').references(() => readwiseDocuments.id),
    title: text('title'),
    author: text('author'),
    source: text('source'),
    category: text('category'),
    sourceUrl: text('source_url'),
    documentNote: text('document_note'),
    upstreamState: text('upstream_state', { enum: upstreamStates }).notNull(),
    sourceRecordId: text('source_record_id')
      .notNull()
      .references(() => sourceRecords.id),
    sourceUpdatedAt: text('source_updated_at'),
    lastObservedAt: text('last_observed_at').notNull(),
  },
  (table) => [
    uniqueIndex('readwise_highlight_containers_connection_book_unique').on(
      table.connectionId,
      table.userBookId,
    ),
  ],
)

export const readwiseHighlights = sqliteTable(
  'readwise_highlights',
  {
    id: text('id').primaryKey(),
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id),
    highlightId: integer('highlight_id').notNull(),
    containerId: text('container_id')
      .notNull()
      .references(() => readwiseHighlightContainers.id),
    text: text('text'),
    note: text('note'),
    location: integer('location'),
    endLocation: integer('end_location'),
    locationType: text('location_type'),
    color: text('color'),
    isFavorite: integer('is_favorite', { mode: 'boolean' }).notNull(),
    isDiscard: integer('is_discard', { mode: 'boolean' }).notNull(),
    upstreamState: text('upstream_state', { enum: upstreamStates }).notNull(),
    highlightedAt: text('highlighted_at'),
    createdAtSource: text('created_at_source'),
    updatedAtSource: text('updated_at_source'),
    readerUrl: text('reader_url'),
    sourceRecordId: text('source_record_id')
      .notNull()
      .references(() => sourceRecords.id),
    lastObservedAt: text('last_observed_at').notNull(),
  },
  (table) => [
    uniqueIndex('readwise_highlights_connection_highlight_unique').on(
      table.connectionId,
      table.highlightId,
    ),
  ],
)

export const articleLibraryProjection = sqliteTable('article_library_projection', {
  mediaItemId: text('media_item_id')
    .primaryKey()
    .references(() => mediaItems.id),
  connectionId: text('connection_id')
    .notNull()
    .references(() => connections.id),
  readwiseDocumentId: text('readwise_document_id')
    .notNull()
    .references(() => readwiseDocuments.id),
  displayTitle: text('display_title').notNull(),
  importedTitle: text('imported_title'),
  normalizedTitle: text('normalized_title').notNull(),
  subtype: text('subtype', { enum: ['article', 'newsletter', 'pdf', 'rss'] }).notNull(),
  imageUrl: text('image_url'),
  author: text('author'),
  authorKey: text('author_key'),
  publication: text('publication'),
  publicationKey: text('publication_key'),
  publishedAtValue: text('published_at_value'),
  publishedAtPrecision: text('published_at_precision'),
  readingTimeRaw: text('reading_time_raw'),
  readingTimeMinutes: real('reading_time_minutes'),
  readingProgress: real('reading_progress'),
  progressValid: integer('progress_valid', { mode: 'boolean' }).notNull(),
  opened: integer('opened', { mode: 'boolean' }).notNull(),
  inArchive: integer('in_archive', { mode: 'boolean' }).notNull(),
  archiveOccurrenceCount: integer('archive_occurrence_count').notNull(),
  latestArchiveAt: text('latest_archive_at'),
  hasUnknownArchiveDate: integer('has_unknown_archive_date', { mode: 'boolean' }).notNull(),
  inQueue: integer('in_queue', { mode: 'boolean' }).notNull(),
  queueState: text('queue_state', { enum: ['inbox', 'later', 'shortlist'] }),
  queueInbox: integer('queue_inbox', { mode: 'boolean' }).notNull(),
  queueLater: integer('queue_later', { mode: 'boolean' }).notNull(),
  queueShortlist: integer('queue_shortlist', { mode: 'boolean' }).notNull(),
  queueAddedAt: text('queue_added_at'),
  inFeed: integer('in_feed', { mode: 'boolean' }).notNull(),
  feedArrivedAt: text('feed_arrived_at'),
  currentLocation: text('current_location').notNull(),
  currentAvailable: integer('current_available', { mode: 'boolean' }).notNull(),
  tagCount: integer('tag_count').notNull(),
  activeHighlightCount: integer('active_highlight_count').notNull(),
  contentAvailable: integer('content_available', { mode: 'boolean' }).notNull(),
  sourceRefreshedAt: text('source_refreshed_at').notNull(),
  projectionVersion: integer('projection_version').notNull(),
})

export const articleContentManifests = sqliteTable('article_content_manifests', {
  id: text('id').primaryKey(),
  readwiseDocumentId: text('readwise_document_id')
    .notNull()
    .references(() => readwiseDocuments.id),
  mediaItemId: text('media_item_id')
    .notNull()
    .references(() => mediaItems.id),
  contentKind: text('content_kind', { enum: ['reader_html'] }).notNull(),
  rawObjectKey: text('raw_object_key').notNull(),
  rawSha256: text('raw_sha256').notNull(),
  extractedObjectKey: text('extracted_object_key').notNull(),
  extractedSha256: text('extracted_sha256').notNull(),
  sourceUpdatedAt: text('source_updated_at'),
  extractionVersion: integer('extraction_version').notNull(),
  state: text('state', { enum: ['pending', 'ready', 'failed', 'expired'] }).notNull(),
  coverage: text('coverage', { enum: ['full', 'partial'] }).notNull(),
  language: text('language'),
  acquiredAt: text('acquired_at').notNull(),
  processedAt: text('processed_at'),
  policyVersion: integer('policy_version').notNull(),
  failureClass: text('failure_class'),
})

export const articleContentChunks = sqliteTable(
  'article_content_chunks',
  {
    manifestId: text('manifest_id')
      .notNull()
      .references(() => articleContentManifests.id),
    ordinal: integer('ordinal').notNull(),
    byteStart: integer('byte_start').notNull(),
    byteLength: integer('byte_length').notNull(),
    sha256: text('sha256').notNull(),
  },
  (table) => [primaryKey({ columns: [table.manifestId, table.ordinal] })],
)

export const articleContentSearchMap = sqliteTable(
  'article_content_search_map',
  {
    rowid: integer('rowid').primaryKey({ autoIncrement: true }),
    manifestId: text('manifest_id')
      .notNull()
      .references(() => articleContentManifests.id),
    chunkOrdinal: integer('chunk_ordinal').notNull(),
  },
  (table) => [
    uniqueIndex('article_content_search_map_chunk_unique').on(table.manifestId, table.chunkOrdinal),
  ],
)

export const articleContentJobs = sqliteTable('article_content_jobs', {
  idempotencyKey: text('idempotency_key').primaryKey(),
  connectionId: text('connection_id')
    .notNull()
    .references(() => connections.id),
  readwiseDocumentId: text('readwise_document_id')
    .notNull()
    .references(() => readwiseDocuments.id),
  documentId: text('document_id').notNull(),
  sourceUpdatedAt: text('source_updated_at'),
  reservationId: text('reservation_id').notNull(),
  status: text('status', { enum: ['pending', 'completed', 'failed'] }).notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at'),
  lastAttemptAt: text('last_attempt_at'),
  attemptCount: integer('attempt_count').notNull().default(0),
  completedAt: text('completed_at'),
  failureClass: text('failure_class'),
})

export const articleContentRawAcquisitions = sqliteTable(
  'article_content_raw_acquisitions',
  {
    id: text('id').primaryKey(),
    idempotencyKey: text('idempotency_key')
      .notNull()
      .references(() => articleContentJobs.idempotencyKey, { onDelete: 'restrict' }),
    attemptNumber: integer('attempt_number').notNull(),
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id),
    readwiseDocumentId: text('readwise_document_id')
      .notNull()
      .references(() => readwiseDocuments.id),
    storageKey: text('storage_key').notNull(),
    sha256: text('sha256').notNull(),
    contentType: text('content_type').notNull(),
    byteLength: integer('byte_length').notNull(),
    acquiredAt: text('acquired_at').notNull(),
    processingStatus: text('processing_status', {
      enum: ['pending', 'processed', 'failed'],
    }).notNull(),
    processingError: text('processing_error'),
  },
  (table) => [
    uniqueIndex('article_content_raw_acquisitions_job_attempt_unique').on(
      table.idempotencyKey,
      table.attemptNumber,
    ),
    index('article_content_raw_acquisitions_document_idx').on(
      table.readwiseDocumentId,
      table.acquiredAt,
    ),
    check('article_content_raw_acquisitions_attempt_positive', sql`${table.attemptNumber} > 0`),
  ],
)

export const spotifyPodcastEpisodes = sqliteTable(
  'spotify_podcast_episodes',
  {
    mediaItemId: text('media_item_id')
      .primaryKey()
      .references(() => mediaItems.id, { onDelete: 'restrict' }),
    spotifyEpisodeUri: text('spotify_episode_uri').notNull(),
    spotifyEpisodeId: text('spotify_episode_id').notNull(),
    showId: text('show_id'),
    showUri: text('show_uri'),
    currentTitle: text('current_title'),
    historicalTitle: text('historical_title'),
    showName: text('show_name'),
    description: text('description'),
    imageUrl: text('image_url'),
    canonicalUrl: text('canonical_url'),
    publishedAtValue: text('published_at_value'),
    publishedAtPrecision: text('published_at_precision'),
    durationMs: integer('duration_ms'),
    availabilityState: text('availability_state').notNull().default('unknown'),
    metadataObservedAt: text('metadata_observed_at'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('spotify_podcast_episode_uri_unique').on(table.spotifyEpisodeUri)],
)

export const spotifyPodcastPlaybackObservations = sqliteTable(
  'spotify_podcast_playback_observations',
  {
    id: text('id').primaryKey(),
    sourceRecordId: text('source_record_id')
      .notNull()
      .unique()
      .references(() => sourceRecords.id, { onDelete: 'restrict' }),
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'restrict' }),
    mediaItemId: text('media_item_id').references(() => mediaItems.id, { onDelete: 'restrict' }),
    spotifyEpisodeUri: text('spotify_episode_uri'),
    occurredAt: text('occurred_at'),
    millisecondsPlayed: integer('milliseconds_played').notNull(),
    positive: integer('positive', { mode: 'boolean' }).notNull(),
    episodeTitle: text('episode_title'),
    showName: text('show_name'),
    reasonStart: text('reason_start'),
    reasonEnd: text('reason_end'),
    skipped: integer('skipped', { mode: 'boolean' }),
    parserVersion: text('parser_version').notNull(),
  },
)

export const spotifySavedEpisodes = sqliteTable(
  'spotify_saved_episodes',
  {
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'restrict' }),
    spotifyEpisodeUri: text('spotify_episode_uri').notNull(),
    mediaItemId: text('media_item_id').references(() => mediaItems.id, { onDelete: 'restrict' }),
    sourceRecordId: text('source_record_id')
      .notNull()
      .references(() => sourceRecords.id, { onDelete: 'restrict' }),
    addedAt: text('added_at'),
    resumePositionMs: integer('resume_position_ms'),
    fullyPlayed: integer('fully_played', { mode: 'boolean' }),
    active: integer('active', { mode: 'boolean' }).notNull(),
    firstObservedAt: text('first_observed_at').notNull(),
    lastObservedAt: text('last_observed_at').notNull(),
    retiredObservedAt: text('retired_observed_at'),
  },
  (table) => [primaryKey({ columns: [table.connectionId, table.spotifyEpisodeUri] })],
)

export const spotifyPodcastShows = sqliteTable('spotify_podcast_shows', {
  id: text('id').primaryKey(),
  spotifyShowUri: text('spotify_show_uri').notNull().unique(),
  spotifyShowId: text('spotify_show_id').notNull(),
  name: text('name'),
  publisher: text('publisher'),
  description: text('description'),
  imageUrl: text('image_url'),
  canonicalUrl: text('canonical_url'),
  languagesJson: text('languages_json').notNull().default('[]'),
  totalEpisodes: integer('total_episodes'),
  availabilityState: text('availability_state').notNull().default('unknown'),
  metadataObservedAt: text('metadata_observed_at'),
  updatedAt: text('updated_at').notNull(),
})

export const spotifySavedShows = sqliteTable(
  'spotify_saved_shows',
  {
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'restrict' }),
    showId: text('show_id')
      .notNull()
      .references(() => spotifyPodcastShows.id, { onDelete: 'restrict' }),
    sourceRecordId: text('source_record_id')
      .notNull()
      .references(() => sourceRecords.id, { onDelete: 'restrict' }),
    addedAt: text('added_at'),
    active: integer('active', { mode: 'boolean' }).notNull(),
    firstObservedAt: text('first_observed_at').notNull(),
    lastObservedAt: text('last_observed_at').notNull(),
    retiredObservedAt: text('retired_observed_at'),
  },
  (table) => [primaryKey({ columns: [table.connectionId, table.showId] })],
)

export const spotifyPlayerObservations = sqliteTable('spotify_player_observations', {
  id: text('id').primaryKey(),
  sourceRecordId: text('source_record_id').references(() => sourceRecords.id, {
    onDelete: 'restrict',
  }),
  connectionId: text('connection_id')
    .notNull()
    .references(() => connections.id, { onDelete: 'restrict' }),
  mediaItemId: text('media_item_id').references(() => mediaItems.id, { onDelete: 'restrict' }),
  itemType: text('item_type'),
  itemUri: text('item_uri'),
  progressMs: integer('progress_ms'),
  isPlaying: integer('is_playing', { mode: 'boolean' }),
  sourceTimestamp: text('source_timestamp'),
  observedAt: text('observed_at').notNull(),
  empty: integer('empty', { mode: 'boolean' }).notNull(),
})

export const podcastLibraryProjection = sqliteTable('podcast_library_projection', {
  mediaItemId: text('media_item_id')
    .primaryKey()
    .references(() => mediaItems.id, { onDelete: 'restrict' }),
  spotifyEpisodeUri: text('spotify_episode_uri'),
  title: text('title'),
  showId: text('show_id'),
  showName: text('show_name'),
  imageUrl: text('image_url'),
  publishedAtValue: text('published_at_value'),
  publishedAtPrecision: text('published_at_precision'),
  durationMs: integer('duration_ms'),
  inArchive: integer('in_archive', { mode: 'boolean' }).notNull(),
  inQueue: integer('in_queue', { mode: 'boolean' }).notNull(),
  savedEpisode: integer('saved_episode', { mode: 'boolean' }).notNull(),
  followingShow: integer('following_show', { mode: 'boolean' }).notNull(),
  latestActivityAt: text('latest_activity_at'),
  savedAt: text('saved_at'),
  observedMs: integer('observed_ms').notNull().default(0),
  playbackObservationCount: integer('playback_observation_count').notNull().default(0),
  availabilityState: text('availability_state').notNull().default('unknown'),
  sourceRefreshedAt: text('source_refreshed_at').notNull(),
  projectionVersion: integer('projection_version').notNull(),
})

export const spotifySongObservations = sqliteTable('spotify_song_observations', {
  id: text('id').primaryKey(),
  sourceRecordId: text('source_record_id')
    .notNull()
    .unique()
    .references(() => sourceRecords.id, { onDelete: 'restrict' }),
  connectionId: text('connection_id')
    .notNull()
    .references(() => connections.id, { onDelete: 'restrict' }),
  mediaItemId: text('media_item_id')
    .notNull()
    .references(() => mediaItems.id, { onDelete: 'restrict' }),
  spotifyTrackUri: text('spotify_track_uri').notNull(),
  sourceKind: text('source_kind').notNull(),
  occurredAt: text('occurred_at'),
  millisecondsPlayed: integer('milliseconds_played'),
  skipped: integer('skipped', { mode: 'boolean' }),
  trackName: text('track_name'),
  artistName: text('artist_name'),
  albumName: text('album_name'),
  reasonStart: text('reason_start'),
  reasonEnd: text('reason_end'),
  parserVersion: text('parser_version').notNull(),
})

export const spotifySongTracks = sqliteTable('spotify_song_tracks', {
  mediaItemId: text('media_item_id')
    .primaryKey()
    .references(() => mediaItems.id, { onDelete: 'restrict' }),
  spotifyTrackUri: text('spotify_track_uri').notNull().unique(),
  spotifyTrackId: text('spotify_track_id').notNull(),
  title: text('title'),
  artistText: text('artist_text'),
  albumId: text('album_id'),
  albumUri: text('album_uri'),
  albumName: text('album_name'),
  imageUrl: text('image_url'),
  canonicalUrl: text('canonical_url'),
  durationMs: integer('duration_ms'),
  explicit: integer('explicit', { mode: 'boolean' }),
  isrc: text('isrc'),
  latestPlayedAt: text('latest_played_at'),
  firstPlayedAt: text('first_played_at'),
  playbackCount: integer('playback_count').notNull().default(0),
  observedMs: integer('observed_ms').notNull().default(0),
  apiOnlyCount: integer('api_only_count').notNull().default(0),
  metadataState: text('metadata_state').notNull().default('export_only'),
  metadataObservedAt: text('metadata_observed_at'),
  updatedAt: text('updated_at').notNull(),
})

export const spotifySongAlbums = sqliteTable('spotify_song_albums', {
  id: text('id').primaryKey(),
  spotifyAlbumUri: text('spotify_album_uri').notNull().unique(),
  spotifyAlbumId: text('spotify_album_id').notNull(),
  name: text('name'),
  artistText: text('artist_text'),
  albumType: text('album_type'),
  releaseDateValue: text('release_date_value'),
  releaseDatePrecision: text('release_date_precision'),
  imageUrl: text('image_url'),
  canonicalUrl: text('canonical_url'),
  metadataObservedAt: text('metadata_observed_at'),
  updatedAt: text('updated_at').notNull(),
})

export const spotifySongArtists = sqliteTable('spotify_song_artists', {
  id: text('id').primaryKey(),
  spotifyArtistUri: text('spotify_artist_uri').notNull().unique(),
  spotifyArtistId: text('spotify_artist_id').notNull(),
  name: text('name'),
  canonicalUrl: text('canonical_url'),
  metadataObservedAt: text('metadata_observed_at'),
  updatedAt: text('updated_at').notNull(),
})

export const spotifySongTrackArtists = sqliteTable(
  'spotify_song_track_artists',
  {
    mediaItemId: text('media_item_id')
      .notNull()
      .references(() => mediaItems.id, { onDelete: 'restrict' }),
    artistId: text('artist_id')
      .notNull()
      .references(() => spotifySongArtists.id, { onDelete: 'restrict' }),
    creditOrder: integer('credit_order').notNull(),
  },
  (table) => [primaryKey({ columns: [table.mediaItemId, table.artistId] })],
)

export const youtubeTakeoutComponents = sqliteTable(
  'youtube_takeout_components',
  {
    rawObjectId: text('raw_object_id')
      .notNull()
      .references(() => rawObjects.id, { onDelete: 'restrict' }),
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'restrict' }),
    componentKind: text('component_kind', {
      enum: ['watch_history', 'watch_later', 'playlist_index', 'subscriptions'],
    }).notNull(),
    memberName: text('member_name'),
    parserVersion: text('parser_version').notNull(),
    status: text('status', {
      enum: ['missing', 'invalid', 'processing', 'complete', 'failed'],
    }).notNull(),
    expectedRecordCount: integer('expected_record_count').notNull(),
    processedRecordCount: integer('processed_record_count').notNull(),
    syncRunId: text('sync_run_id').references(() => syncRuns.id, { onDelete: 'restrict' }),
    completedAt: text('completed_at'),
    finalizedAt: text('finalized_at'),
    errorCode: text('error_code'),
  },
  (table) => [primaryKey({ columns: [table.rawObjectId, table.componentKind] })],
)

export const youtubeChannels = sqliteTable('youtube_channels', {
  channelId: text('channel_id').primaryKey(),
  latestTitle: text('latest_title'),
  latestUrl: text('latest_url'),
  firstObservedAt: text('first_observed_at').notNull(),
  lastObservedAt: text('last_observed_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const youtubeChannelAssertions = sqliteTable('youtube_channel_assertions', {
  sourceRecordId: text('source_record_id')
    .primaryKey()
    .references(() => sourceRecords.id, { onDelete: 'restrict' }),
  channelId: text('channel_id')
    .notNull()
    .references(() => youtubeChannels.channelId, { onDelete: 'restrict' }),
  connectionId: text('connection_id')
    .notNull()
    .references(() => connections.id, { onDelete: 'restrict' }),
  assertionKind: text('assertion_kind', { enum: ['watch', 'subscription'] }).notNull(),
  title: text('title'),
  url: text('url'),
  observedAt: text('observed_at').notNull(),
})

export const youtubeWatchObservations = sqliteTable('youtube_watch_observations', {
  sourceRecordId: text('source_record_id')
    .primaryKey()
    .references(() => sourceRecords.id, { onDelete: 'restrict' }),
  archiveEntryId: text('archive_entry_id')
    .notNull()
    .references(() => archiveEntries.id, { onDelete: 'restrict' }),
  connectionId: text('connection_id')
    .notNull()
    .references(() => connections.id, { onDelete: 'restrict' }),
  mediaItemId: text('media_item_id')
    .notNull()
    .references(() => mediaItems.id, { onDelete: 'restrict' }),
  videoId: text('video_id').notNull(),
  historicalTitle: text('historical_title'),
  sourceVideoUrl: text('source_video_url'),
  historicalChannelTitle: text('historical_channel_title'),
  sourceChannelUrl: text('source_channel_url'),
  channelId: text('channel_id').references(() => youtubeChannels.channelId, {
    onDelete: 'restrict',
  }),
  product: text('product', { enum: ['youtube', 'youtube_music', 'unknown'] }).notNull(),
  fromGoogleAds: integer('from_google_ads', { mode: 'boolean' }).notNull(),
  occurredAt: text('occurred_at').notNull(),
  occurredAtRaw: text('occurred_at_raw'),
  occurrenceRank: integer('occurrence_rank').notNull(),
  parserVersion: text('parser_version').notNull(),
  observedAt: text('observed_at').notNull(),
})

export const youtubeChannelSubscriptions = sqliteTable(
  'youtube_channel_subscriptions',
  {
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'restrict' }),
    channelId: text('channel_id')
      .notNull()
      .references(() => youtubeChannels.channelId, { onDelete: 'restrict' }),
    sourceRecordId: text('source_record_id')
      .notNull()
      .references(() => sourceRecords.id, { onDelete: 'restrict' }),
    providerSubscriptionId: text('provider_subscription_id'),
    channelTitle: text('channel_title'),
    channelUrl: text('channel_url'),
    subscribedAt: text('subscribed_at'),
    sourceKind: text('source_kind', { enum: ['takeout', 'oauth'] }).notNull(),
    upstreamState: text('upstream_state', { enum: upstreamStates }).notNull(),
    firstObservedAt: text('first_observed_at').notNull(),
    lastObservedAt: text('last_observed_at').notNull(),
    retiredObservedAt: text('retired_observed_at'),
    parserVersion: text('parser_version').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.connectionId, table.channelId] })],
)

export const videoLibraryProjection = sqliteTable('video_library_projection', {
  mediaItemId: text('media_item_id')
    .primaryKey()
    .references(() => mediaItems.id, { onDelete: 'restrict' }),
  videoId: text('video_id').notNull().unique(),
  displayTitle: text('display_title').notNull(),
  normalizedTitle: text('normalized_title').notNull(),
  channelId: text('channel_id').references(() => youtubeChannels.channelId, {
    onDelete: 'restrict',
  }),
  displayChannelTitle: text('display_channel_title'),
  normalizedChannelTitle: text('normalized_channel_title'),
  canonicalUrl: text('canonical_url').notNull(),
  imageUrl: text('image_url'),
  publishedAt: text('published_at'),
  durationMs: integer('duration_ms'),
  availabilityState: text('availability_state').notNull(),
  metadataState: text('metadata_state').notNull(),
  sourceFormat: text('source_format').notNull(),
  archiveActive: integer('archive_active', { mode: 'boolean' }).notNull(),
  watchOccurrenceCount: integer('watch_occurrence_count').notNull(),
  watchAccountCount: integer('watch_account_count').notNull(),
  latestWatchedAt: text('latest_watched_at'),
  queueActive: integer('queue_active', { mode: 'boolean' }).notNull(),
  queueRelationshipCount: integer('queue_relationship_count').notNull(),
  queueAccountCount: integer('queue_account_count').notNull(),
  latestQueueAddedAt: text('latest_queue_added_at'),
  projectionGeneration: integer('projection_generation').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const videoChannelProjection = sqliteTable('video_channel_projection', {
  channelId: text('channel_id')
    .primaryKey()
    .references(() => youtubeChannels.channelId, { onDelete: 'restrict' }),
  displayTitle: text('display_title').notNull(),
  normalizedTitle: text('normalized_title').notNull(),
  canonicalUrl: text('canonical_url').notNull(),
  imageUrl: text('image_url'),
  libraryActive: integer('library_active', { mode: 'boolean' }).notNull(),
  followingActive: integer('following_active', { mode: 'boolean' }).notNull(),
  subscriptionCount: integer('subscription_count').notNull(),
  archiveVideoCount: integer('archive_video_count').notNull(),
  watchOccurrenceCount: integer('watch_occurrence_count').notNull(),
  latestWatchedAt: text('latest_watched_at'),
  queueVideoCount: integer('queue_video_count').notNull(),
  projectionGeneration: integer('projection_generation').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const schema = {
  archiveEntries,
  archiveEntryEvidence,
  articleLibraryProjection,
  articleContentChunks,
  articleContentManifests,
  articleContentJobs,
  articleContentRawAcquisitions,
  articleContentSearchMap,
  bookIdentifiers,
  bookLibraryProjection,
  connections,
  externalIdentities,
  hardcoverBookEditions,
  hardcoverBookWorks,
  hardcoverContributors,
  hardcoverEditionContributors,
  hardcoverSeries,
  hardcoverUserBookReads,
  hardcoverUserBooks,
  hardcoverWorkContributors,
  hardcoverWorkSeries,
  hardcoverWorkTaxonomy,
  letterboxdMovieState,
  letterboxdMovieViewings,
  mediaItems,
  movieLibraryProjection,
  queueEntries,
  queueEntryEvidence,
  rawObjects,
  readwiseDocumentTags,
  readwiseDocuments,
  readwiseHighlightContainers,
  readwiseHighlights,
  readwiseProjectionState,
  readwiseTags,
  sourceRecords,
  sources,
  spotifyPlayerObservations,
  spotifyPodcastEpisodes,
  spotifyPodcastPlaybackObservations,
  spotifyPodcastShows,
  spotifySavedEpisodes,
  spotifySavedShows,
  podcastLibraryProjection,
  spotifySongAlbums,
  spotifySongArtists,
  spotifySongObservations,
  spotifySongTrackArtists,
  spotifySongTracks,
  syncCursors,
  syncRuns,
  videoChannelProjection,
  videoLibraryProjection,
  youtubeChannelAssertions,
  youtubeChannelSubscriptions,
  youtubeChannels,
  youtubeTakeoutComponents,
  youtubeWatchObservations,
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
