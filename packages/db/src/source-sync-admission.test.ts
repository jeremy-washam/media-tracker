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

describe('durable source admission', () => {
  it.each([
    { bytes: 1_950_000_000, requests: 0 },
    { bytes: 0, requests: 19_900 },
  ])('retains acquired-byte and provider-request limits: %j', async (usage) => {
    const db = new DatabaseSync(':memory:')
    try {
      db.exec(
        readFileSync(
          new URL('../migrations/0030_source_sync_admission.sql', import.meta.url),
          'utf8',
        ),
      )
      const repository = new SqlSourceSyncAdmission(client(db))
      db.prepare(
        `INSERT INTO source_sync_admission (source,day,attempts,started_at,outcome,reservation_json,usage_json)
        VALUES ('synthetic','2026-10-17',1,0,'succeeded','{}',?)`,
      ).run(JSON.stringify({ rowsRead: 0, rowsWritten: 0, ...usage }))
      expect(await repository.withinAllowance()).toBe(false)
    } finally {
      db.close()
    }
  })

  it('retains unknown reservations against the lifetime allocation across days', async () => {
    const db = new DatabaseSync(':memory:')
    try {
      db.exec(
        readFileSync(
          new URL('../migrations/0030_source_sync_admission.sql', import.meta.url),
          'utf8',
        ),
      )
      const repository = new SqlSourceSyncAdmission(client(db))
      expect(await repository.withinAllowance()).toBe(true)
      for (let index = 0; index < 5; index++)
        db.prepare(
          `INSERT INTO source_sync_admission
        (source,day,attempts,started_at,outcome,reservation_json) VALUES (?, ?, 1, ?, 'running', '{}')`,
        ).run('synthetic', `2026-10-${10 + index}`, index)
      expect(await repository.withinAllowance()).toBe(false)
      db.prepare(`UPDATE source_sync_admission SET outcome='succeeded',usage_json=?`).run(
        JSON.stringify({
          rowsRead: 10,
          rowsWritten: 10,
          failedOperations: 0,
          unmeasuredNonFirstStatements: 0,
        }),
      )
      expect(await repository.withinAllowance()).toBe(true)
      db.prepare(`UPDATE source_sync_admission SET usage_json=?`).run(
        JSON.stringify({
          rowsRead: 0,
          rowsWritten: 0,
          failedOperations: 0,
          unmeasuredNonFirstStatements: 1,
        }),
      )
      expect(await repository.withinAllowance()).toBe(false)
    } finally {
      db.close()
    }
  })
  it('migrates the prior schema and prevents overlaps, midnight resets and retry resets', async () => {
    const db = new DatabaseSync(':memory:')
    try {
      const directory = new URL('../migrations/', import.meta.url)
      for (const name of readdirSync(directory)
        .filter((name) => name.endsWith('.sql'))
        .sort())
        db.exec(readFileSync(new URL(name, directory), 'utf8'))
      const repository = new SqlSourceSyncAdmission(client(db))
      const started = Date.parse('2026-10-17T23:59:00Z')
      expect(await repository.acquire('one', started)).toBe(true)
      expect(await repository.acquire('two', started)).toBe(false)
      expect(await repository.reserve('readwise', started, '{"requests":2}')).toBe(true)
      await repository.finish('readwise', started, started + 1000, 'failed', '{"requests":1}')
      expect(await repository.retryable('readwise', started)).toMatchObject({ started_at: started })
      await repository.release('two')
      expect(await repository.acquire('two', started + 2000)).toBe(false)
      await repository.release('one')
      expect(await repository.acquire('two', started + 2000)).toBe(true)
      expect(await repository.reserve('readwise', started + 2000, '{}')).toBe(false)
      expect(await repository.reserve('readwise', started + 120_000, '{}')).toBe(false)
      expect(await repository.reserve('hardcover', started + 120_000, '{}')).toBe(true)
      await repository.release('two')
      expect(await repository.claimRetry('readwise', started)).toBe(true)
      expect(await repository.claimRetry('readwise', started)).toBe(false)
      await repository.finish('readwise', started, started + 120_000, 'failed', '{"requests":2}')
      expect(await repository.retryable('readwise', started)).not.toBeNull()
      expect(await repository.claimRetry('readwise', started)).toBe(true)
      await repository.finish('readwise', started, started + 180_000, 'failed', '{"requests":2}')
      expect(await repository.retryable('readwise', started)).toBeNull()
      expect(await repository.claimRetry('readwise', started)).toBe(false)
      expect(await repository.reserve('readwise', started + 24 * 3600_000, '{}')).toBe(true)
      expect(
        db
          .prepare('SELECT outcome, usage_json FROM source_sync_admission WHERE source=? AND day=?')
          .get('readwise', '2026-10-17'),
      ).toMatchObject({ outcome: 'failed', usage_json: '{"requests":2}' })
    } finally {
      db.close()
    }
  })

  it('retains crash reservations after the lease expires', async () => {
    const db = new DatabaseSync(':memory:')
    try {
      db.exec(
        readFileSync(
          new URL('../migrations/0030_source_sync_admission.sql', import.meta.url),
          'utf8',
        ),
      )
      const repository = new SqlSourceSyncAdmission(client(db))
      const started = Date.parse('2026-10-17T12:00:00Z')
      expect(await repository.acquire('crashed', started)).toBe(true)
      expect(await repository.reserve('spotify', started, '{}')).toBe(true)
      expect(await repository.acquire('replacement', started + 21 * 60_000)).toBe(true)
      expect(await repository.reserve('spotify', started + 21 * 60_000, '{}')).toBe(false)
      await repository.release('crashed')
      expect(await repository.acquire('third', started + 22 * 60_000)).toBe(false)
    } finally {
      db.close()
    }
  })
})
