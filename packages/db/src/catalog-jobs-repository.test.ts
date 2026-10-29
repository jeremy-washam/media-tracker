import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SqlCatalogJobsRepository } from './catalog-jobs-repository'
import { CatalogLeaseLostError, fenceCatalogDatabase } from './catalog-fence'
import { applyTestMigrations, SqliteTestClient } from './test-support/sqlite'

describe('catalog job ownership', () => {
  let database: DatabaseSync
  let client: SqliteTestClient
  let jobs: SqlCatalogJobsRepository
  const at = '2026-01-01T00:00:00.000Z'
  const expired = '2026-01-01T00:06:00.000Z'
  beforeEach(() => {
    database = new DatabaseSync(':memory:')
    applyTestMigrations(database)
    client = new SqliteTestClient(database)
    jobs = new SqlCatalogJobsRepository(client)
  })
  afterEach(() => database.close())

  it('returns the existing active provider job when starts race', async () => {
    expect((await jobs.create('first', 'youtube', at)).id).toBe('first')
    expect((await jobs.create('second', 'youtube', at)).id).toBe('first')
  })

  it('reserves once and issues a new generation after release or actual expiry', async () => {
    await jobs.create('job', 'youtube', at)
    expect(await jobs.reserve('job', null, at, '2026-01-01T00:05:00.000Z')).toBe(1)
    expect(await jobs.reserve('job', null, at, expired)).toBeNull()
    expect(await jobs.release('job', 1, at)).toBe(true)
    expect(await jobs.reserve('job', null, at, '2026-01-01T00:05:00.000Z')).toBe(2)
    expect(await jobs.reserve('job', null, expired, '2026-01-01T00:11:00.000Z')).toBe(3)
  })

  it.each(['advance', 'release', 'complete', 'fail'] as const)(
    'rejects a late worker %s after its lease is replaced',
    async (operation) => {
      await jobs.create('job', 'youtube', at)
      const old = (await jobs.reserve('job', null, at, '2026-01-01T00:05:00.000Z'))!
      const current = (await jobs.reserve('job', null, expired, '2026-01-01T00:11:00.000Z'))!
      const before = await jobs.find('job')
      const changed =
        operation === 'advance'
          ? await jobs.advance('job', old, {
              cursor: 'old',
              requested: 10,
              returned: 9,
              omitted: 1,
              quotaUnits: 2,
              at,
            })
          : operation === 'release'
            ? await jobs.release('job', old, at)
            : operation === 'complete'
              ? await jobs.complete('job', old, at)
              : await jobs.fail('job', old, 'late_failure', at)
      expect(changed).toBe(false)
      expect(await jobs.find('job')).toEqual(before)
      expect(
        await jobs.advance('job', current, {
          cursor: 'new',
          requested: 1,
          returned: 1,
          omitted: 0,
          quotaUnits: 1,
          at: expired,
        }),
      ).toBe(true)
      expect(await jobs.reserve('job', null, expired, '2026-01-01T00:12:00.000Z')).toBeNull()
      expect(await jobs.reserve('job', 'new', expired, '2026-01-01T00:12:00.000Z')).toBe(3)
    },
  )

  it('preserves terminal state after duplicate completion/failure', async () => {
    await jobs.create('job', 'tmdb', at)
    const token = (await jobs.reserve('job', null, at, expired))!
    expect(await jobs.complete('job', token, at)).toBe(true)
    expect(await jobs.fail('job', token, 'late_failure', at)).toBe(false)
    expect(await jobs.release('job', token, at)).toBe(false)
    expect(await jobs.find('job')).toMatchObject({ state: 'succeeded', requestedCount: 0 })
  })

  it('fences provider writes atomically and leaves no assertion rows', async () => {
    await jobs.create('job', 'youtube', at)
    const old = (await jobs.reserve('job', null, at, '2026-01-01T00:05:00.000Z'))!
    const fenced = fenceCatalogDatabase(client, { jobId: 'job', token: old, kind: 'catalog' })
    await fenced
      .prepare("INSERT INTO youtube_categories VALUES('1','US','Retained',1,?,?)")
      .bind(at, expired)
      .run()
    expect(database.prepare('SELECT COUNT(*) value FROM catalog_write_guards').get()?.value).toBe(0)
    await jobs.reserve('job', null, expired, '2026-01-01T00:11:00.000Z')
    await expect(
      fenced.batch([
        fenced.prepare("UPDATE youtube_categories SET title='stale'"),
        fenced.prepare('DELETE FROM youtube_categories'),
      ]),
    ).rejects.toBeInstanceOf(CatalogLeaseLostError)
    expect(database.prepare('SELECT title FROM youtube_categories').get()?.title).toBe('Retained')
    expect(database.prepare('SELECT COUNT(*) value FROM catalog_write_guards').get()?.value).toBe(0)
    expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    expect(database.prepare('PRAGMA integrity_check').get()?.integrity_check).toBe('ok')
    expect(() =>
      fenced.prepare("UPDATE youtube_categories SET title='bypass' RETURNING title").first(),
    ).toThrow('mutations must use')
    expect(() =>
      fenced
        .prepare(
          "WITH input AS (SELECT 1) UPDATE youtube_categories SET title='bypass' RETURNING title",
        )
        .first(),
    ).toThrow('mutations must use')
  })
})
