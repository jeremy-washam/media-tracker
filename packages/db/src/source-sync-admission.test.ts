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
      expect(await repository.retryable('readwise', started)).toBeNull()
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
