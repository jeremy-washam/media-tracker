import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { applyTestMigrations } from './test-support/sqlite'

it('upgrades populated job and cursor state without changing retained records', () => {
  const database = new DatabaseSync(':memory:')
  try {
    applyTestMigrations(database, { before: '0031_catalog_fences_and_partial_cursors.sql' })
    database.exec(`
      INSERT INTO connections(id,source,label,status,coverage,created_at,updated_at)
        VALUES('connection','spotify','Synthetic','connected','partial','2026-01-01','2026-01-01');
      INSERT INTO sync_runs(id,connection_id,kind,status,started_at)
        VALUES('success','connection','reconcile','succeeded','2026-01-01'),
              ('partial','connection','reconcile','partially_succeeded','2026-01-02');
      INSERT INTO sync_cursors(id,connection_id,name,checkpoint_json,committed_at,sync_run_id)
        VALUES('cursor','connection','scan','{"page":1}','2026-01-01','success');
      INSERT INTO catalog_refresh_jobs(id,provider,state,attempt_count,requested_count,created_at,updated_at)
        VALUES('job','youtube','running',7,20,'2026-01-01','2026-01-01');
      INSERT INTO source_sync_admission(source,day,attempts,started_at,outcome,reservation_json)
        VALUES('spotify','2026-01-01',1,0,'running','{"rowsRead":10}');
      INSERT INTO source_sync_lease(id,owner,expires_at) VALUES('sources','existing-owner',12345);
    `)
    const tables = [
      'connections',
      'sync_runs',
      'sync_cursors',
      'catalog_refresh_jobs',
      'source_sync_admission',
      'source_sync_lease',
    ]
    const snapshot = () =>
      tables.map((table) => database.prepare(`SELECT * FROM ${table} ORDER BY 1`).all())
    const before = snapshot()
    expect(() => database.exec("UPDATE sync_cursors SET sync_run_id='partial'")).toThrow(
      'succeeded sync run',
    )
    database.exec(
      readFileSync(
        new URL('../migrations/0031_catalog_fences_and_partial_cursors.sql', import.meta.url),
        'utf8',
      ),
    )
    expect(snapshot()).toEqual(before)
    database.exec("UPDATE sync_cursors SET sync_run_id='partial',checkpoint_json='{\"page\":2}'")
    expect(database.prepare('SELECT sync_run_id,checkpoint_json FROM sync_cursors').get()).toEqual({
      sync_run_id: 'partial',
      checkpoint_json: '{"page":2}',
    })
    expect(database.prepare('SELECT COUNT(*) value FROM catalog_write_guards').get()?.value).toBe(0)
    expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    expect(database.prepare('PRAGMA integrity_check').get()?.integrity_check).toBe('ok')
  } finally {
    database.close()
  }
})
