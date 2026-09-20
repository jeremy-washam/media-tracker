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

export const schema = {
  archiveEntries,
  archiveEntryEvidence,
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
