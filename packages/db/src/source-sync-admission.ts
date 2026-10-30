import type { DatabaseClient } from './database'

export interface SourceSyncReservation {
  started_at: number
  reservation_json: string
  usage_json: string
  attempts: number
  snapshot_run_id: string | null
  scan_complete: number
}

const knownPending = `a.source='hardcover' AND a.outcome='running' AND a.stop_reason IS NULL
  AND a.usage_json IS NOT NULL AND json_type(a.usage_json)='object' AND COALESCE(json_extract(a.usage_json,'$.inFlight'),0)=0
  AND EXISTS (SELECT 1 FROM hardcover_sync_progress hp
    WHERE hp.sync_run_id=a.snapshot_run_id AND COALESCE(json_extract(hp.checkpoint_json,'$.complete'),0)=0
    AND NOT EXISTS (SELECT 1 FROM sync_cursors sc
      WHERE sc.connection_id=hp.connection_id AND sc.name='library-books' AND sc.sync_run_id=hp.sync_run_id))`

/** Daily source admission plus a global lease shared by HTTP, cron, and queues. */
export class SqlSourceSyncAdmission {
  constructor(private readonly db: DatabaseClient) {}

  async withinAllowance(now = Date.now()): Promise<boolean> {
    // A rolling operational ceiling, not an expiring grant or lifetime quota.
    // Old records remain evidence without eventually disabling routine sync.
    const row = await this.db
      .prepare(
        `SELECT COUNT(*) jobs,
      COALESCE(SUM(CASE WHEN outcome='running' OR usage_json IS NULL OR COALESCE(json_extract(usage_json,'$.failedOperations'),0)>0 OR COALESCE(json_extract(usage_json,'$.unmeasuredNonFirstStatements'),0)>0
        THEN 1000000 ELSE COALESCE(json_extract(usage_json,'$.rowsWritten'),1000000) END),0) writes,
      COALESCE(SUM(CASE WHEN outcome='running' OR usage_json IS NULL OR COALESCE(json_extract(usage_json,'$.failedOperations'),0)>0 OR COALESCE(json_extract(usage_json,'$.unmeasuredNonFirstStatements'),0)>0
        THEN 100000000 ELSE COALESCE(json_extract(usage_json,'$.rowsRead'),100000000) END),0) reads
      FROM source_sync_admission WHERE started_at >= ?`,
      )
      .bind(now - 86400000)
      .first<{ jobs: number; writes: number; reads: number }>()
    return row !== null && row.jobs < 100 && row.writes < 10000000 && row.reads < 1000000000
  }

  async resumable(source: string, now = Date.now()): Promise<SourceSyncReservation | null> {
    if (source !== 'hardcover') return null
    return this.db
      .prepare(
        `SELECT a.started_at,a.reservation_json,a.usage_json,a.attempts,a.snapshot_run_id,
      COALESCE((SELECT json_extract(hp.checkpoint_json,'$.scanComplete') FROM hardcover_sync_progress hp
        WHERE hp.sync_run_id=a.snapshot_run_id LIMIT 1),0) scan_complete
      FROM source_sync_admission a WHERE a.source=? AND a.retry_not_before<=? AND ${knownPending}
      ORDER BY a.started_at DESC LIMIT 1`,
      )
      .bind(source, now)
      .first<SourceSyncReservation>()
  }

  async claimContinuation(source: string, started: number, now = Date.now()) {
    const result = await this.db
      .prepare(
        `UPDATE source_sync_admission AS a SET attempts=attempts+1,
      usage_json=json_set(usage_json,'$.inFlight',1)
      WHERE source=? AND started_at=? AND attempts<96 AND retry_not_before<=? AND ${knownPending}
      RETURNING source`,
      )
      .bind(source, started, now)
      .all<{ source: string }>()
    return result.results.length === 1
  }

  async available(source: string, now: number): Promise<boolean> {
    const row = await this.db
      .prepare(
        `SELECT 1 FROM source_sync_admission a WHERE a.source=?
      AND (a.day=? OR a.started_at>? OR a.retry_not_before>? OR (${knownPending})) LIMIT 1`,
      )
      .bind(source, new Date(now).toISOString().slice(0, 10), now - 23 * 60 * 60_000, now)
      .first()
    return row === null
  }

  async acquire(owner: string, now: number): Promise<boolean> {
    const result = await this.db
      .prepare(
        `
      INSERT INTO source_sync_lease(id,owner,expires_at) VALUES('sources',?,?)
      ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at
      WHERE source_sync_lease.expires_at<=? RETURNING owner`,
      )
      .bind(owner, now + 20 * 60_000, now)
      .all<{ owner: string }>()
    return result.results.length === 1
  }

  async reserve(source: string, now: number, reservation: string): Promise<boolean> {
    const result = await this.db
      .prepare(
        `INSERT OR IGNORE INTO source_sync_admission
      (source,day,attempts,started_at,outcome,reservation_json)
      SELECT ?,?,1,?,'running',? WHERE NOT EXISTS (
        SELECT 1 FROM source_sync_admission a WHERE a.source=? AND
          (a.started_at>? OR a.retry_not_before>? OR (${knownPending}))) RETURNING source`,
      )
      .bind(
        source,
        new Date(now).toISOString().slice(0, 10),
        now,
        reservation,
        source,
        now - 23 * 60 * 60_000,
        now,
      )
      .all<{ source: string }>()
    return result.results.length === 1
  }

  async retryable(source: string, now: number): Promise<SourceSyncReservation | null> {
    // A retained allocation does not expire at midnight. Only its latest
    // admission may retry; an older failure cannot bypass newer work.
    return this.db
      .prepare(
        `SELECT started_at,reservation_json,usage_json,attempts,snapshot_run_id,
      COALESCE((SELECT json_extract(hp.checkpoint_json,'$.scanComplete') FROM hardcover_sync_progress hp
        WHERE hp.sync_run_id=a.snapshot_run_id LIMIT 1),0) scan_complete
      FROM source_sync_admission a WHERE source=? AND outcome='failed'
      AND retry_count<2 AND attempts<CASE WHEN source='hardcover' THEN 96 ELSE 3 END
      AND usage_json IS NOT NULL AND json_type(usage_json)='object' AND COALESCE(json_extract(usage_json,'$.inFlight'),0)=0
      AND stop_reason IS NULL AND retry_not_before<=?
      AND NOT EXISTS (SELECT 1 FROM source_sync_admission newer
        WHERE newer.source=a.source AND newer.started_at>a.started_at)
      ORDER BY started_at DESC LIMIT 1`,
      )
      .bind(source, now)
      .first<SourceSyncReservation>()
  }

  async claimRetry(source: string, started: number, now = Date.now()): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE source_sync_admission AS a SET attempts=attempts+1,
      retry_count=retry_count+1,outcome='running',finished_at=NULL,
      usage_json=json_set(usage_json,'$.inFlight',1)
      WHERE source=? AND day=? AND started_at=? AND outcome='failed' AND retry_count<2
      AND attempts<CASE WHEN source='hardcover' THEN 96 ELSE 3 END AND stop_reason IS NULL
      AND usage_json IS NOT NULL AND json_type(usage_json)='object' AND COALESCE(json_extract(usage_json,'$.inFlight'),0)=0
      AND retry_not_before<=?
      AND NOT EXISTS (SELECT 1 FROM source_sync_admission newer
        WHERE newer.source=a.source AND newer.started_at>a.started_at)
      RETURNING source`,
      )
      .bind(source, new Date(started).toISOString().slice(0, 10), started, now)
      .all<{ source: string }>()
    return result.results.length === 1
  }

  async exhaust(source: string, started: number, now: number, reason: string) {
    // Keep the snapshot checkpoint; tomorrow's fresh daily allocation can resume
    // it, but hourly scheduling must not enqueue this exhausted allocation again.
    const update = this.db
      .prepare(
        `UPDATE source_sync_admission SET outcome='failed',finished_at=?,stop_reason=?
      WHERE source=? AND started_at=?`,
      )
      .bind(now, reason, source, started)
    const run = this.db
      .prepare(
        `UPDATE sync_runs SET status='failed',finished_at=?,error_code='source_sync_limit',
      error_message='Source sync safety limit reached; checkpoint retained for the next daily attempt.'
      WHERE id=(SELECT snapshot_run_id FROM source_sync_admission WHERE source=? AND started_at=?)
      AND status='running' AND NOT EXISTS (SELECT 1 FROM sync_cursors WHERE sync_run_id=sync_runs.id)`,
      )
      .bind(new Date(now).toISOString(), source, started)
    await this.db.batch([update, run])
  }

  async finish(
    source: string,
    started: number,
    finished: number,
    outcome: 'succeeded' | 'failed' | 'running',
    usage: string,
    details: { snapshotRunId?: string; retryNotBefore?: number } = {},
  ) {
    await this.db
      .prepare(
        `UPDATE source_sync_admission SET finished_at=?,outcome=?,usage_json=?,
      snapshot_run_id=COALESCE(?,snapshot_run_id,CASE WHEN source='hardcover' THEN (
        SELECT hp.sync_run_id FROM hardcover_sync_progress hp JOIN connections c ON c.id=hp.connection_id
        WHERE c.source='hardcover' AND NOT EXISTS (SELECT 1 FROM sync_cursors sc WHERE sc.name='library-books'
          AND sc.connection_id=hp.connection_id AND sc.sync_run_id=hp.sync_run_id) LIMIT 1) END),
      retry_not_before=MAX(retry_not_before,?) WHERE source=? AND day=? AND started_at=?`,
      )
      .bind(
        outcome === 'running' ? null : finished,
        outcome,
        usage,
        details.snapshotRunId ?? null,
        details.retryNotBefore ?? 0,
        source,
        new Date(started).toISOString().slice(0, 10),
        started,
      )
      .run()
  }

  async release(owner: string) {
    await this.db
      .prepare('DELETE FROM source_sync_lease WHERE id=? AND owner=?')
      .bind('sources', owner)
      .run()
  }
}
