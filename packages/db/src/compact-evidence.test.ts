import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const initialSchema = readFileSync(
  new URL('../migrations/0001_canonical_ledger.sql', import.meta.url),
  'utf8',
)
const compactMigration = readFileSync(
  new URL('../migrations/0027_compact_archive_evidence.sql', import.meta.url),
  'utf8',
)
const parentGuardMigration = readFileSync(
  new URL('../migrations/0028_evidence_view_parent_guard.sql', import.meta.url),
  'utf8',
)
const insertOnlyMigration = readFileSync(
  new URL('../migrations/0029_evidence_insert_only_replay.sql', import.meta.url),
  'utf8',
)
const at = '2026-01-01T00:00:00Z'
const roles = ['admission', 'occurrence_time', 'metadata', 'rating', 'review', 'removal']

function addSource(database: DatabaseSync, id: string, connection = 'connection-1') {
  database
    .prepare(
      `INSERT INTO source_records(
    id,raw_object_id,connection_id,record_type,record_path,observed_at,parser_version,
    disposition,upstream_state
  ) VALUES(?,?,?,'watch_activity',?,?,'synthetic@1','normalized','active')`,
    )
    .run(id, connection === 'connection-1' ? 'raw-1' : 'raw-2', connection, id, at)
}

function addArchive(database: DatabaseSync, id: string) {
  database
    .prepare(
      `INSERT INTO archive_entries(
    id,media_item_id,connection_id,source_occurrence_key,admission_reason,upstream_state,
    created_at,updated_at
  ) VALUES(?,'video','connection-1',?,'youtube_watched_activity','active',?,?)`,
    )
    .run(id, id, at, at)
}

function seed(database: DatabaseSync) {
  for (const number of [1, 2]) {
    database
      .prepare(
        `INSERT INTO connections(id,source,label,status,coverage,created_at,updated_at)
      VALUES(?,'youtube',?,'connected','partial',?,?)`,
      )
      .run(`connection-${number}`, `Synthetic ${number}`, at, at)
    database
      .prepare(
        `INSERT INTO sync_runs(id,connection_id,kind,status,started_at)
      VALUES(?,?,'import','succeeded',?)`,
      )
      .run(`run-${number}`, `connection-${number}`, at)
    database
      .prepare(
        `INSERT INTO raw_objects(
      id,connection_id,sync_run_id,kind,acquisition_key,storage_key,sha256,content_type,
      byte_length,acquired_at,processing_status
    ) VALUES(?,?,?,'export',?,?,'${'a'.repeat(64)}','application/json',0,?,'processed')`,
      )
      .run(
        `raw-${number}`,
        `connection-${number}`,
        `run-${number}`,
        `acquisition-${number}`,
        `synthetic/${number}`,
        at,
      )
  }
  database
    .prepare(
      `INSERT INTO media_items(id,type,title,created_at,updated_at)
    VALUES('video','video','Synthetic video',?,?)`,
    )
    .run(at, at)
  addSource(database, 'source-1')
  addSource(database, 'source-2', 'connection-2')
  addArchive(database, 'archive-1')
  for (const [index, role] of roles.entries()) {
    database
      .prepare(
        `INSERT INTO archive_entry_evidence(
      id,archive_entry_id,source_record_id,role,linked_at
    ) VALUES(?,'archive-1','source-1',?,?)`,
      )
      .run(`legacy:${role}`, role, `2026-01-01T00:00:0${index}Z`)
  }
}

function evidence(database: DatabaseSync) {
  return database.prepare('SELECT * FROM archive_entry_evidence ORDER BY id').all()
}

function key(database: DatabaseSync, table: 'archive_entries' | 'source_records', id: string) {
  return database.prepare(`SELECT storage_id FROM ${table} WHERE id=?`).get(id)?.storage_id
}

describe('compact evidence migration and compatibility boundary', () => {
  let database: DatabaseSync
  beforeEach(() => {
    database = new DatabaseSync(':memory:')
    database.exec(initialSchema)
    seed(database)
  })
  afterEach(() => database.close())

  it('preserves all evidence IDs, roles, differing timestamps, and canonical references', () => {
    const before = evidence(database)
    database.exec(compactMigration)
    expect(evidence(database)).toEqual(before)
    expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    expect(database.prepare('PRAGMA integrity_check').get()?.integrity_check).toBe('ok')
    expect(
      database
        .prepare(
          `SELECT sql FROM sqlite_schema
      WHERE name='archive_entry_evidence_storage'`,
        )
        .get()?.sql,
    ).toContain('WITHOUT ROWID')
    expect(
      database
        .prepare(
          `SELECT type FROM sqlite_schema
      WHERE name='archive_entry_evidence'`,
        )
        .get()?.type,
    ).toBe('view')
  })

  it('allocates immutable positive integer keys without changing public IDs', () => {
    database.exec(compactMigration)
    const first = key(database, 'source_records', 'source-1')
    addSource(database, 'source-later')
    addArchive(database, 'archive-later')
    expect(key(database, 'source_records', 'source-later')).toBeGreaterThan(Number(first))
    expect(key(database, 'archive_entries', 'archive-later')).toBeGreaterThan(0)
    for (const table of ['source_records', 'archive_entries']) {
      expect(() => database.exec(`UPDATE ${table} SET storage_id=NULL`)).toThrow('immutable')
      expect(() => database.exec(`UPDATE ${table} SET storage_id=storage_id+100`)).toThrow(
        'immutable',
      )
      expect(() => database.exec(`UPDATE ${table} SET id=id||'-changed'`)).toThrow('immutable')
      database.exec(`UPDATE ${table} SET id=id,storage_id=storage_id`)
    }
  })

  it('keeps movie-style INSERT OR IGNORE idempotent while allowing additional evidence', () => {
    database.exec(compactMigration)
    const before = evidence(database)
    database.exec(`INSERT OR IGNORE INTO archive_entry_evidence
      VALUES('replacement','archive-1','source-1','admission','2026-02-01T00:00:00Z')`)
    expect(evidence(database)).toEqual(before)
    addArchive(database, 'archive-reconciled')
    database.exec(`INSERT OR IGNORE INTO archive_entry_evidence(
      id,archive_entry_id,source_record_id,role,linked_at
    ) SELECT 'reconciled:'||role,'archive-reconciled',source_record_id,role,linked_at
      FROM archive_entry_evidence WHERE archive_entry_id='archive-1'`)
    expect(
      database
        .prepare(
          `SELECT role,linked_at FROM archive_entry_evidence
      WHERE archive_entry_id='archive-reconciled' ORDER BY role`,
        )
        .all(),
    ).toEqual(
      database
        .prepare(
          `SELECT role,linked_at FROM archive_entry_evidence
        WHERE archive_entry_id='archive-1' ORDER BY role`,
        )
        .all(),
    )
    expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })

  it('enforces connection matching even through INSERT OR IGNORE and the physical writer', () => {
    database.exec(compactMigration)
    expect(() =>
      database.exec(`INSERT OR IGNORE INTO archive_entry_evidence
      VALUES('cross-account','archive-1','source-2','admission','${at}')`),
    ).toThrow('connection')
    expect(() =>
      database
        .prepare(
          `INSERT INTO archive_entry_evidence_storage
      (archive_storage_id,source_storage_id,role,id,linked_at) VALUES(?,?,'admission','cross',?)`,
        )
        .run(
          key(database, 'archive_entries', 'archive-1') as number,
          key(database, 'source_records', 'source-2') as number,
          at,
        ),
    ).toThrow('connection')
  })

  it('rejects missing parents, invalid roles, duplicate IDs, and all evidence mutation', () => {
    database.exec(compactMigration)
    for (const values of [
      `'missing-source','archive-1','missing','admission','${at}'`,
      `'missing-archive','missing','source-1','admission','${at}'`,
      `'bad-role','archive-1','source-1','invented','${at}'`,
    ]) {
      expect(() => database.exec(`INSERT INTO archive_entry_evidence VALUES(${values})`)).toThrow()
    }
    addArchive(database, 'another-archive')
    expect(() =>
      database.exec(`INSERT INTO archive_entry_evidence
      VALUES('legacy:admission','another-archive','source-1','admission','${at}')`),
    ).toThrow('UNIQUE')
    for (const table of ['archive_entry_evidence', 'archive_entry_evidence_storage']) {
      expect(() => database.exec(`UPDATE ${table} SET linked_at='2026-02-01T00:00:00Z'`)).toThrow(
        'immutable',
      )
      expect(() => database.exec(`DELETE FROM ${table}`)).toThrow('cannot be deleted')
    }
    expect(evidence(database)).toHaveLength(6)
  })

  it('rejects missing public parents under INSERT OR IGNORE without losing valid replay semantics', () => {
    database.exec(compactMigration)
    database.exec(
      readFileSync(
        new URL('../migrations/0028_evidence_view_parent_guard.sql', import.meta.url),
        'utf8',
      ),
    )
    for (const [archive, source] of [
      ['missing-archive', 'missing-source'],
      ['archive-1', 'missing-source'],
      ['missing-archive', 'source-1'],
    ]) {
      expect(() =>
        database
          .prepare(
            `INSERT OR IGNORE INTO archive_entry_evidence
        VALUES('missing-parents',?,?,'admission',?)`,
          )
          .run(archive!, source!, at),
      ).toThrow('existing parents')
    }
    database.exec(`INSERT OR IGNORE INTO archive_entry_evidence
      VALUES('replacement','archive-1','source-1','admission','${at}')`)
    expect(evidence(database)).toHaveLength(6)
    addArchive(database, 'additional-archive')
    database.exec(`INSERT OR IGNORE INTO archive_entry_evidence
      VALUES('additional','additional-archive','source-1','admission','${at}')`)
    expect(evidence(database)).toHaveLength(7)
    expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })

  it('uses compact key indexes for both public-ID lookup directions', () => {
    database.exec(compactMigration)
    const plan = (sql: string) =>
      database
        .prepare(`EXPLAIN QUERY PLAN ${sql}`)
        .all()
        .map((row) => String(row.detail))
        .join('\n')
    const archivePlan = plan(
      `SELECT * FROM archive_entry_evidence WHERE archive_entry_id='archive-1'`,
    )
    const sourcePlan = plan(
      `SELECT * FROM archive_entry_evidence WHERE source_record_id='source-1'`,
    )
    expect(archivePlan).toContain('SEARCH evidence USING PRIMARY KEY (archive_storage_id=?)')
    expect(sourcePlan).toContain(
      'SEARCH evidence USING INDEX archive_entry_evidence_storage_source_idx',
    )
    expect(archivePlan).not.toContain('SCAN evidence')
    expect(sourcePlan).not.toContain('SCAN evidence')
  })

  describe.each([0, 1])('insert-only replay with recursive_triggers=%i', (recursiveTriggers) => {
    beforeEach(() => {
      database.exec(`PRAGMA recursive_triggers=${recursiveTriggers}`)
      database.exec(compactMigration)
      database.exec(parentGuardMigration)
    })

    function insert(
      boundary: 'view' | 'physical',
      policy: '' | 'OR IGNORE' | 'OR REPLACE' | 'targeted',
      id: string | null,
      archive: string,
      source: string,
      role: string | null,
      linkedAt: string | null,
    ) {
      const table =
        boundary === 'view' ? 'archive_entry_evidence' : 'archive_entry_evidence_storage'
      const values =
        boundary === 'view'
          ? [id, archive, source, role, linkedAt]
          : [
              id,
              key(database, 'archive_entries', archive) ?? null,
              key(database, 'source_records', source) ?? null,
              role,
              linkedAt,
            ]
      const columns =
        boundary === 'view'
          ? 'id,archive_entry_id,source_record_id,role,linked_at'
          : 'id,archive_storage_id,source_storage_id,role,linked_at'
      const conflict =
        policy === 'targeted'
          ? 'ON CONFLICT(archive_storage_id,source_storage_id,role) DO NOTHING'
          : ''
      return database
        .prepare(
          `INSERT ${policy === 'targeted' ? '' : policy} INTO ${table}(${columns})
          VALUES(?,?,?,?,?) ${conflict}`,
        )
        .run(...values)
    }

    it('migrates retained values unchanged and makes every valid duplicate-role insert a no-op', () => {
      const before = evidence(database)
      const parents = database.prepare('SELECT * FROM archive_entries ORDER BY id').all()
      const sources = database.prepare('SELECT * FROM source_records ORDER BY id').all()
      database.exec(insertOnlyMigration)
      expect(evidence(database)).toEqual(before)
      for (const boundary of ['view', 'physical'] as const) {
        for (const policy of ['', 'OR IGNORE', 'OR REPLACE'] as const) {
          for (const role of roles) {
            insert(boundary, policy, `replacement:${role}`, 'archive-1', 'source-1', role, at)
          }
          // The incoming ID belongs to a different retained role. Replay of an
          // existing pair/role still takes precedence and changes neither link.
          insert(
            boundary,
            policy,
            'legacy:review',
            'archive-1',
            'source-1',
            'admission',
            '2026-02-01T00:00:00Z',
          )
        }
      }
      insert('physical', 'targeted', 'new-id', 'archive-1', 'source-1', 'admission', at)
      insert('physical', 'targeted', 'legacy:review', 'archive-1', 'source-1', 'admission', at)
      expect(evidence(database)).toEqual(before)
      expect(database.prepare('SELECT * FROM archive_entries ORDER BY id').all()).toEqual(parents)
      expect(database.prepare('SELECT * FROM source_records ORDER BY id').all()).toEqual(sources)
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    })

    it('rejects IDs reused for new pairs under every policy while permitting new evidence', () => {
      database.exec(insertOnlyMigration)
      addArchive(database, 'new-archive')
      const before = evidence(database)
      for (const boundary of ['view', 'physical'] as const) {
        for (const policy of ['', 'OR IGNORE', 'OR REPLACE'] as const) {
          expect(() =>
            insert(
              boundary,
              policy,
              'legacy:admission',
              'new-archive',
              'source-1',
              'admission',
              at,
            ),
          ).toThrow('UNIQUE')
        }
      }
      expect(() =>
        insert(
          'physical',
          'targeted',
          'legacy:admission',
          'new-archive',
          'source-1',
          'admission',
          at,
        ),
      ).toThrow('UNIQUE')
      expect(evidence(database)).toEqual(before)
      insert('view', 'OR IGNORE', 'new-link', 'new-archive', 'source-1', 'admission', at)
      insert('physical', 'OR REPLACE', 'new-role', 'new-archive', 'source-1', 'metadata', at)
      expect(evidence(database)).toHaveLength(before.length + 2)
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    })

    it.each(['view', 'physical'] as const)(
      'continues a mixed INSERT SELECT after replay suppression through the %s boundary',
      (boundary) => {
        database.exec(insertOnlyMigration)
        addArchive(database, 'archive-reconciled')
        const before = evidence(database)
        const metadata = before.find((row) => row.id === 'legacy:metadata')!
        const table =
          boundary === 'view' ? 'archive_entry_evidence' : 'archive_entry_evidence_storage'
        const columns =
          boundary === 'view'
            ? 'id,archive_entry_id,source_record_id,role,linked_at'
            : 'id,archive_storage_id,source_storage_id,role,linked_at'
        const archiveReference = (id: string) =>
          boundary === 'view' ? id : (key(database, 'archive_entries', id) as number)
        const sourceReference =
          boundary === 'view' ? 'source-1' : (key(database, 'source_records', 'source-1') as number)
        database
          .prepare(
            `INSERT OR IGNORE INTO ${table}(${columns})
            SELECT ?,?,?,role,? FROM archive_entry_evidence WHERE id='legacy:admission'
            UNION ALL
            SELECT ?,?,?,role,linked_at FROM archive_entry_evidence WHERE id='legacy:metadata'`,
          )
          .run(
            'replayed-different-id',
            archiveReference('archive-1'),
            sourceReference,
            '2026-02-01T00:00:00Z',
            'reconciled:metadata',
            archiveReference('archive-reconciled'),
            sourceReference,
          )
        expect(evidence(database).filter((row) => row.id !== 'reconciled:metadata')).toEqual(before)
        expect(
          database
            .prepare("SELECT * FROM archive_entry_evidence WHERE id='reconciled:metadata'")
            .get(),
        ).toEqual({
          ...metadata,
          id: 'reconciled:metadata',
          archive_entry_id: 'archive-reconciled',
        })
        expect(evidence(database)).toHaveLength(before.length + 1)
        expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
      },
    )

    it('rejects malformed required fields under REPLACE instead of suppressing them as replay', () => {
      database.exec(insertOnlyMigration)
      const before = evidence(database)
      for (const boundary of ['view', 'physical'] as const) {
        for (const [id, role, linkedAt] of [
          [null, 'admission', at],
          ['legacy:admission', 'admission', null],
          ['new-id', 'admission', null],
          ['new-id', null, at],
          ['new-id', 'invalid', at],
        ]) {
          expect(() =>
            insert(boundary, 'OR REPLACE', id!, 'archive-1', 'source-1', role!, linkedAt!),
          ).toThrow()
        }
      }
      expect(evidence(database)).toEqual(before)
    })

    it('validates parents and matching connections before suppressing replay', () => {
      database.exec(insertOnlyMigration)
      const before = evidence(database)
      for (const boundary of ['view', 'physical'] as const) {
        for (const policy of ['OR IGNORE', 'OR REPLACE'] as const) {
          for (const [archive, source] of [
            ['missing', 'source-1'],
            ['archive-1', 'missing'],
            ['missing', 'missing'],
          ]) {
            expect(() =>
              insert(boundary, policy, 'new-id', archive!, source!, 'admission', at),
            ).toThrow('existing parents')
          }
          expect(() =>
            insert(boundary, policy, 'new-id', 'archive-1', 'source-2', 'admission', at),
          ).toThrow('connection')
        }
      }
      for (const policy of ['OR IGNORE', 'OR REPLACE']) {
        expect(() =>
          database.exec(`INSERT ${policy} INTO archive_entry_evidence_storage
            (archive_storage_id,source_storage_id,role,id,linked_at)
            VALUES(999999,999999,'admission','missing-numeric-parents','${at}')`),
        ).toThrow('existing parents')
      }
      // Parent connection updates were already possible in the old schema. A
      // repeated pair must still recheck lineage rather than bypass this check.
      database.exec("UPDATE archive_entries SET connection_id='connection-2' WHERE id='archive-1'")
      for (const boundary of ['view', 'physical'] as const) {
        expect(() =>
          insert(boundary, 'OR IGNORE', 'new-id', 'archive-1', 'source-1', 'admission', at),
        ).toThrow('connection')
      }
      database.exec("UPDATE archive_entries SET connection_id='connection-1' WHERE id='archive-1'")
      expect(evidence(database)).toEqual(before)
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    })

    it('retains update/delete protection at both boundaries', () => {
      database.exec(insertOnlyMigration)
      const before = evidence(database)
      for (const table of ['archive_entry_evidence', 'archive_entry_evidence_storage']) {
        expect(() => database.exec(`UPDATE OR REPLACE ${table} SET linked_at='changed'`)).toThrow(
          'immutable',
        )
        expect(() => database.exec(`DELETE FROM ${table}`)).toThrow('cannot be deleted')
      }
      expect(evidence(database)).toEqual(before)
    })
  })
})
