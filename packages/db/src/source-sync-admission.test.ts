import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import type { DatabaseClient, DatabaseStatement, DatabaseValue } from './database'
import { SqlSourceSyncAdmission } from './source-sync-admission'

function client(db: DatabaseSync): DatabaseClient {
  function prepare(query: string, values: readonly DatabaseValue[] = []): DatabaseStatement {
    const parameters = () =>
      values.map((value) => (value instanceof ArrayBuffer ? new Uint8Array(value) : value))
    return {
      bind: (...next) => prepare(query, next),
      async first<Row>() {
        return (db.prepare(query).get(...parameters()) as Row | undefined) ?? null
      },
      async all<Row>() {
        return { success: true, results: db.prepare(query).all(...parameters()) as Row[] }
      },
      async run() {
        db.prepare(query).run(...parameters())
        return { success: true }
      },
    }
  }
  return {
    prepare,
    batch: async (statements) => Promise.all(statements.map((statement) => statement.run())),
  }
}

describe('durable source sync admission', () => {
  function fixture() {
    const db = new DatabaseSync(':memory:')
    const directory = new URL('../migrations/', import.meta.url)
    for (const name of readdirSync(directory)
      .filter((name) => name.endsWith('.sql'))
      .sort())
      db.exec(readFileSync(new URL(name, directory), 'utf8'))
    db.exec(`INSERT INTO connections(id,source,label,status,coverage,created_at,updated_at)
      VALUES('hardcover','hardcover','Synthetic','connected','complete','2026-01-01','2026-01-01');
      INSERT INTO sync_runs(id,connection_id,kind,status,started_at) VALUES('snapshot','hardcover','reconcile','running','2026-01-01'),('old-snapshot','hardcover','reconcile','running','2026-01-01');
      INSERT INTO hardcover_sync_progress VALUES('hardcover','snapshot','{"complete":false,"scanComplete":false}','2026-01-01');`)
    return { db, repository: new SqlSourceSyncAdmission(client(db)) }
  }
  it('preserves historical usage without exhausting a lifetime allocation', async () => {
    const { db, repository } = fixture()
    try {
      db.prepare(
        `INSERT INTO source_sync_admission(source,day,attempts,started_at,outcome,reservation_json,usage_json) VALUES('readwise','2026-10-01',1,0,'succeeded','{}',?)`,
      ).run(JSON.stringify({ rowsWritten: 1e9, rowsRead: 1e12 }))
      expect(await repository.withinAllowance(Date.parse('2026-10-29T00:00:00Z'))).toBe(true)
    } finally {
      db.close()
    }
  })
  it('retains unknown work against a rolling daily safety ceiling', async () => {
    const { db, repository } = fixture(),
      now = Date.parse('2026-10-29T00:00:00Z')
    try {
      for (let i = 0; i < 10; i++)
        db.prepare(
          `INSERT INTO source_sync_admission(source,day,attempts,started_at,outcome,reservation_json) VALUES(?,'2026-10-29',1,?,'running','{}')`,
        ).run(String(i), now)
      expect(await repository.withinAllowance(now)).toBe(false)
      expect(await repository.withinAllowance(now + 86400001)).toBe(true)
    } finally {
      db.close()
    }
  })
  it('binds continuation to the exact snapshot and blocks new daily allocations while known progress remains', async () => {
    const { db, repository } = fixture(),
      now = Date.parse('2026-10-29T23:59:00Z')
    try {
      expect(await repository.reserve('hardcover', now, '{"pages":64}')).toBe(true)
      await repository.finish('hardcover', now, now + 1000, 'running', '{"pages":1}', {
        snapshotRunId: 'old-snapshot',
      })
      expect(await repository.resumable('hardcover', now + 1000)).toBeNull()
      await repository.finish('hardcover', now, now + 1000, 'running', '{"pages":1}', {
        snapshotRunId: 'snapshot',
      })
      expect(await repository.resumable('hardcover', now + 1000)).toMatchObject({
        started_at: now,
        snapshot_run_id: 'snapshot',
      })
      expect(await repository.available('hardcover', now + 86400000)).toBe(false)
      expect(await repository.reserve('hardcover', now + 86400000, '{}')).toBe(false)
      expect(await repository.claimContinuation('hardcover', now, now + 1000)).toBe(true)
      expect(await repository.resumable('hardcover', now + 2000)).toBeNull()
      // Unknown in-flight attempt keeps its reservation; next day's fresh allocation may resume the checkpoint.
      expect(await repository.reserve('hardcover', now + 86400000, '{}')).toBe(true)
    } finally {
      db.close()
    }
  })
  it('uses the completed cursor even when a convenience marker was not written', async () => {
    const { db, repository } = fixture(),
      now = Date.parse('2026-10-29T00:00:00Z')
    try {
      await repository.reserve('hardcover', now, '{}')
      await repository.finish('hardcover', now, now + 1000, 'running', '{}', {
        snapshotRunId: 'snapshot',
      })
      db.exec(`UPDATE sync_runs SET status='succeeded' WHERE id='snapshot';
        INSERT INTO sync_cursors VALUES('cursor','hardcover','library-books','{}','2026-01-01','snapshot')`)
      expect(await repository.resumable('hardcover', now)).toBeNull()
      expect(await repository.available('hardcover', now + 86400000)).toBe(true)
    } finally {
      db.close()
    }
  })
  it('retains provider cooldown across days, retries, and fresh allocations', async () => {
    const { db, repository } = fixture(),
      now = Date.parse('2026-10-29T00:00:00Z'),
      until = now + 3 * 86400000
    try {
      await repository.reserve('spotify', now, '{}')
      await repository.finish('spotify', now, now + 1000, 'failed', '{}', { retryNotBefore: until })
      expect(await repository.retryable('spotify', now + 2000)).toBeNull()
      expect(await repository.claimRetry('spotify', now, now + 2000)).toBe(false)
      expect(await repository.available('spotify', now + 86400000)).toBe(false)
      expect(await repository.reserve('spotify', now + 86400000, '{}')).toBe(false)
      expect(await repository.available('spotify', until)).toBe(true)
      expect(await repository.reserve('spotify', until, '{}')).toBe(true)
      expect(
        db
          .prepare('SELECT retry_not_before FROM source_sync_admission WHERE day=?')
          .get('2026-10-29'),
      ).toEqual({ retry_not_before: until })
    } finally {
      db.close()
    }
  })
  it('separates failed retries from successful page continuations and marks each claim uncertain', async () => {
    const { db, repository } = fixture(),
      now = Date.parse('2026-10-29T00:00:00Z')
    try {
      await repository.reserve('hardcover', now, '{}')
      await repository.finish('hardcover', now, now + 1000, 'running', '{}', {
        snapshotRunId: 'snapshot',
      })
      db.prepare('UPDATE source_sync_admission SET attempts=20').run()
      await repository.finish('hardcover', now, now + 2000, 'failed', '{}')
      expect(await repository.claimRetry('hardcover', now, now + 2000)).toBe(true)
      expect(await repository.resumable('hardcover', now + 2000)).toBeNull()
      expect(
        db
          .prepare("SELECT json_extract(usage_json,'$.inFlight') flag FROM source_sync_admission")
          .get(),
      ).toEqual({ flag: 1 })
      await repository.finish('hardcover', now, now + 3000, 'failed', '{}')
      expect(await repository.claimRetry('hardcover', now, now + 3000)).toBe(true)
      await repository.finish('hardcover', now, now + 4000, 'failed', '{}')
      expect(await repository.retryable('hardcover', now + 4000)).toBeNull()
      expect(await repository.claimRetry('hardcover', now, now + 4000)).toBe(false)
    } finally {
      db.close()
    }
  })
  it('marks an exhausted continuation failed without deleting its checkpoint or resetting next-day recovery', async () => {
    const { db, repository } = fixture(),
      now = Date.parse('2026-10-29T00:00:00Z')
    try {
      await repository.reserve('hardcover', now, '{}')
      await repository.finish('hardcover', now, now + 1000, 'running', '{}', {
        snapshotRunId: 'snapshot',
      })
      db.exec('UPDATE source_sync_admission SET attempts=96')
      expect(await repository.resumable('hardcover', now)).toMatchObject({ attempts: 96 })
      expect(await repository.claimContinuation('hardcover', now, now)).toBe(false)
      await repository.exhaust('hardcover', now, now + 2000, 'attempt_limit')
      expect(await repository.resumable('hardcover', now + 3000)).toBeNull()
      expect(
        db.prepare("SELECT status,error_code FROM sync_runs WHERE id='snapshot'").get(),
      ).toEqual({ status: 'failed', error_code: 'source_sync_limit' })
      expect(db.prepare('SELECT COUNT(*) n FROM hardcover_sync_progress').get()).toEqual({ n: 1 })
      expect(await repository.reserve('hardcover', now + 86400000, '{}')).toBe(true)
    } finally {
      db.close()
    }
  })
  it('serializes leases and prevents midnight and retry resets', async () => {
    const { db, repository } = fixture(),
      started = Date.parse('2026-10-17T23:59:00Z')
    try {
      expect(await repository.acquire('one', started)).toBe(true)
      expect(await repository.acquire('two', started)).toBe(false)
      expect(await repository.reserve('readwise', started, '{}')).toBe(true)
      await repository.finish('readwise', started, started + 1000, 'failed', '{}')
      expect(await repository.retryable('readwise', started + 1000)).not.toBeNull()
      await repository.release('two')
      expect(await repository.acquire('two', started + 2000)).toBe(false)
      await repository.release('one')
      expect(await repository.acquire('two', started + 2000)).toBe(true)
      expect(await repository.reserve('readwise', started + 120000, '{}')).toBe(false)
      expect(await repository.claimRetry('readwise', started, started + 2000)).toBe(true)
      expect(await repository.claimRetry('readwise', started, started + 2000)).toBe(false)
      await repository.finish('readwise', started, started + 3000, 'failed', '{}')
      expect(await repository.claimRetry('readwise', started, started + 3000)).toBe(true)
      await repository.finish('readwise', started, started + 4000, 'failed', '{}')
      expect(await repository.retryable('readwise', started + 4000)).toBeNull()
      expect(await repository.reserve('readwise', started + 86400000, '{}')).toBe(true)
    } finally {
      db.close()
    }
  })

  it('uses the final retained retry across midnight without resetting its row or cumulative usage', async () => {
    const { db, repository } = fixture()
    const started = Date.parse('2026-10-29T23:58:00Z')
    const afterMidnight = started + 3 * 60_000
    const reservation = JSON.stringify({ requests: 32, pages: 24, records: 1000, bytes: 8388608 })
    const usage = JSON.stringify({
      requests: 4,
      pages: 2,
      records: 25,
      bytes: 1000,
      rowsRead: 100,
      rowsWritten: 20,
    })
    try {
      expect(await repository.reserve('spotify', started, reservation)).toBe(true)
      await repository.finish('spotify', started, started + 1000, 'failed', usage)
      expect(await repository.claimRetry('spotify', started, started + 2000)).toBe(true)
      await repository.finish('spotify', started, started + 3000, 'failed', usage)
      expect(await repository.available('spotify', afterMidnight)).toBe(false)
      expect(await repository.reserve('spotify', afterMidnight, '{}')).toBe(false)
      expect(await repository.retryable('spotify', afterMidnight)).toMatchObject({
        started_at: started,
        attempts: 2,
        reservation_json: reservation,
        usage_json: usage,
      })
      expect(await repository.claimRetry('spotify', started, afterMidnight)).toBe(true)
      expect(
        db
          .prepare(
            "SELECT day,started_at,attempts,retry_count,reservation_json,usage_json FROM source_sync_admission WHERE source='spotify'",
          )
          .all(),
      ).toEqual([
        {
          day: '2026-10-29',
          started_at: started,
          attempts: 3,
          retry_count: 2,
          reservation_json: reservation,
          usage_json: JSON.stringify({ ...JSON.parse(usage), inFlight: 1 }),
        },
      ])
      const cumulative = JSON.stringify({ ...JSON.parse(usage), requests: 7, bytes: 1600 })
      await repository.finish('spotify', started, afterMidnight + 1000, 'failed', cumulative)
      expect(await repository.retryable('spotify', afterMidnight + 2000)).toBeNull()
      expect(await repository.claimRetry('spotify', started, afterMidnight + 2000)).toBe(false)
      expect(
        db
          .prepare(
            "SELECT day,started_at,usage_json FROM source_sync_admission WHERE source='spotify'",
          )
          .all(),
      ).toEqual([{ day: '2026-10-29', started_at: started, usage_json: cumulative }])
    } finally {
      db.close()
    }
  })

  it.each([
    ['exhausted retries', 'retry_count=2'],
    ['exhausted attempts', 'attempts=3'],
    ['unknown usage', 'usage_json=NULL'],
    ['non-object usage', "usage_json='[]'"],
    ['in-flight usage', `usage_json='{"inFlight":1}'`],
    ['provider cooldown', 'retry_not_before=1793330000000'],
    ['terminal stop', "stop_reason='limit_reached'"],
  ])('blocks cross-day recovery with %s', async (_reason, update) => {
    const { db, repository } = fixture()
    const started = Date.parse('2026-10-29T23:58:00Z')
    const now = started + 3 * 60_000
    try {
      await repository.reserve('spotify', started, '{}')
      await repository.finish('spotify', started, started + 1000, 'failed', '{}')
      db.exec(`UPDATE source_sync_admission SET ${update} WHERE source='spotify'`)
      const before = db.prepare("SELECT * FROM source_sync_admission WHERE source='spotify'").get()
      expect(await repository.retryable('spotify', now)).toBeNull()
      expect(await repository.claimRetry('spotify', started, now)).toBe(false)
      expect(
        db.prepare("SELECT * FROM source_sync_admission WHERE source='spotify'").get(),
      ).toEqual(before)
    } finally {
      db.close()
    }
  })

  it.each(['running', 'succeeded', 'failed'] as const)(
    'does not fall back to an older failure behind a newer %s admission',
    async (outcome) => {
      const { db, repository } = fixture()
      const started = Date.parse('2026-10-28T23:58:00Z')
      const next = started + 24 * 60 * 60_000
      try {
        await repository.reserve('spotify', started, '{}')
        await repository.finish('spotify', started, started + 1000, 'failed', '{}')
        expect(await repository.reserve('spotify', next, '{}')).toBe(true)
        await repository.finish('spotify', next, next + 1000, outcome, '{}')
        if (outcome === 'failed')
          db.exec(
            "UPDATE source_sync_admission SET retry_count=2 WHERE source='spotify' AND day='2026-10-29'",
          )
        expect(await repository.retryable('spotify', next + 3 * 60_000)).toBeNull()
        expect(await repository.claimRetry('spotify', started, next + 3 * 60_000)).toBe(false)
      } finally {
        db.close()
      }
    },
  )

  it('atomically rejects a retained claim when a newer admission appears after discovery', async () => {
    const { db, repository } = fixture()
    const started = Date.parse('2026-10-28T23:58:00Z')
    const next = started + 24 * 60 * 60_000
    try {
      await repository.reserve('spotify', started, '{}')
      await repository.finish('spotify', started, started + 1000, 'failed', '{"requests":4}')
      expect(await repository.retryable('spotify', next - 1000)).toMatchObject({
        started_at: started,
      })
      expect(await repository.reserve('spotify', next, '{}')).toBe(true)
      const before = db
        .prepare("SELECT * FROM source_sync_admission WHERE source='spotify' ORDER BY started_at")
        .all()
      expect(await repository.claimRetry('spotify', started, next + 1000)).toBe(false)
      expect(
        db
          .prepare("SELECT * FROM source_sync_admission WHERE source='spotify' ORDER BY started_at")
          .all(),
      ).toEqual(before)
    } finally {
      db.close()
    }
  })
})
