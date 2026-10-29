import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SqlSpotifyCatalogJobsRepository } from './spotify-catalog-jobs-repository'
import { CatalogLeaseLostError, fenceCatalogDatabase } from './catalog-fence'
import { applyTestMigrations, SqliteTestClient } from './test-support/sqlite'

describe('Spotify catalog job ownership', () => {
  let database: DatabaseSync
  let client: SqliteTestClient
  let jobs: SqlSpotifyCatalogJobsRepository
  const at = '2026-01-01T00:00:00.000Z'
  const later = '2026-01-01T00:06:00.000Z'
  const progress = { requested: 2, returned: 1, unavailable: 1 }
  beforeEach(async () => {
    database = new DatabaseSync(':memory:')
    applyTestMigrations(database)
    client = new SqliteTestClient(database)
    database.exec(`INSERT INTO connections(id,source,label,status,coverage,created_at,updated_at) VALUES('connection','spotify','Synthetic','connected','partial','${at}','${at}');
      INSERT INTO sync_runs(id,connection_id,kind,status,started_at) VALUES('run','connection','backfill','running','${at}');`)
    jobs = new SqlSpotifyCatalogJobsRepository(client)
    await jobs.create({ id: 'job', connectionId: 'connection', syncRunId: 'run', at })
  })
  afterEach(() => database.close())

  it('keeps one active job, respects deferred retries, and counts partial work once', async () => {
    await expect(
      jobs.create({ id: 'other', connectionId: 'connection', syncRunId: 'run', at }),
    ).rejects.toThrow('UNIQUE')
    expect(await jobs.findActive()).toMatchObject({ id: 'job', phase: 'tracks' })
    const token = (await jobs.reserve('job', 'tracks', at, later))!
    expect(await jobs.reserve('job', 'tracks', at, later)).toBeNull()
    expect(await jobs.defer('job', token, at, later, 'spotify_http_429', progress)).toBe(true)
    expect(await jobs.defer('job', token, at, later, 'duplicate', progress)).toBe(false)
    expect(await jobs.reserve('job', 'tracks', at, later)).toBeNull()
    const next = (await jobs.reserve('job', 'tracks', later, '2026-01-01T00:11:00.000Z'))!
    expect(await jobs.advance('job', next, { phase: 'episodes', ...progress, at: later })).toBe(
      true,
    )
    expect(await jobs.find('job')).toMatchObject({
      requestedCount: 4,
      returnedCount: 2,
      unavailableCount: 2,
      phase: 'episodes',
    })
    expect(await jobs.reserve('job', 'tracks', later, later)).toBeNull()
  })

  it.each(['advance', 'defer', 'complete', 'fail'] as const)(
    'fences an expired worker %s against a new phase owner',
    async (operation) => {
      const old = (await jobs.reserve('job', 'tracks', at, '2026-01-01T00:05:00.000Z'))!
      const replacement = (await jobs.reserve('job', 'tracks', later, '2026-01-01T00:11:00.000Z'))!
      await jobs.advance('job', replacement, { phase: 'episodes', ...progress, at: later })
      const current = (await jobs.reserve('job', 'episodes', later, '2026-01-01T00:11:00.000Z'))!
      const before = await jobs.find('job')
      const runBefore = database.prepare("SELECT * FROM sync_runs WHERE id='run'").get()
      const changed =
        operation === 'advance'
          ? await jobs.advance('job', old, { phase: 'tracks', ...progress, at })
          : operation === 'defer'
            ? await jobs.defer('job', old, at, later, 'late', progress)
            : operation === 'complete'
              ? await jobs.complete('job', old, at)
              : await jobs.fail('job', old, at, 'late', progress)
      expect(changed).toBe(false)
      expect(await jobs.find('job')).toEqual(before)
      expect(database.prepare("SELECT * FROM sync_runs WHERE id='run'").get()).toEqual(runBefore)
      expect(await jobs.complete('job', current, later)).toBe(true)
      expect(await jobs.fail('job', current, later, 'late', progress)).toBe(false)
    },
  )

  it.each(['complete', 'fail'] as const)(
    'atomically rolls back and retries %s with a summary of durable progress',
    async (operation) => {
      const initial = (await jobs.reserve('job', 'tracks', at, later))!
      await jobs.advance('job', initial, { phase: 'episodes', ...progress, at })
      const token = (await jobs.reserve('job', 'episodes', at, later))!
      const finish = () =>
        operation === 'complete'
          ? jobs.complete('job', token, later)
          : jobs.fail('job', token, later, 'spotify_http_403', progress)
      const beforeJob = database
        .prepare("SELECT * FROM spotify_catalog_backfill_jobs WHERE id='job'")
        .get()
      const beforeRun = database.prepare("SELECT * FROM sync_runs WHERE id='run'").get()
      database.exec(
        "CREATE TRIGGER fail_terminal_summary BEFORE UPDATE ON sync_runs WHEN NEW.status IN ('succeeded','failed') BEGIN SELECT RAISE(ABORT,'synthetic summary failure'); END",
      )
      await expect(finish()).rejects.toThrow('synthetic summary failure')
      expect(
        database.prepare("SELECT * FROM spotify_catalog_backfill_jobs WHERE id='job'").get(),
      ).toEqual(beforeJob)
      expect(database.prepare("SELECT * FROM sync_runs WHERE id='run'").get()).toEqual(beforeRun)
      expect(database.prepare('SELECT COUNT(*) value FROM catalog_write_guards').get()?.value).toBe(
        0,
      )
      database.exec('DROP TRIGGER fail_terminal_summary')
      expect(await finish()).toBe(true)
      const total = operation === 'complete' ? 1 : 2
      const state = operation === 'complete' ? 'succeeded' : 'failed'
      const code = operation === 'complete' ? null : 'spotify_http_403'
      expect(await jobs.find('job')).toMatchObject({
        state,
        requestedCount: total * 2,
        returnedCount: total,
        unavailableCount: total,
        safeErrorCode: code,
      })
      expect(
        database
          .prepare(
            "SELECT status,finished_at,raw_object_count,source_record_count,normalized_record_count,failed_record_count,error_code,error_message FROM sync_runs WHERE id='run'",
          )
          .get(),
      ).toEqual({
        status: state,
        finished_at: later,
        raw_object_count: total,
        source_record_count: total,
        normalized_record_count: total,
        failed_record_count: total,
        error_code: code,
        error_message: null,
      })
      const terminal = database.prepare("SELECT * FROM sync_runs WHERE id='run'").get()
      expect(await finish()).toBe(false)
      expect(database.prepare("SELECT * FROM sync_runs WHERE id='run'").get()).toEqual(terminal)
      expect(database.prepare('SELECT COUNT(*) value FROM catalog_write_guards').get()?.value).toBe(
        0,
      )
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
      expect(database.prepare('PRAGMA integrity_check').get()?.integrity_check).toBe('ok')
    },
  )

  it('protects Spotify metadata writes after lease replacement', async () => {
    const token = (await jobs.reserve('job', 'tracks', at, '2026-01-01T00:05:00.000Z'))!
    const fenced = fenceCatalogDatabase(client, { jobId: 'job', token, kind: 'spotify' })
    await jobs.reserve('job', 'tracks', later, '2026-01-01T00:11:00.000Z')
    await expect(
      fenced.prepare("UPDATE connections SET label='stale'").run(),
    ).rejects.toBeInstanceOf(CatalogLeaseLostError)
    expect(database.prepare('SELECT label FROM connections').get()?.label).toBe('Synthetic')
    expect(database.prepare('SELECT COUNT(*) value FROM catalog_write_guards').get()?.value).toBe(0)
  })
})
