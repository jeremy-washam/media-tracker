import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SourceSyncQueuedResponseSchema } from '@media-tracker/contracts'
import app from './app'
import type { Bindings } from './env'
import { operatingWorkAllowed } from './operating-budget'
import { syncReadwiseArchive } from './readwise-sync'
import { syncHardcover } from './hardcover-sync'
import { syncLetterboxdRss } from './letterboxd-rss-sync'
import { syncSpotifySavedEpisodes } from './spotify-sync'
import { TestDatabase, TestBucket } from './testing/storage'

vi.mock('./operating-budget', async (original) => ({
  ...(await original<typeof import('./operating-budget')>()),
  operatingWorkAllowed: vi.fn(async () => true),
}))
vi.mock('./readwise-sync', async (original) => ({
  ...(await original<typeof import('./readwise-sync')>()),
  syncReadwiseArchive: vi.fn(async () => ({
    syncRunId: 'local-run',
    pages: 1,
    sourceRecords: 2,
    archiveItems: 2,
  })),
}))
vi.mock('./hardcover-sync', async (original) => ({
  ...(await original<typeof import('./hardcover-sync')>()),
  syncHardcover: vi.fn(async () => ({
    syncRunId: 'local-run',
    mode: 'reconcile',
    pages: 1,
    sourceRecords: 2,
    books: 2,
    archiveEntries: 1,
  })),
}))
vi.mock('./letterboxd-rss-sync', async (original) => ({
  ...(await original<typeof import('./letterboxd-rss-sync')>()),
  syncLetterboxdRss: vi.fn(async () => ({
    syncRunId: 'local-run',
    unchanged: false,
    feedEntries: 2,
    archiveEntries: 2,
    sourceRecords: 2,
    unresolvedRecords: 0,
  })),
}))
vi.mock('./spotify-sync', async (original) => ({
  ...(await original<typeof import('./spotify-sync')>()),
  syncSpotifySavedEpisodes: vi.fn(async () => ({
    syncRunId: 'local-run',
    mode: 'reconcile',
    pages: 1,
    sourceRecords: 2,
    archiveEpisodes: 2,
    queueCandidates: 0,
    unresolvedEpisodes: 0,
    refreshTokenRotated: false,
  })),
}))

const sources = ['letterboxd', 'hardcover', 'readwise', 'spotify'] as const
const providers = [syncReadwiseArchive, syncHardcover, syncLetterboxdRss, syncSpotifySavedEpisodes]
const at = Date.parse('2026-10-30T01:00:00Z')
describe('hosted manual source dispatch', () => {
  let database: TestDatabase
  let env: Bindings
  let send: ReturnType<typeof vi.fn>
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(Date, 'now').mockReturnValue(at)
    vi.mocked(operatingWorkAllowed).mockResolvedValue(true)
    database = new TestDatabase()
    send = vi.fn(async () => undefined)
    env = {
      AUTH_MODE: 'access',
      SYNC_ENABLED: 'true',
      SYNC_SOURCES: sources.join(','),
      HARDCOVER_TOKEN: 'synthetic',
      READWISE_TOKEN: 'synthetic',
      LETTERBOXD_USERNAME: 'synthetic',
      SPOTIFY_CLIENT_ID: 'synthetic',
      SPOTIFY_REFRESH_TOKEN: 'synthetic',
      TOKEN_ENCRYPTION_KEY: 'synthetic',
      DB: database,
      RAW_BUCKET: new TestBucket(),
      SYNC_QUEUE: { send },
    } as unknown as Bindings
  })
  afterEach(() => {
    database.sqlite.close()
    vi.restoreAllMocks()
  })
  const post = async (source: (typeof sources)[number]) =>
    app.request(
      `/api/connections/${source}/sync`,
      { method: 'POST', headers: { 'x-request-id': 'manual-receipt' } },
      env,
    )
  const noProvider = () => providers.forEach((provider) => expect(provider).not.toHaveBeenCalled())
  const admission = (changes = '') =>
    database.sqlite.exec(
      `INSERT INTO source_sync_admission(source,day,attempts,started_at,outcome,reservation_json,usage_json,retry_count) VALUES('spotify','2026-10-29',3,${at - 8 * 3600000},'running','{}','{"inFlight":1}',2);${changes}`,
    )

  it.each(sources)(
    'queues %s without reserving or executing the source in HTTP',
    async (source) => {
      const before = database.sqlite.prepare('SELECT total_changes() changes').get()?.changes
      const response = await post(source)
      expect(response.status).toBe(202)
      expect(SourceSyncQueuedResponseSchema.parse(await response.json())).toEqual({
        status: 'queued',
        source,
        requestId: 'manual-receipt',
      })
      expect(send).toHaveBeenCalledExactlyOnceWith({
        operation: 'sync_source',
        source,
        idempotencyKey: `source-sync:${source}:manual:manual-receipt`,
      })
      expect(database.sqlite.prepare('SELECT total_changes() changes').get()?.changes).toBe(before)
      noProvider()
    },
  )

  it('does not return a queued receipt before the Queue send is confirmed', async () => {
    let release!: () => void
    send.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    let settled = false
    const pending = post('readwise').then((response) => {
      settled = true
      return response
    })
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce())
    expect(settled).toBe(false)
    noProvider()
    release()
    expect((await pending).status).toBe(202)
  })

  it.each(sources)('rejects disabled %s before enqueueing', async (source) => {
    env.SYNC_SOURCES = ''
    expect((await post(source)).status).toBe(503)
    expect(send).not.toHaveBeenCalled()
    noProvider()
  })

  it.each(sources)('rejects unconfigured %s before enqueueing', async (source) => {
    const keys = {
      letterboxd: 'LETTERBOXD_USERNAME',
      hardcover: 'HARDCOVER_TOKEN',
      readwise: 'READWISE_TOKEN',
      spotify: 'TOKEN_ENCRYPTION_KEY',
    } as const
    delete env[keys[source]]
    expect((await post(source)).status).toBe(503)
    expect(send).not.toHaveBeenCalled()
    noProvider()
  })

  it('honors the global sync and operating gates before any admission read', async () => {
    const prepare = vi.spyOn(database, 'prepare')
    env.SYNC_ENABLED = 'false'
    expect((await post('spotify')).status).toBe(503)
    env.SYNC_ENABLED = 'true'
    vi.mocked(operatingWorkAllowed).mockResolvedValue(false)
    expect((await post('spotify')).status).toBe(503)
    expect(prepare).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    noProvider()
  })

  it('rejects a live global lease or uncertain exhausted admission without changing accounting', async () => {
    database.sqlite.exec(`INSERT INTO source_sync_lease VALUES('sources','other',${at + 60000})`)
    expect((await post('spotify')).status).toBe(503)
    database.sqlite.exec('DELETE FROM source_sync_lease')
    admission()
    const before = database.sqlite.prepare('SELECT * FROM source_sync_admission').all()
    expect((await post('spotify')).status).toBe(503)
    expect(database.sqlite.prepare('SELECT * FROM source_sync_admission').all()).toEqual(before)
    expect(send).not.toHaveBeenCalled()
    noProvider()
  })

  it('permits an eligible retained retry without claiming it in HTTP', async () => {
    admission(
      `UPDATE source_sync_admission SET attempts=2,retry_count=1,outcome='failed',
      reservation_json='{"requests":32,"pages":24,"records":1000,"bytes":8388608}',
      usage_json='{"requests":4,"pages":2,"records":25,"bytes":1000}'`,
    )
    const before = database.sqlite.prepare('SELECT * FROM source_sync_admission').all()
    expect((await post('spotify')).status).toBe(202)
    expect(database.sqlite.prepare('SELECT * FROM source_sync_admission').all()).toEqual(before)
    expect(send).toHaveBeenCalledOnce()
    noProvider()
  })

  it('queues a known Hardcover snapshot continuation without changing its progress or allocation', async () => {
    database.sqlite.exec(`
      INSERT INTO connections(id,source,label,status,coverage,created_at,updated_at)
        VALUES('hardcover','hardcover','Synthetic','connected','complete','2026-10-29','2026-10-29');
      INSERT INTO sync_runs(id,connection_id,kind,status,started_at)
        VALUES('snapshot','hardcover','reconcile','running','2026-10-29T17:00:00Z');
      INSERT INTO hardcover_sync_progress VALUES('hardcover','snapshot','{"complete":false,"scanComplete":false}','2026-10-29T17:01:00Z');
      INSERT INTO source_sync_admission(source,day,attempts,started_at,outcome,reservation_json,usage_json,snapshot_run_id)
        VALUES('hardcover','2026-10-29',20,${at - 8 * 3600000},'running',
          '{"requests":128,"pages":64,"records":7000,"bytes":33554432}',
          '{"requests":20,"pages":20,"records":1000,"bytes":10000}', 'snapshot');
    `)
    const before = database.sqlite.prepare('SELECT total_changes() changes').get()?.changes
    expect((await post('hardcover')).status).toBe(202)
    expect(database.sqlite.prepare('SELECT total_changes() changes').get()?.changes).toBe(before)
    expect(send).toHaveBeenCalledOnce()
    noProvider()
  })

  it('honors provider cooldown and completed daily admission without enqueueing', async () => {
    admission(
      `UPDATE source_sync_admission SET attempts=1,retry_count=0,outcome='failed',usage_json='{}',retry_not_before=${at + 60000}`,
    )
    const cooldown = database.sqlite.prepare('SELECT * FROM source_sync_admission').all()
    expect((await post('spotify')).status).toBe(503)
    expect(database.sqlite.prepare('SELECT * FROM source_sync_admission').all()).toEqual(cooldown)
    database.sqlite.exec("UPDATE source_sync_admission SET outcome='succeeded',retry_not_before=0")
    expect((await post('spotify')).status).toBe(503)
    expect(send).not.toHaveBeenCalled()
    noProvider()
  })

  it('honors the existing rolling source ceiling without reserving new work', async () => {
    for (let i = 0; i < 10; i++)
      database.sqlite
        .prepare(
          "INSERT INTO source_sync_admission(source,day,attempts,started_at,outcome,reservation_json) VALUES(?,'2026-10-30',1,?,'running','{}')",
        )
        .run(`synthetic-${i}`, at)
    const before = database.sqlite
      .prepare('SELECT * FROM source_sync_admission ORDER BY source')
      .all()
    expect((await post('readwise')).status).toBe(503)
    expect(
      database.sqlite.prepare('SELECT * FROM source_sync_admission ORDER BY source').all(),
    ).toEqual(before)
    expect(send).not.toHaveBeenCalled()
    noProvider()
  })

  it('does not acknowledge a failed or uncertain enqueue as queued', async () => {
    send.mockRejectedValueOnce(new Error('synthetic private queue response'))
    const response = await post('readwise')
    expect(response.status).toBe(503)
    const body = JSON.stringify(await response.json())
    expect(body).toContain('enqueue could not be confirmed')
    expect(body).not.toContain('synthetic private')
    expect(body).not.toContain('syncRunId')
    noProvider()
  })

  it.each(sources)('preserves local synchronous %s completion with HTTP 200', async (source) => {
    env.AUTH_MODE = 'local'
    const response = await post(source)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ syncRunId: 'local-run' })
    expect(send).not.toHaveBeenCalled()
    expect(
      providers.reduce((total, provider) => total + vi.mocked(provider).mock.calls.length, 0),
    ).toBe(1)
  })
})
