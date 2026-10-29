import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { applyTestMigrations } from './test-support/sqlite'

it('upgrades a populated database without changing completed cursors or prior admissions', () => {
  const database = new DatabaseSync(':memory:')
  try {
    applyTestMigrations(database, { before: '0032_hardcover_sync_progress.sql' })
    database.exec(`INSERT INTO connections(id,source,label,status,coverage,created_at,updated_at)
    VALUES('hardcover','hardcover','Synthetic','connected','complete','2026-01-01','2026-01-01'),
          ('spotify','spotify','Synthetic','connected','partial','2026-01-01','2026-01-01');
   INSERT INTO sync_runs(id,connection_id,kind,status,started_at) VALUES('complete','hardcover','reconcile','succeeded','2026-01-01'),('running','hardcover','reconcile','running','2026-01-02'),('spotify-run','spotify','reconcile','running','2026-01-02');
   INSERT INTO sync_cursors(id,connection_id,name,checkpoint_json,committed_at,sync_run_id) VALUES('cursor','hardcover','library-books','{"books":1}','2026-01-01','complete');
   INSERT INTO source_sync_admission(source,day,attempts,started_at,outcome,reservation_json) VALUES('hardcover','2026-01-01',1,0,'running','{}');`)
    const snapshot = () =>
      ['connections', 'sync_runs', 'sync_cursors', 'source_sync_admission'].map((table) =>
        database.prepare(`SELECT * FROM ${table} ORDER BY 1`).all(),
      )
    const before = snapshot()
    database.exec(
      readFileSync(
        new URL('../migrations/0032_hardcover_sync_progress.sql', import.meta.url),
        'utf8',
      ),
    )
    expect(snapshot()).toEqual(before)
    database.exec(
      `INSERT INTO hardcover_sync_progress VALUES('hardcover','running','{"afterId":50}','2026-01-02')`,
    )
    expect(() => database.exec("UPDATE sync_cursors SET sync_run_id='running'")).toThrow(
      'completed sync run',
    )
    expect(() =>
      database.exec("UPDATE hardcover_sync_progress SET sync_run_id='spotify-run'"),
    ).toThrow('same Hardcover connection')
    expect(() =>
      database.exec(
        `INSERT INTO hardcover_sync_progress VALUES('spotify','spotify-run','{}','2026-01-02')`,
      ),
    ).toThrow('same Hardcover connection')
    expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    expect(database.prepare('PRAGMA integrity_check').get()?.integrity_check).toBe('ok')
  } finally {
    database.close()
  }
})
