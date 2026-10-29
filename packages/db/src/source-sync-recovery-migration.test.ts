import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { applyTestMigrations } from './test-support/sqlite'

it('upgrades populated admission history without refunding interrupted work or inventing snapshot associations', () => {
  const database = new DatabaseSync(':memory:')
  try {
    applyTestMigrations(database, { before: '0034_source_sync_recovery.sql' })
    database.exec(`INSERT INTO source_sync_admission(source,day,attempts,started_at,outcome,reservation_json,usage_json)
    VALUES('hardcover','2026-10-17',2,1,'running','{"requests":128}','{"requests":30}'),
          ('spotify','2026-10-29',3,2,'failed','{"requests":32}','{"requests":3}');`)
    const fields = 'source,day,attempts,started_at,outcome,reservation_json,usage_json'
    const before = database
      .prepare('SELECT ' + fields + ' FROM source_sync_admission ORDER BY source')
      .all()
    database.exec(
      readFileSync(new URL('../migrations/0034_source_sync_recovery.sql', import.meta.url), 'utf8'),
    )
    expect(
      database.prepare('SELECT ' + fields + ' FROM source_sync_admission ORDER BY source').all(),
    ).toEqual(before)
    expect(
      database
        .prepare(
          'SELECT source,snapshot_run_id,retry_count,retry_not_before FROM source_sync_admission ORDER BY source',
        )
        .all(),
    ).toEqual([
      { source: 'hardcover', snapshot_run_id: null, retry_count: 0, retry_not_before: 0 },
      { source: 'spotify', snapshot_run_id: null, retry_count: 2, retry_not_before: 0 },
    ])
    expect(() => database.exec('UPDATE source_sync_admission SET retry_not_before=-1')).toThrow()
    expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  } finally {
    database.close()
  }
})
