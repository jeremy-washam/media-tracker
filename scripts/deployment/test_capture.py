import copy
import hashlib
import io
import json
import os
import re
from pathlib import Path
import sqlite3
import unittest
from unittest.mock import patch

import capture
import recovery
import snapshot
import test_snapshot

requires_shadow_writes = unittest.skipUnless(capture.shadow_writes_supported(), 'This system SQLite forbids local FTS shadow reconstruction; run this suite with a standard Python/SQLite build')


class SyntheticRemote:
    account, database, bucket = 'synthetic-account', 'synthetic-database', 'synthetic-bucket'

    def __init__(self, fixture):
        self.db = sqlite3.connect(fixture.database)
        self.db.row_factory = sqlite3.Row
        self.data = (fixture.blobs / 'synthetic-blob').read_bytes()
        self.objects = {'content/text': {'key': 'content/text', 'etag': hashlib.md5(self.data).hexdigest(), 'size': len(self.data), 'http_metadata': {'contentType': 'text/plain'}, 'custom_metadata': {'synthetic': 'yes'}}}
        self.downloads = 0
        self.calls = []
        self.fail_after = None
        self.bookmarks = 0

    def close(self):
        self.db.close()

    def query(self, sql, params=None):
        self.calls.append(sql)
        if self.fail_after is not None and len(self.calls) >= self.fail_after:
            raise capture.CaptureError('Synthetic interrupted read')
        if not sql.startswith('SELECT '):
            raise AssertionError('A remote mutation was attempted')
        return [dict(row) for row in self.db.execute(sql, params or [])]

    def bookmark(self):
        self.bookmarks += 1
        # Timestamp-derived bookmark differences must not be mistaken for writes.
        return {'bookmark': 'synthetic-time-' + str(self.bookmarks)}

    def inventory(self):
        return copy.deepcopy(self.objects)

    def download(self, item, path):
        self.downloads += 1
        return capture.stream_object(io.BytesIO(self.data), path, item)


class CaptureTests(unittest.TestCase):
    def setUp(self):
        self.previous_umask = os.umask(0o077)
        self.addCleanup(os.umask, self.previous_umask)
        self.fixture = test_snapshot.SnapshotTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.tearDown)
        self.remote = SyntheticRemote(self.fixture)
        self.addCleanup(self.remote.close)
        self.output = self.fixture.root / 'capture'

    @requires_shadow_writes
    def test_read_only_full_capture_preserves_contentless_fts_and_source_evidence(self):
        report = capture.capture(self.remote, self.output, pause_id='synthetic-window', writers_paused=True, page_size=1)
        self.assertTrue(report['independentRestoreVerified'])
        self.assertEqual(report['referencesVerified'], 2)
        self.assertEqual(self.remote.downloads, 1)
        self.assertTrue(all(sql.startswith('SELECT ') for sql in self.remote.calls))
        recovery.verify(self.output, require_rehearsal=True)
        captured = sqlite3.connect(self.output / 'database.sqlite')
        restored = sqlite3.connect(self.output / 'restored.sqlite')
        self.addCleanup(captured.close)
        self.addCleanup(restored.close)
        for db in (captured, restored):
            self.assertEqual(db.execute("SELECT rowid FROM article_content_search WHERE article_content_search MATCH 'apples'").fetchall(), [(7,)])
            self.assertEqual(db.execute("SELECT rowid FROM metadata_search WHERE metadata_search MATCH 'phrase'").fetchall(), [(9,)])
            self.assertEqual(db.execute("SELECT blob FROM records WHERE id='synthetic'").fetchone()[0], b'\x00\xff')
        self.assertEqual(snapshot.vocabulary(captured, 'article_content_search'), snapshot.vocabulary(restored, 'article_content_search'))

    @requires_shadow_writes
    def test_hidden_rowids_large_integers_real_nul_text_and_composite_keys_are_exact(self):
        self.remote.db.executescript('CREATE TABLE exact(id TEXT PRIMARY KEY,value INTEGER,real_value REAL); CREATE TABLE composite(a INTEGER,b TEXT,PRIMARY KEY(a,b)) WITHOUT ROWID; CREATE TABLE allocator(id INTEGER PRIMARY KEY AUTOINCREMENT); INSERT INTO allocator DEFAULT VALUES; DELETE FROM allocator;')
        self.remote.db.execute('INSERT INTO exact(rowid,id,value,real_value) VALUES(?,?,?,?)', (9007199254740993, 'nul\x00text', 9223372036854775807, 0.12345678901234567))
        self.remote.db.executemany('INSERT INTO composite VALUES(?,?)', [(9223372036854775807, 'a'), (9223372036854775807, 'b')])
        self.remote.db.commit()
        capture.capture(self.remote, self.output, pause_id='synthetic-window', writers_paused=True, page_size=1)
        db = sqlite3.connect(self.output / 'database.sqlite')
        self.addCleanup(db.close)
        self.assertEqual(db.execute('SELECT rowid,* FROM exact').fetchall(), [(9007199254740993, 'nul\x00text', 9223372036854775807, 0.12345678901234567)])
        self.assertEqual(db.execute('SELECT * FROM composite ORDER BY a,b').fetchall(), [(9223372036854775807, 'a'), (9223372036854775807, 'b')])
        self.assertEqual(db.execute("SELECT seq FROM sqlite_sequence WHERE name='allocator'").fetchall(), [(1,)])

    @requires_shadow_writes
    def test_prior_transfer_receipts_are_retained_separately_from_restored_target(self):
        self.remote.db.executescript("CREATE TABLE imladris_deployment_receipts(bundle TEXT,path TEXT,sha256 TEXT); INSERT INTO imladris_deployment_receipts VALUES('synthetic-bundle','schema.sql','synthetic-hash');")
        capture.capture(self.remote, self.output, pause_id='synthetic-window', writers_paused=True)
        state = json.loads((self.output / 'capture.json').read_text())
        self.assertEqual(state['previousTransferReceipts'], [{'bundle': 'synthetic-bundle', 'path': 'schema.sql', 'sha256': 'synthetic-hash'}])
        self.assertEqual(recovery.verify(self.output, True)['status'], 'passed')

    @requires_shadow_writes
    def test_compatibility_views_exist_before_their_instead_of_triggers(self):
        self.remote.db.executescript("""
          CREATE TABLE compact_links(id TEXT UNIQUE,owner INTEGER,PRIMARY KEY(owner)) WITHOUT ROWID;
          INSERT INTO compact_links VALUES('retained',7);
          CREATE VIEW source_links AS SELECT id,owner FROM compact_links;
          CREATE TRIGGER source_link_insert INSTEAD OF INSERT ON source_links BEGIN INSERT INTO compact_links VALUES(NEW.id,NEW.owner); END;
        """)
        capture.capture(self.remote, self.output, pause_id='synthetic-window', writers_paused=True)
        self.assertEqual(recovery.verify(self.output, True)['status'], 'passed')
        db = sqlite3.connect(self.output / 'restored.sqlite')
        self.addCleanup(db.close)
        db.execute("INSERT INTO source_links VALUES('new',8)")
        self.assertEqual(db.execute('SELECT * FROM compact_links ORDER BY owner').fetchall(), [('retained', 7), ('new', 8)])

    @requires_shadow_writes
    def test_live_operating_state_can_change_without_weakening_source_inventory(self):
        original = self.remote.inventory
        def changing_inventory():
            result = original()
            self.remote.bookmarks += 1
            result['operations/operating-state.json'] = {'key': 'operations/operating-state.json', 'etag': str(self.remote.bookmarks), 'size': 123}
            return result
        self.remote.inventory = changing_inventory
        capture.capture(self.remote, self.output, pause_id='synthetic-window', writers_paused=True)
        state = json.loads((self.output / 'capture.json').read_text())
        self.assertEqual(state['identity']['excludedLiveOperationalKeys'], ['operations/operating-state.json'])
        manifest = json.loads((self.output / 'manifest.json').read_text())
        self.assertNotIn('operations/operating-state.json', manifest['objects'])
        self.assertIn('content/text', manifest['objects'])

    @requires_shadow_writes
    def test_different_pause_id_cannot_resume_a_partial_capture(self):
        self.remote.fail_after = 5
        with self.assertRaises(capture.CaptureError):
            capture.capture(self.remote, self.output, pause_id='first-window', writers_paused=True)
        self.remote.fail_after = None
        with self.assertRaisesRegex(capture.CaptureError, 'changed'):
            capture.capture(self.remote, self.output, pause_id='second-window', writers_paused=True)

    def test_durable_native_request_and_read_counters_survive_restart(self):
        token = self.fixture.root / 'synthetic-token'
        token.write_text('synthetic-value')
        client = capture.Client('account', 'database', 'bucket', token)
        meter = self.fixture.root / 'usage.json'
        client.configure_meter(meter)
        client.requests, client.rows_read = 5, 42
        client.persist_meter()
        next_client = capture.Client('account', 'database', 'bucket', token)
        next_client.configure_meter(meter)
        self.assertEqual((next_client.requests, next_client.rows_read), (5, 42))
        response = {'result': [{'success': True, 'results': [], 'meta': {'rows_written': 0, 'rows_read': 100_000_000}}]}
        with patch.object(next_client, 'request', return_value=response):
            with self.assertRaisesRegex(capture.CaptureError, 'read ceiling'):
                next_client.query('SELECT 1')
        self.assertEqual(json.loads(meter.read_text())['rowsRead'], 100_000_042)
        with patch.object(next_client, 'request') as request:
            with self.assertRaisesRegex(capture.CaptureError, 'already exhausted'):
                next_client.query('SELECT 1')
            request.assert_not_called()

    def test_existing_local_lock_blocks_all_remote_reads(self):
        self.output.mkdir(mode=0o700)
        import fcntl
        with (self.output / 'capture.lock').open('a') as lock:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            with patch('capture.shadow_writes_supported', return_value=True):
                with self.assertRaises(BlockingIOError):
                    capture.capture(self.remote, self.output, pause_id='synthetic-window', writers_paused=True)
        self.assertEqual(self.remote.calls, [])

    @requires_shadow_writes
    def test_interrupted_database_copy_resumes_without_duplicates(self):
        self.remote.fail_after = 5
        with self.assertRaises(capture.CaptureError):
            capture.capture(self.remote, self.output, pause_id='synthetic-window', writers_paused=True, page_size=1)
        self.remote.fail_after = None
        capture.capture(self.remote, self.output, pause_id='synthetic-window', writers_paused=True, page_size=1)
        self.assertEqual(recovery.verify(self.output, True)['status'], 'passed')

    @requires_shadow_writes
    def test_retained_object_reuse_requires_current_etag_and_fresh_local_sha(self):
        self.fixture.bundle()
        report = capture.capture(self.remote, self.output, pause_id='synthetic-window', writers_paused=True, reuse=self.fixture.output)
        self.assertEqual(report['reusedObjects'], 1)
        self.assertEqual(self.remote.downloads, 0)

    @requires_shadow_writes
    def test_corrupt_retained_object_is_downloaded_again(self):
        manifest = self.fixture.bundle()
        (self.fixture.output / manifest['objects']['content/text']['path']).write_bytes(b'corrupt')
        report = capture.capture(self.remote, self.output, pause_id='synthetic-window', writers_paused=True, reuse=self.fixture.output)
        self.assertEqual(report['reusedObjects'], 0)
        self.assertEqual(self.remote.downloads, 1)

    @requires_shadow_writes
    def test_current_etag_mismatch_refuses_reusing_old_valid_bytes(self):
        self.fixture.bundle()
        self.remote.data = self.remote.data + b'changed'
        item = self.remote.objects['content/text']
        item['etag'] = hashlib.md5(self.remote.data).hexdigest()
        # Keep old database reference deliberately: independent evidence validation
        # must reject a changed object, even when its native download is valid.
        item['size'] = len(self.remote.data)
        with self.assertRaisesRegex(ValueError, 'reference'):
            capture.capture(self.remote, self.output, pause_id='synthetic-window', writers_paused=True, reuse=self.fixture.output)
        self.assertEqual(self.remote.downloads, 1)

    @requires_shadow_writes
    def test_resume_rejects_changed_inventory(self):
        self.remote.fail_after = 5
        with self.assertRaises(capture.CaptureError):
            capture.capture(self.remote, self.output, pause_id='synthetic-window', writers_paused=True, page_size=1)
        self.remote.fail_after = None
        self.remote.objects['content/text']['etag'] = 'different'
        with self.assertRaisesRegex(capture.CaptureError, 'changed'):
            capture.capture(self.remote, self.output, pause_id='synthetic-window', writers_paused=True)

    def test_resume_object_capture_reuses_every_complete_verified_download(self):
        destination = self.output
        destination.mkdir(mode=0o700)
        first = capture.capture_objects(self.remote, destination, self.remote.inventory())
        second = capture.capture_objects(self.remote, destination, self.remote.inventory())
        self.assertEqual(first['reusedObjects'], 0)
        self.assertEqual(second['reusedObjects'], 1)
        self.assertEqual(self.remote.downloads, 1)
        metadata = sqlite3.connect(destination / 'r2-metadata.sqlite')
        self.addCleanup(metadata.close)
        digest = metadata.execute('SELECT blob_id FROM _mf_objects').fetchone()[0]
        (destination / 'objects' / digest).write_bytes(b'corrupt')
        capture.capture_objects(self.remote, destination, self.remote.inventory())
        self.assertEqual(self.remote.downloads, 2)

    def test_refuses_unpaused_operation_and_broad_files_before_reads(self):
        with self.assertRaisesRegex(capture.CaptureError, 'paused'):
            capture.capture(self.remote, self.output)
        self.assertEqual(self.remote.calls, [])
        self.output.mkdir(mode=0o700)
        (self.output / 'unsafe').write_text('synthetic')
        (self.output / 'unsafe').chmod(0o644)
        with patch('capture.shadow_writes_supported', return_value=True):
            with self.assertRaisesRegex(capture.CaptureError, 'protected'):
                capture.capture(self.remote, self.output, pause_id='synthetic-window', writers_paused=True)
        self.assertEqual(self.remote.calls, [])

    def test_unsupported_local_sqlite_fails_before_account_reads(self):
        with patch('capture.shadow_writes_supported', return_value=False):
            with self.assertRaisesRegex(capture.CaptureError, 'SQLite build'):
                capture.capture(self.remote, self.output, pause_id='synthetic-window', writers_paused=True)
        self.assertEqual(self.remote.calls, [])

    def test_stream_verifies_sizes_etags_and_removes_partial_download(self):
        item = self.remote.objects['content/text']
        target = self.fixture.root / 'stream'
        for payload in (self.remote.data + b'extra', self.remote.data[:-1], b'x' * len(self.remote.data)):
            with self.assertRaises(capture.CaptureError):
                capture.stream_object(io.BytesIO(payload), target, item)
            self.assertFalse(target.exists())
            self.assertEqual(list(self.fixture.root.glob('stream.*.partial')), [])

    def test_api_guards_mutation_and_token_permissions(self):
        token = self.fixture.root / 'synthetic-token'
        token.write_text('synthetic-token-value')
        token.chmod(0o644)
        with self.assertRaisesRegex(capture.CaptureError, 'protected'):
            capture.Client('account', 'database', 'bucket', token)
        token.chmod(0o600)
        client = capture.Client('account', 'database', 'bucket', token)
        with self.assertRaisesRegex(capture.CaptureError, 'SELECT'):
            client.query('DELETE FROM anything')

    def inventory_client(self):
        token = self.fixture.root / 'inventory-token'
        token.write_text('synthetic-token-value')
        return capture.Client('account', 'database', 'bucket', token)

    def inventory_page(self, start, count, info):
        return {'result': [{'key': f'synthetic/{i:06}', 'etag': 'synthetic-etag', 'size': 1} for i in range(start, start + count)], 'result_info': info}

    def test_native_inventory_final_short_page_omits_result_info_fields(self):
        client = self.inventory_client()
        pages = [self.inventory_page(i * 1000, 1000, {'cursor': str(i), 'is_truncated': True, 'per_page': 1000}) for i in range(18)]
        pages.append(self.inventory_page(18_000, 284, {}))
        with patch.object(client, 'request', side_effect=pages) as request:
            self.assertEqual(len(client.inventory()), 18_284)
        self.assertEqual(request.call_count, 19)

    def test_native_inventory_exact_full_final_page_checks_tail_by_key(self):
        client = self.inventory_client()
        with patch.object(client, 'request', side_effect=[self.inventory_page(0, 1000, {}), self.inventory_page(1000, 0, {})]) as request:
            self.assertEqual(len(client.inventory()), 1000)
        self.assertIn('start_after=synthetic%2F000999', request.call_args.args[0])

    def test_native_inventory_full_page_without_cursor_can_continue_by_key(self):
        client = self.inventory_client()
        with patch.object(client, 'request', side_effect=[self.inventory_page(0, 1000, {}), self.inventory_page(1000, 1, {})]):
            self.assertEqual(len(client.inventory()), 1001)

    def test_native_inventory_truncated_page_still_requires_cursor(self):
        client = self.inventory_client()
        with patch.object(client, 'request', return_value=self.inventory_page(0, 1, {'is_truncated': True})):
            with self.assertRaisesRegex(capture.CaptureError, 'pagination is incomplete'):
                client.inventory()

    def adaptive_fixture(self):
        self.remote.db.executescript('CREATE TABLE adaptive(id INTEGER PRIMARY KEY,value TEXT);')
        self.remote.db.executemany('INSERT INTO adaptive VALUES(?,?)', [(i, 'synthetic-' + str(i)) for i in range(1, 10)])
        self.remote.db.commit()
        local = sqlite3.connect(':memory:')
        self.addCleanup(local.close)
        local.executescript('CREATE TABLE adaptive(id INTEGER PRIMARY KEY,value TEXT); CREATE TABLE ' + capture.PROGRESS + '(name TEXT PRIMARY KEY,cursor TEXT,count INTEGER,complete INTEGER);')
        return local

    def test_adaptive_pages_halve_only_size_failure_and_preserve_committed_cursor(self):
        local = self.adaptive_fixture()
        native_query = self.remote.query
        attempts = []
        failures_after_cursor = 0
        def bounded_query(sql, params=None):
            nonlocal failures_after_cursor
            if ' LIMIT ' in sql:
                limit = int(re.search(r' LIMIT (\d+)$', sql)[1])
                attempts.append((limit, list(params or [])))
                if limit > 4 or (params == ['4'] and limit > 1):
                    if params == ['4']:
                        failures_after_cursor += 1
                        self.assertEqual(local.execute('SELECT count FROM ' + capture.PROGRESS).fetchone()[0], 4)
                    raise capture.ResponseTooLarge('Synthetic bounded response exceeded')
            return native_query(sql, params)
        self.remote.query = bounded_query
        count = capture.capture_table(self.remote, local, 'adaptive', page_size=8)
        self.assertEqual(count, 9)
        self.assertEqual(attempts[:5], [(8, []), (4, []), (4, ['4']), (2, ['4']), (1, ['4'])])
        self.assertEqual(failures_after_cursor, 2)
        self.assertEqual(local.execute('SELECT * FROM adaptive ORDER BY id').fetchall(), [(i, 'synthetic-' + str(i)) for i in range(1, 10)])
        self.assertEqual(local.execute('SELECT count,complete FROM ' + capture.PROGRESS).fetchone(), (9, 1))

    def test_adaptive_page_failure_at_one_stops_without_row_or_cursor_commit(self):
        local = self.adaptive_fixture()
        with patch.object(self.remote, 'query', side_effect=capture.ResponseTooLarge('Synthetic oversized row')) as request:
            with self.assertRaises(capture.ResponseTooLarge):
                capture.capture_table(self.remote, local, 'adaptive', page_size=2)
            self.assertEqual(request.call_count, 2)
        self.assertEqual(local.execute('SELECT count(*) FROM adaptive').fetchone()[0], 0)
        self.assertEqual(local.execute('SELECT count(*) FROM ' + capture.PROGRESS).fetchone()[0], 0)

    def test_adaptive_pages_do_not_retry_generic_capture_or_network_errors(self):
        local = self.adaptive_fixture()
        for error in (capture.CaptureError('Synthetic auth failure'), TimeoutError('Synthetic network failure')):
            with patch.object(self.remote, 'query', side_effect=error) as request:
                with self.assertRaises(type(error)):
                    capture.capture_table(self.remote, local, 'adaptive', page_size=8)
                request.assert_called_once()
        self.assertEqual(local.execute('SELECT count(*) FROM ' + capture.PROGRESS).fetchone()[0], 0)

    def test_adaptive_page_bounds_are_enforced_before_query(self):
        local = self.adaptive_fixture()
        for size in (0, 2001, 1.5, True):
            with self.assertRaisesRegex(capture.CaptureError, 'between 1 and 2000'):
                capture.capture_table(self.remote, local, 'adaptive', page_size=size)
        self.assertEqual(self.remote.calls, [])
        with patch.object(self.remote, 'query', side_effect=[[], [{'n': 0}]]) as request:
            capture.capture_table(self.remote, local, 'adaptive', page_size=2000)
        self.assertIn(' LIMIT 2000', request.call_args_list[0].args[0])


if __name__ == '__main__':
    unittest.main()
