import { readFileSync } from 'node:fs'
import { DatabaseSync, type StatementSync } from 'node:sqlite'

import {
  archiveEntryEvidenceId,
  archiveEntryId,
  connectionId,
  externalIdentityId,
  mediaItemId,
  rawObjectId,
  sourceRecordId,
  syncCursorId,
  syncRunId,
  temporalInstant,
  utcInstant,
  sourceRating,
  type ArchiveEntry,
  type ArchiveEntryEvidence,
  type ExternalIdentity,
  type MediaItem,
  type RawObject,
  type SourceConnection,
  type SourceRecord,
  type SyncCursor,
  type SyncRun,
} from '@media-tracker/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  DatabaseAllResult,
  DatabaseClient,
  DatabaseRunResult,
  DatabaseStatement,
  DatabaseValue,
} from './database'
import { SqlCanonicalLedgerRepository } from './repository'

const migration = readFileSync(
  new URL('../migrations/0001_canonical_ledger.sql', import.meta.url),
  'utf8',
)
const now = utcInstant('2026-09-12T20:00:00Z')
const later = utcInstant('2026-09-12T21:00:00Z')

class SqliteStatement implements DatabaseStatement {
  readonly #statement: StatementSync
  #values: readonly DatabaseValue[] = []

  constructor(statement: StatementSync) {
    this.#statement = statement
  }

  bind(...values: readonly DatabaseValue[]): DatabaseStatement {
    this.#values = values
    return this
  }

  async run(): Promise<DatabaseRunResult> {
    this.execute()
    return { success: true }
  }

  async first<Row>(): Promise<Row | null> {
    const row = this.#statement.get(
      ...this.#values.map((value) =>
        value instanceof ArrayBuffer ? new Uint8Array(value) : value,
      ),
    )
    return (row as Row | undefined) ?? null
  }

  async all<Row>(): Promise<DatabaseAllResult<Row>> {
    const results = this.#statement.all(
      ...this.#values.map((value) =>
        value instanceof ArrayBuffer ? new Uint8Array(value) : value,
      ),
    ) as Row[]
    return { results, success: true }
  }

  execute(): void {
    this.#statement.run(
      ...this.#values.map((value) =>
        value instanceof ArrayBuffer ? new Uint8Array(value) : value,
      ),
    )
  }
}

class SqliteClient implements DatabaseClient {
  readonly #database: DatabaseSync

  constructor(database: DatabaseSync) {
    this.#database = database
  }

  prepare(query: string): DatabaseStatement {
    return new SqliteStatement(this.#database.prepare(query))
  }

  async batch(statements: readonly DatabaseStatement[]): Promise<readonly DatabaseRunResult[]> {
    this.#database.exec('BEGIN IMMEDIATE')
    try {
      for (const statement of statements) (statement as SqliteStatement).execute()
      this.#database.exec('COMMIT')
      return statements.map(() => ({ success: true }))
    } catch (error) {
      this.#database.exec('ROLLBACK')
      throw error
    }
  }
}

function count(database: DatabaseSync, table: string): number {
  const row = database.prepare(`SELECT count(*) AS count FROM ${table}`).get() as {
    count: number
  }
  return row.count
}

function fixtures() {
  const connection: SourceConnection = {
    id: connectionId('connection-spotify'),
    source: 'spotify',
    label: 'Spotify export',
    status: 'connected',
    coverage: 'partial',
    createdAt: now,
    updatedAt: now,
  }
  const runningSyncRun: SyncRun = {
    id: syncRunId('sync-run-1'),
    connectionId: connection.id,
    kind: 'import',
    status: 'running',
    startedAt: now,
    finishedAt: null,
    counts: { rawObjects: 0, sourceRecords: 0, normalizedRecords: 0, failedRecords: 0 },
    errorCode: null,
    errorMessage: null,
  }
  const succeededSyncRun: SyncRun = {
    ...runningSyncRun,
    status: 'succeeded',
    finishedAt: later,
    counts: { rawObjects: 1, sourceRecords: 1, normalizedRecords: 1, failedRecords: 0 },
  }
  const rawObject: RawObject = {
    id: rawObjectId('raw-1'),
    connectionId: connection.id,
    syncRunId: runningSyncRun.id,
    kind: 'export',
    acquisitionKey: 'spotify-export:synthetic-1',
    storageKey: 'raw/spotify/synthetic-1.json',
    sha256: 'a'.repeat(64),
    contentType: 'application/json',
    byteLength: 100,
    acquiredAt: now,
    processingStatus: 'processed',
    lastParserVersion: 'spotify-history@1',
    processingError: null,
  }
  const sourceRecord: SourceRecord = {
    id: sourceRecordId('record-1'),
    rawObjectId: rawObject.id,
    connectionId: connection.id,
    recordType: 'streaming_history_row',
    recordPath: '$[0]',
    sourceRecordKey: 'episode:spotify:episode:synthetic',
    sourceRecordedAt: temporalInstant('2026-09-10T20:00:00Z'),
    observedAt: now,
    parserVersion: 'spotify-history@1',
    contentSha256: 'b'.repeat(64),
    disposition: 'normalized',
    upstreamState: 'active',
    errorCode: null,
  }
  const mediaItem: MediaItem = {
    id: mediaItemId('media-1'),
    type: 'podcast_episode',
    title: 'Synthetic episode',
    subtitle: null,
    primaryCreatorName: 'Synthetic show',
    description: null,
    canonicalUrl: null,
    imageUrl: null,
    publishedAt: null,
    durationMs: 3_600_000,
    createdAt: now,
    updatedAt: now,
  }
  const identity: ExternalIdentity = {
    id: externalIdentityId('identity-1'),
    mediaItemId: mediaItem.id,
    namespace: 'spotify',
    externalType: 'episode_uri',
    externalId: 'spotify:episode:synthetic',
    scope: { kind: 'global' },
    canonicalUrl: null,
    firstObservedSourceRecordId: sourceRecord.id,
    lastObservedSourceRecordId: sourceRecord.id,
    retiredAt: null,
  }
  const archiveEntry: ArchiveEntry = {
    id: archiveEntryId('archive-1'),
    mediaItemId: mediaItem.id,
    connectionId: connection.id,
    consumedIdentityId: identity.id,
    sourceOccurrenceKey: 'spotify:episode:synthetic',
    admissionReason: 'spotify_positive_playback',
    consumedAt: temporalInstant('2026-09-10T20:00:00Z'),
    sourceRecordedAt: temporalInstant('2026-09-10T20:00:00Z'),
    sourceRating: null,
    reviewText: null,
    upstreamState: 'active',
    createdAt: now,
    updatedAt: now,
  }
  const evidence: ArchiveEntryEvidence = {
    id: archiveEntryEvidenceId('evidence-1'),
    archiveEntryId: archiveEntry.id,
    sourceRecordId: sourceRecord.id,
    role: 'admission',
    linkedAt: now,
  }
  const cursor: SyncCursor = {
    id: syncCursorId('cursor-1'),
    connectionId: connection.id,
    name: 'export-file',
    checkpoint: { filename: 'synthetic-1.json' },
    committedAt: later,
    syncRunId: succeededSyncRun.id,
  }

  return {
    archiveEntry,
    connection,
    cursor,
    evidence,
    identity,
    mediaItem,
    rawObject,
    runningSyncRun,
    sourceRecord,
    succeededSyncRun,
  }
}

describe('canonical ledger migration and repository', () => {
  let database: DatabaseSync
  let repository: SqlCanonicalLedgerRepository

  beforeEach(() => {
    database = new DatabaseSync(':memory:')
    database.exec(migration)
    database.exec(
      readFileSync(
        new URL('../migrations/0027_compact_archive_evidence.sql', import.meta.url),
        'utf8',
      ),
    )
    database.exec(
      readFileSync(
        new URL('../migrations/0022_spotify_catalog_backfill.sql', import.meta.url),
        'utf8',
      ),
    )
    repository = new SqlCanonicalLedgerRepository(new SqliteClient(database))
  })

  afterEach(() => {
    database.close()
    vi.useRealTimers()
  })

  it('reports durable catalog progress and expired worker leases without rewriting the run', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-13T12:00:00Z'))
    const data = fixtures()
    await repository.saveConnection(data.connection)
    await repository.saveSyncRun(data.runningSyncRun)
    database.exec(`INSERT INTO spotify_catalog_backfill_jobs(
      id,connection_id,sync_run_id,state,phase,requested_count,returned_count,unavailable_count,
      lease_expires_at,created_at,updated_at)
      VALUES('catalog','connection-spotify','sync-run-1','running','tracks',12,10,2,
        '2026-09-13T11:00:00Z','2026-09-12T20:00:00Z','2026-09-13T10:55:00Z')`)
    const page = await repository.listSyncRuns(10)
    expect(page.data[0]).toMatchObject({
      status: 'running',
      sourceRecords: 10,
      normalizedRecords: 10,
      catalogProgress: {
        state: 'awaiting_worker',
        requestedCount: 12,
        returnedCount: 10,
        unavailableCount: 2,
        lastActivityAt: '2026-09-13T10:55:00Z',
        nextAttemptAt: null,
      },
    })
    expect(database.prepare('SELECT status,source_record_count FROM sync_runs').get()).toEqual({
      status: 'running',
      source_record_count: 0,
    })

    database.exec(
      "UPDATE spotify_catalog_backfill_jobs SET lease_expires_at='2026-09-13T12:05:00Z'",
    )
    expect((await repository.listSyncRuns(10)).data[0]?.catalogProgress?.state).toBe('running')
    database.exec(
      "UPDATE spotify_catalog_backfill_jobs SET state='pending',lease_expires_at=NULL,next_attempt_at='2026-09-13T12:15:00Z'",
    )
    expect((await repository.listSyncRuns(10)).data[0]?.catalogProgress?.state).toBe('waiting')
    database.exec("UPDATE spotify_catalog_backfill_jobs SET state='succeeded'")
    expect((await repository.listSyncRuns(10)).data[0]?.catalogProgress?.state).toBe('succeeded')
    database.exec('DELETE FROM spotify_catalog_backfill_jobs')
    expect((await repository.listSyncRuns(10)).data[0]).not.toHaveProperty('catalogProgress')
  })

  it('applies from an empty database and seeds stable sources', () => {
    const rows = database.prepare('SELECT source FROM sources ORDER BY source').all()
    expect(rows).toEqual([
      { source: 'hardcover' },
      { source: 'letterboxd' },
      { source: 'readwise' },
      { source: 'spotify' },
      { source: 'youtube' },
    ])
  })

  it('commits and replays a normalized occurrence without duplicates', async () => {
    const data = fixtures()
    await repository.saveConnection(data.connection)
    await repository.saveSyncRun(data.runningSyncRun)

    const batch = {
      syncRun: data.succeededSyncRun,
      rawObjects: [data.rawObject],
      sourceRecords: [data.sourceRecord],
      mediaItems: [data.mediaItem],
      externalIdentities: [data.identity],
      archiveEntries: [{ entry: data.archiveEntry, evidence: [data.evidence] }],
      cursor: data.cursor,
    } as const

    await repository.commit(batch)
    await repository.commit(batch)

    expect(count(database, 'raw_objects')).toBe(1)
    expect(count(database, 'source_records')).toBe(1)
    expect(count(database, 'media_items')).toBe(1)
    expect(count(database, 'external_identities')).toBe(1)
    expect(count(database, 'archive_entries')).toBe(1)
    expect(count(database, 'archive_entry_evidence')).toBe(1)
    expect(count(database, 'sync_cursors')).toBe(1)

    await expect(
      repository.findRawObjectId(data.connection.id, data.rawObject.acquisitionKey),
    ).resolves.toBe(data.rawObject.id)
    await expect(
      repository.findSourceRecordId(
        data.rawObject.id,
        data.sourceRecord.parserVersion,
        data.sourceRecord.recordPath,
      ),
    ).resolves.toBe(data.sourceRecord.id)
    await expect(
      repository.findExternalIdentity({
        namespace: data.identity.namespace,
        externalType: data.identity.externalType,
        externalId: data.identity.externalId,
        connectionId: null,
      }),
    ).resolves.toEqual({ id: data.identity.id, mediaItemId: data.mediaItem.id })
    await expect(
      repository.findArchiveEntryId(data.connection.id, data.archiveEntry.sourceOccurrenceKey),
    ).resolves.toBe(data.archiveEntry.id)
    await expect(repository.findSyncCursor(data.connection.id, data.cursor.name)).resolves.toEqual(
      data.cursor,
    )
    await expect(repository.findConnectionBySource('spotify')).resolves.toEqual(data.connection)
    await expect(repository.findLastSuccessfulSyncAt(data.connection.id)).resolves.toBe(
      data.succeededSyncRun.finishedAt,
    )
    await expect(repository.listMedia()).resolves.toEqual([
      { id: data.mediaItem.id, type: data.mediaItem.type, title: data.mediaItem.title },
    ])
    await expect(repository.findMedia(data.mediaItem.id)).resolves.toEqual({
      id: data.mediaItem.id,
      type: data.mediaItem.type,
      title: data.mediaItem.title,
    })

    const archive = database
      .prepare(
        `SELECT consumed_at_precision, consumed_at_basis
         FROM archive_entries WHERE id = ?`,
      )
      .get(data.archiveEntry.id)
    expect(archive).toEqual({
      consumed_at_basis: 'source_asserted',
      consumed_at_precision: 'instant',
    })
  })

  it('preserves pair-role evidence on replay and rejects an ID reused for another pair atomically', async () => {
    const data = fixtures()
    await repository.saveConnection(data.connection)
    await repository.saveSyncRun(data.runningSyncRun)
    await repository.commit({
      syncRun: data.succeededSyncRun,
      rawObjects: [data.rawObject],
      sourceRecords: [data.sourceRecord],
      mediaItems: [data.mediaItem],
      externalIdentities: [data.identity],
      archiveEntries: [{ entry: data.archiveEntry, evidence: [data.evidence] }],
    })
    const original = database.prepare('SELECT * FROM archive_entry_evidence').all()
    await repository.commit({
      archiveEntries: [
        {
          entry: data.archiveEntry,
          evidence: [
            {
              ...data.evidence,
              id: archiveEntryEvidenceId('replayed-different-id'),
              linkedAt: later,
            },
          ],
        },
      ],
    })
    expect(database.prepare('SELECT * FROM archive_entry_evidence').all()).toEqual(original)
    const otherEntry = {
      ...data.archiveEntry,
      id: archiveEntryId('other-archive'),
      sourceOccurrenceKey: 'other-occurrence',
    }
    await expect(
      repository.commit({
        archiveEntries: [
          {
            entry: otherEntry,
            evidence: [{ ...data.evidence, archiveEntryId: otherEntry.id }],
          },
        ],
      }),
    ).rejects.toThrow('UNIQUE')
    expect(count(database, 'archive_entries')).toBe(1)
    expect(database.prepare('SELECT * FROM archive_entry_evidence').all()).toEqual(original)
  })

  it('adds new evidence to an existing occurrence without replacing its lineage', async () => {
    const data = fixtures()
    await repository.saveConnection(data.connection)
    await repository.saveSyncRun(data.runningSyncRun)
    await repository.commit({
      syncRun: data.succeededSyncRun,
      rawObjects: [data.rawObject],
      sourceRecords: [data.sourceRecord],
      mediaItems: [data.mediaItem],
      externalIdentities: [data.identity],
      archiveEntries: [{ entry: data.archiveEntry, evidence: [data.evidence] }],
    })

    const rawObject: RawObject = {
      ...data.rawObject,
      id: rawObjectId('raw-2'),
      acquisitionKey: 'spotify-export:synthetic-2',
      storageKey: 'raw/spotify/synthetic-2.json',
      sha256: 'c'.repeat(64),
      acquiredAt: later,
    }
    const sourceRecord: SourceRecord = {
      ...data.sourceRecord,
      id: sourceRecordId('record-2'),
      rawObjectId: rawObject.id,
      observedAt: later,
    }
    const identity: ExternalIdentity = {
      ...data.identity,
      lastObservedSourceRecordId: sourceRecord.id,
    }
    const evidence: ArchiveEntryEvidence = {
      ...data.evidence,
      id: archiveEntryEvidenceId('evidence-2'),
      sourceRecordId: sourceRecord.id,
      linkedAt: later,
    }

    await repository.commit({
      rawObjects: [rawObject],
      sourceRecords: [sourceRecord],
      mediaItems: [{ ...data.mediaItem, title: null, durationMs: null, updatedAt: later }],
      externalIdentities: [identity],
      archiveEntries: [
        {
          entry: { ...data.archiveEntry, consumedAt: null, updatedAt: later },
          evidence: [evidence],
        },
      ],
    })

    expect(count(database, 'archive_entries')).toBe(1)
    expect(count(database, 'archive_entry_evidence')).toBe(2)
    expect(
      database
        .prepare('SELECT last_observed_source_record_id FROM external_identities WHERE id = ?')
        .get(identity.id),
    ).toEqual({ last_observed_source_record_id: sourceRecord.id })
    expect(
      database
        .prepare('SELECT title, duration_ms FROM media_items WHERE id = ?')
        .get(data.mediaItem.id),
    ).toEqual({
      duration_ms: data.mediaItem.durationMs,
      title: data.mediaItem.title,
    })
    expect(
      database
        .prepare('SELECT consumed_at_value FROM archive_entries WHERE id = ?')
        .get(data.archiveEntry.id),
    ).toEqual({ consumed_at_value: data.archiveEntry.consumedAt?.value })
  })

  it('links cross-provider identities while keeping occurrences and provenance connection-scoped', async () => {
    const data = fixtures()
    await repository.saveConnection(data.connection)
    await repository.saveSyncRun(data.runningSyncRun)
    await repository.commit({
      syncRun: data.succeededSyncRun,
      rawObjects: [data.rawObject],
      sourceRecords: [data.sourceRecord],
      mediaItems: [data.mediaItem],
      externalIdentities: [data.identity],
      archiveEntries: [{ entry: data.archiveEntry, evidence: [data.evidence] }],
    })

    const secondConnection: SourceConnection = {
      ...data.connection,
      id: connectionId('connection-readwise'),
      source: 'readwise',
      label: 'Reader account',
      coverage: 'complete',
    }
    const secondRun: SyncRun = {
      ...data.succeededSyncRun,
      id: syncRunId('sync-run-2'),
      connectionId: secondConnection.id,
    }
    const secondRawObject: RawObject = {
      ...data.rawObject,
      id: rawObjectId('raw-second-connection'),
      connectionId: secondConnection.id,
      syncRunId: secondRun.id,
      kind: 'api_page',
      acquisitionKey: 'reader-page:synthetic',
      storageKey: 'raw/readwise/synthetic.json',
    }
    const secondRecord: SourceRecord = {
      ...data.sourceRecord,
      id: sourceRecordId('record-second-connection'),
      rawObjectId: secondRawObject.id,
      connectionId: secondConnection.id,
      recordType: 'reader_document',
      recordPath: '$.results[0]',
      sourceRecordKey: 'reader-document:synthetic',
      parserVersion: 'readwise-documents@1',
    }
    const readerIdentity: ExternalIdentity = {
      ...data.identity,
      id: externalIdentityId('identity-readwise'),
      namespace: 'readwise',
      externalType: 'document_id',
      externalId: 'reader-document-synthetic',
      scope: { kind: 'connection', connectionId: secondConnection.id },
      firstObservedSourceRecordId: secondRecord.id,
      lastObservedSourceRecordId: secondRecord.id,
    }
    const secondEntry: ArchiveEntry = {
      ...data.archiveEntry,
      id: archiveEntryId('archive-second-connection'),
      connectionId: secondConnection.id,
      consumedIdentityId: readerIdentity.id,
      sourceOccurrenceKey: 'reader-document-synthetic',
      admissionReason: 'readwise_archive_state',
    }
    const secondEvidence: ArchiveEntryEvidence = {
      ...data.evidence,
      id: archiveEntryEvidenceId('evidence-second-connection'),
      archiveEntryId: secondEntry.id,
      sourceRecordId: secondRecord.id,
    }

    await repository.saveConnection(secondConnection)
    await repository.saveSyncRun(secondRun)
    await repository.commit({
      rawObjects: [secondRawObject],
      sourceRecords: [secondRecord],
      externalIdentities: [readerIdentity],
      archiveEntries: [{ entry: secondEntry, evidence: [secondEvidence] }],
    })

    expect(count(database, 'media_items')).toBe(1)
    expect(count(database, 'external_identities')).toBe(2)
    expect(count(database, 'archive_entries')).toBe(2)
    expect(count(database, 'archive_entry_evidence')).toBe(2)
    expect(
      database.prepare('SELECT count(DISTINCT connection_id) AS count FROM archive_entries').get(),
    ).toEqual({ count: 2 })
  })

  it('retains unknown and inferred times and source-scale ratings without conversion', async () => {
    const data = fixtures()
    await repository.saveConnection(data.connection)
    await repository.saveSyncRun(data.runningSyncRun)

    const unknownEntry: ArchiveEntry = {
      ...data.archiveEntry,
      id: archiveEntryId('archive-unknown-time'),
      sourceOccurrenceKey: 'spotify:episode:unknown-time',
      consumedAt: null,
      sourceRating: sourceRating(4.5, 0, 5),
    }
    const unknownEvidence: ArchiveEntryEvidence = {
      ...data.evidence,
      id: archiveEntryEvidenceId('evidence-unknown-time'),
      archiveEntryId: unknownEntry.id,
    }
    const inferredEntry: ArchiveEntry = {
      ...data.archiveEntry,
      id: archiveEntryId('archive-inferred-time'),
      sourceOccurrenceKey: 'spotify:episode:inferred-time',
      consumedAt: temporalInstant('2026-09-10T20:00:00Z', 'inferred'),
    }
    const inferredEvidence: ArchiveEntryEvidence = {
      ...data.evidence,
      id: archiveEntryEvidenceId('evidence-inferred-time'),
      archiveEntryId: inferredEntry.id,
    }

    await repository.commit({
      syncRun: data.succeededSyncRun,
      rawObjects: [data.rawObject],
      sourceRecords: [data.sourceRecord],
      mediaItems: [data.mediaItem],
      externalIdentities: [data.identity],
      archiveEntries: [
        { entry: unknownEntry, evidence: [unknownEvidence] },
        { entry: inferredEntry, evidence: [inferredEvidence] },
      ],
    })

    expect(
      database
        .prepare(
          `SELECT consumed_at_value, consumed_at_precision, consumed_at_basis,
                  rating_value, rating_scale_minimum, rating_scale_maximum
           FROM archive_entries WHERE id = ?`,
        )
        .get(unknownEntry.id),
    ).toEqual({
      consumed_at_basis: null,
      consumed_at_precision: null,
      consumed_at_value: null,
      rating_scale_maximum: 5,
      rating_scale_minimum: 0,
      rating_value: 4.5,
    })
    expect(
      database
        .prepare(
          'SELECT consumed_at_precision, consumed_at_basis FROM archive_entries WHERE id = ?',
        )
        .get(inferredEntry.id),
    ).toEqual({ consumed_at_basis: 'inferred', consumed_at_precision: 'instant' })
  })

  it('keeps raw evidence and links when an Archive occurrence becomes removed upstream', async () => {
    const data = fixtures()
    await repository.saveConnection(data.connection)
    await repository.saveSyncRun(data.runningSyncRun)
    await repository.commit({
      syncRun: data.succeededSyncRun,
      rawObjects: [data.rawObject],
      sourceRecords: [data.sourceRecord],
      mediaItems: [data.mediaItem],
      externalIdentities: [data.identity],
      archiveEntries: [{ entry: data.archiveEntry, evidence: [data.evidence] }],
    })

    await repository.commit({
      archiveEntries: [
        {
          entry: { ...data.archiveEntry, upstreamState: 'removed', updatedAt: later },
          evidence: [data.evidence],
        },
      ],
    })

    expect(
      database
        .prepare('SELECT upstream_state FROM archive_entries WHERE id = ?')
        .get(data.archiveEntry.id),
    ).toEqual({
      upstream_state: 'removed',
    })
    expect(count(database, 'raw_objects')).toBe(1)
    expect(count(database, 'source_records')).toBe(1)
    expect(count(database, 'archive_entry_evidence')).toBe(1)
    await expect(repository.listMedia()).resolves.toEqual([])
    await expect(repository.findMedia(data.mediaItem.id)).resolves.toBeNull()
    expect(() =>
      database.prepare('DELETE FROM raw_objects WHERE id = ?').run(data.rawObject.id),
    ).toThrow()
  })

  it('rejects Archive writes without admission evidence before touching the database', async () => {
    const data = fixtures()
    await expect(
      repository.commit({ archiveEntries: [{ entry: data.archiveEntry, evidence: [] }] }),
    ).rejects.toThrow('requires admission evidence')
    expect(count(database, 'archive_entries')).toBe(0)
  })

  it('rolls back covered writes and cursor advancement together', async () => {
    const data = fixtures()
    await repository.saveConnection(data.connection)
    await repository.saveSyncRun(data.runningSyncRun)

    const invalidRecord: SourceRecord = {
      ...data.sourceRecord,
      rawObjectId: rawObjectId('missing-raw-object'),
    }

    await expect(
      repository.commit({
        syncRun: data.succeededSyncRun,
        sourceRecords: [invalidRecord],
        cursor: data.cursor,
      }),
    ).rejects.toThrow()

    expect(count(database, 'source_records')).toBe(0)
    expect(count(database, 'sync_cursors')).toBe(0)
    expect(
      database.prepare('SELECT status FROM sync_runs WHERE id = ?').get(data.runningSyncRun.id),
    ).toEqual({
      status: 'running',
    })
  })

  it('enforces identity scope and source-connection provenance constraints', async () => {
    const data = fixtures()
    await repository.saveConnection(data.connection)
    await repository.saveSyncRun(data.runningSyncRun)
    await repository.commit({ rawObjects: [data.rawObject], sourceRecords: [data.sourceRecord] })

    expect(() =>
      database
        .prepare(
          `INSERT INTO external_identities (
            id, media_item_id, namespace, external_type, external_id, scope,
            connection_id, first_observed_source_record_id, last_observed_source_record_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'bad-identity',
          'missing-media',
          'spotify',
          'episode_uri',
          'spotify:episode:bad',
          'global',
          data.connection.id,
          data.sourceRecord.id,
          data.sourceRecord.id,
        ),
    ).toThrow()
  })
})
