from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

import reconcile_source_runs as reconcile


class SyntheticRemote:
    target = {'account': 'synthetic', 'database': 'synthetic'}

    def __init__(self, database):
        self.db = database
        self.writes = 0
        self.before_mutation = None
        self.lose_response = False

    def query(self, sql, params, mutation=False):
        if mutation:
            self.writes += 1
            if self.before_mutation:
                self.before_mutation()
        result = [dict(row) for row in self.db.execute(sql, params)]
        self.db.commit()
        if mutation and self.lose_response:
            raise ConnectionError('Synthetic response lost after commit')
        return result


class SourceRunReconciliationTests(unittest.TestCase):
    def setUp(self):
        prior = os.umask(0o077)
        self.addCleanup(os.umask, prior)
        parent = reconcile.ROOT / '.private/deployment/tests'
        parent.mkdir(parents=True, exist_ok=True)
        temporary = tempfile.TemporaryDirectory(dir=parent)
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.path = self.directory / 'reviewed.json'
        self.now = datetime(2026, 10, 29, 23, tzinfo=timezone.utc)
        self.iso = reconcile.timestamp(self.now)
        self.ms = int(self.now.timestamp() * 1000)
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        self.addCleanup(self.db.close)
        for migration in sorted((reconcile.ROOT / 'packages/db/migrations').glob('*.sql')):
            self.db.executescript(migration.read_text())
        for source in ('spotify', 'hardcover', 'readwise'):
            self.db.execute('INSERT INTO connections VALUES(?,?,?,?,?,?,?)',
                (source, source, 'Synthetic', 'connected', 'complete', self.iso, self.iso))
        self.add_run('old-spotify')
        self.remote = SyntheticRemote(self.db)

    def add_run(self, run_id, source='spotify', age=timedelta(days=1), kind='reconcile'):
        self.db.execute('''INSERT INTO sync_runs(id,connection_id,kind,status,started_at,
          raw_object_count,source_record_count,normalized_record_count,failed_record_count)
          VALUES(?,?,?,'running',?,7,11,4,0)''',
          (run_id, source, kind, reconcile.timestamp(self.now - age)))
        self.db.commit()

    def plan(self, ids=None):
        return reconcile.create_plan(self.remote, ids or ['old-spotify'], self.path, self.now)

    def apply(self, plan, now=None):
        return reconcile.apply_plan(self.remote, self.path, plan['planSha256'], now or self.now)

    def status(self, run_id='old-spotify'):
        return self.db.execute('SELECT status FROM sync_runs WHERE id=?', (run_id,)).fetchone()[0]

    def add_admission(self, run_id=None):
        self.db.execute('''INSERT INTO source_sync_admission(source,day,attempts,started_at,
          outcome,reservation_json,usage_json,snapshot_run_id)
          VALUES('spotify','2026-10-28',3,?,'running','{}','{"inFlight":1}',?)''',
          (self.ms - 86400000, run_id))
        self.db.commit()

    def test_explicit_orphan_closes_once_and_repeat_is_a_verified_noop(self):
        plan = self.plan()
        self.assertEqual(self.remote.writes, 0)
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.apply(plan), {'reconciledRuns': 1, 'alreadyReconciled': 0})
        row = self.db.execute('SELECT * FROM sync_runs WHERE id=?', ('old-spotify',)).fetchone()
        self.assertEqual((row['status'], row['finished_at'], row['error_code']),
            ('failed', self.iso, reconcile.ERROR_CODE))
        self.assertEqual(self.apply(plan), {'reconciledRuns': 0, 'alreadyReconciled': 1})
        self.assertEqual(self.remote.writes, 1)

    def test_other_runs_counts_evidence_and_admission_accounting_do_not_change(self):
        self.add_run('unreviewed')
        self.add_admission()
        self.db.execute('''INSERT INTO raw_objects(id,connection_id,sync_run_id,kind,
          acquisition_key,storage_key,sha256,content_type,byte_length,acquired_at,processing_status)
          VALUES('raw','spotify','old-spotify','api_page','synthetic','synthetic',?,'application/json',2,?,'processed')''',
          ('a' * 64, self.iso))
        self.db.execute('''INSERT INTO source_records(id,raw_object_id,connection_id,record_type,
          record_path,observed_at,parser_version,disposition,upstream_state)
          VALUES('record','raw','spotify','synthetic','/0',?,'synthetic','normalized','active')''', (self.iso,))
        before = {table: [tuple(row) for row in self.db.execute('SELECT * FROM ' + table)]
                  for table in ('raw_objects', 'source_records', 'source_sync_admission', 'connections')}
        counts = tuple(self.db.execute('SELECT raw_object_count,source_record_count,normalized_record_count,failed_record_count,started_at FROM sync_runs WHERE id=?', ('old-spotify',)).fetchone())
        self.apply(self.plan())
        self.assertEqual(self.status('unreviewed'), 'running')
        self.assertEqual(counts, tuple(self.db.execute('SELECT raw_object_count,source_record_count,normalized_record_count,failed_record_count,started_at FROM sync_runs WHERE id=?', ('old-spotify',)).fetchone()))
        for table, rows in before.items():
            self.assertEqual(rows, [tuple(row) for row in self.db.execute('SELECT * FROM ' + table)])

    def test_active_global_source_lease_refuses_planning(self):
        self.db.execute('INSERT INTO source_sync_lease VALUES(?,?,?)', ('sources', 'synthetic', self.ms + 1))
        with self.assertRaisesRegex(reconcile.ReconciliationError, 'orphaned'):
            self.plan()
        self.assertFalse(self.path.exists())
        self.assertEqual(self.remote.writes, 0)

    def test_old_hardcover_snapshot_with_current_progress_is_never_an_orphan(self):
        self.add_run('old-hardcover', 'hardcover', age=timedelta(days=12))
        self.db.execute('INSERT INTO hardcover_sync_progress VALUES(?,?,?,?)',
            ('hardcover', 'old-hardcover', '{"complete":false,"pages":18}', self.iso))
        with self.assertRaisesRegex(reconcile.ReconciliationError, 'orphaned'):
            self.plan(['old-hardcover'])
        self.assertEqual(self.status('old-hardcover'), 'running')

    def test_admission_continuation_reference_prevents_reconciliation(self):
        self.add_admission('old-spotify')
        for outcome in ('running', 'failed', 'succeeded'):
            with self.subTest(outcome=outcome):
                self.db.execute('UPDATE source_sync_admission SET outcome=?', (outcome,))
                with self.assertRaisesRegex(reconcile.ReconciliationError, 'orphaned'):
                    self.plan()

    def test_any_catalog_role_uses_its_own_recovery_path(self):
        for state in ('pending', 'running', 'succeeded', 'failed'):
            with self.subTest(state=state):
                self.db.execute('''INSERT INTO spotify_catalog_backfill_jobs(id,connection_id,
                  sync_run_id,state,phase,created_at,updated_at)
                  VALUES('catalog','spotify','old-spotify',?,'tracks',?,?)''', (state, self.iso, self.iso))
                with self.assertRaisesRegex(reconcile.ReconciliationError, 'orphaned'):
                    self.plan()
                self.db.execute('DELETE FROM spotify_catalog_backfill_jobs')

    def test_cursor_backed_run_is_not_rewritten_even_if_its_status_is_inconsistent(self):
        self.db.execute("UPDATE sync_runs SET status='succeeded' WHERE id='old-spotify'")
        self.db.execute('INSERT INTO sync_cursors VALUES(?,?,?,?,?,?)',
            ('cursor', 'spotify', 'saved-episodes', '{}', self.iso, 'old-spotify'))
        self.db.execute("UPDATE sync_runs SET status='running' WHERE id='old-spotify'")
        with self.assertRaisesRegex(reconcile.ReconciliationError, 'orphaned'):
            self.plan()

    def test_recent_finished_import_and_unsupported_source_are_refused(self):
        self.add_run('recent', age=timedelta(minutes=19))
        self.add_run('import', kind='import')
        self.add_run('readwise', source='readwise')
        self.add_run('finished')
        self.db.execute("UPDATE sync_runs SET finished_at=? WHERE id='finished'", (self.iso,))
        for run_id in ('recent', 'import', 'readwise', 'finished', 'missing'):
            with self.subTest(run_id=run_id), self.assertRaises(reconcile.ReconciliationError):
                self.plan([run_id])

    def test_requires_distinct_explicit_ids_and_refuses_existing_plan(self):
        for ids in ([], ['old-spotify', 'old-spotify'], ['*'], ['a'] * 6):
            with self.subTest(ids=ids), self.assertRaises(reconcile.ReconciliationError):
                reconcile.create_plan(self.remote, ids, self.path, self.now)
        self.plan()
        with self.assertRaisesRegex(reconcile.ReconciliationError, 'existing plan'):
            self.plan()

    def test_reviewed_digest_target_and_freshness_are_required(self):
        plan = self.plan()
        with self.assertRaisesRegex(reconcile.ReconciliationError, 'fingerprint'):
            reconcile.apply_plan(self.remote, self.path, '0' * 64, self.now)
        with self.assertRaisesRegex(reconcile.ReconciliationError, 'stale'):
            self.apply(plan, self.now + timedelta(hours=2))
        with self.assertRaisesRegex(reconcile.ReconciliationError, 'future'):
            self.apply(plan, self.now - timedelta(seconds=1))
        self.remote.target = {'account': 'different', 'database': 'synthetic'}
        with self.assertRaisesRegex(reconcile.ReconciliationError, 'target'):
            self.apply(plan)
        self.assertEqual(self.remote.writes, 0)

    def test_changed_run_fingerprint_stops_before_mutation(self):
        plan = self.plan()
        self.db.execute("UPDATE sync_runs SET source_record_count=12 WHERE id='old-spotify'")
        with self.assertRaisesRegex(reconcile.ReconciliationError, 'fingerprint'):
            self.apply(plan)
        self.assertEqual(self.remote.writes, 0)

    def test_raced_lease_or_fingerprint_closes_zero_rows_atomically(self):
        for race in ("INSERT INTO source_sync_lease VALUES('sources','new-worker'," + str(self.ms + 1) + ')',
                     "UPDATE sync_runs SET source_record_count=12 WHERE id='second'"):
            with self.subTest(race=race):
                self.add_run('second')
                plan = self.plan(['old-spotify', 'second'])
                self.remote.before_mutation = lambda: self.db.execute(race)
                with self.assertRaisesRegex(reconcile.ReconciliationError, 'Atomic'):
                    self.apply(plan)
                self.assertEqual(self.status(), 'running')
                self.assertEqual(self.status('second'), 'running')
                self.remote.before_mutation = None
                self.db.execute('DELETE FROM source_sync_lease')
                self.db.execute("DELETE FROM sync_runs WHERE id='second'")
                for path in self.directory.glob('reviewed*'):
                    path.unlink()

    def test_multiple_reviewed_rows_close_in_one_atomic_statement(self):
        self.add_run('old-hardcover', 'hardcover')
        self.assertEqual(self.apply(self.plan(['old-spotify', 'old-hardcover']))['reconciledRuns'], 2)
        self.assertEqual(self.remote.writes, 1)
        self.assertEqual(self.status('old-hardcover'), 'failed')

    def test_lost_success_response_can_only_be_reconciled_by_exact_readback(self):
        plan = self.plan()
        self.remote.lose_response = True
        with self.assertRaises(ConnectionError):
            self.apply(plan)
        self.remote.lose_response = False
        self.assertEqual(self.apply(plan)['alreadyReconciled'], 1)
        self.assertEqual(self.remote.writes, 1)

    def test_failed_attempt_cannot_blindly_retry_or_refund_admission(self):
        plan = self.plan()
        self.remote.before_mutation = lambda: self.db.execute(
            "INSERT INTO source_sync_lease VALUES('sources','new-worker',?)", (self.ms + 1,))
        with self.assertRaises(reconcile.ReconciliationError):
            self.apply(plan)
        self.db.execute('DELETE FROM source_sync_lease')
        with self.assertRaisesRegex(reconcile.ReconciliationError, 'uncertain'):
            self.apply(plan)
        self.assertEqual(self.remote.writes, 1)

    def test_receipts_require_private_permissions_and_no_symlinks(self):
        plan = self.plan()
        self.path.chmod(0o644)
        with self.assertRaisesRegex(reconcile.ReconciliationError, 'protected'):
            self.apply(plan)
        self.path.chmod(0o600)
        linked = self.directory / 'linked.json'
        linked.symlink_to(self.path)
        with self.assertRaisesRegex(reconcile.ReconciliationError, 'links'):
            reconcile.apply_plan(self.remote, linked, plan['planSha256'], self.now)

    def test_broad_parent_and_unknown_schema_fail_before_mutation(self):
        self.directory.chmod(0o755)
        with self.assertRaisesRegex(reconcile.ReconciliationError, 'protected'):
            self.plan()
        self.directory.chmod(0o700)
        self.db.execute('DROP TABLE hardcover_sync_progress')
        with self.assertRaises(sqlite3.OperationalError):
            self.plan()
        self.assertEqual(self.remote.writes, 0)
        self.assertFalse(self.path.exists())

    def test_native_read_accounting_and_error_content_fail_closed(self):
        token = self.directory / 'synthetic-token'
        token.write_text('synthetic-secret')
        remote = reconcile.Remote('1' * 32, 'a' * 8 + '-aaaa-aaaa-aaaa-' + 'a' * 12, token)
        with patch.object(reconcile, 'fetch', return_value=(403, b'synthetic-private-error')):
            with self.assertRaisesRegex(reconcile.ReconciliationError, '^Cloudflare reconciliation request failed \\(HTTP 403\\)$'):
                remote.query('SELECT 1', [])
        payload = {'success': True, 'result': [{'success': True, 'results': [], 'meta': {'rows_written': 1}}]}
        with patch.object(reconcile, 'fetch', return_value=(200, json.dumps(payload).encode())):
            with self.assertRaisesRegex(reconcile.ReconciliationError, 'reported writes'):
                remote.query('SELECT 1', [])


if __name__ == '__main__':
    unittest.main()
