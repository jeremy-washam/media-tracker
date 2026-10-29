import contextlib
import datetime
import io
import hashlib
from email.message import Message
from types import SimpleNamespace
import urllib.error
from unittest.mock import patch
import json
from pathlib import Path
import sqlite3
import unittest

from snapshot import checksum
import test_snapshot
from transfer import R2_REQUEST_LIMIT, BUDGET, ImportStatusLost, NO_IMPORT, prepared_sql, Cloudflare, NoRedirect, RECEIPTS, R2Transfer, VOCAB_PREFIX, transfer_r2, transfer_d1, verify_bundle, verify_remote, write_json


class LocalRemote:
    def __init__(self, path):
        self.db = sqlite3.connect(path)
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA foreign_keys=ON')
        self.account = 'synthetic-account'
        self.database = 'synthetic-database'
        self.usage = {'rows_read': 0, 'rows_written': 0}
        self.fail_import = None
        self.lose_ack = None
        self.imports = 0

    def query(self, sql, params=None):
        result = [dict(row) for row in self.db.execute(sql, params or [])]
        self.db.commit()
        return result

    def import_file(self, path, progress):
        self.imports += 1
        sql = path.read_bytes().decode('utf8')
        if self.fail_import == self.imports:
            sql += '\nINSERT INTO missing_table VALUES(1);'
        try:
            self.db.executescript('BEGIN;\n' + sql + '\nCOMMIT;')
        except Exception:
            self.db.rollback()
            raise
        if self.lose_ack == self.imports:
            raise ConnectionError('Lost completion response')
        return {}


class NativeBridge(Cloudflare):
    """Synthetic native response envelopes with persistent production accounting."""
    def __init__(self, path, usage, bundle, allow_stopped=False):
        super().__init__('synthetic-account', 'synthetic-database', path.parent / 'never-read-oauth')
        self.db = sqlite3.connect(path)
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA foreign_keys=ON')
        self.imports = 0
        self.lose_import_ack = False
        self.lose_drop_ack = False
        self.crash_query = False
        try:self.configure_usage(usage, bundle)
        except RuntimeError:
            if not allow_stopped:raise

    def request(self, method, path, body=None):
        sql = body['sql']
        result = [dict(row) for row in self.db.execute(sql, body.get('params', []))]
        self.db.commit()
        if self.crash_query:
            self.crash_query = False
            raise SystemExit('Synthetic process crash after query response')
        if self.lose_drop_ack and sql.startswith('DROP TABLE'):
            self.lose_drop_ack = False
            raise urllib.error.URLError('Synthetic lost DROP response')
        return [{'success':True,'results':result,'meta':{'rows_read':len(result)+1,'rows_written':int(sql.startswith(('CREATE','DROP','INSERT')))}}]

    def import_file(self, path, progress):
        self.imports += 1
        payload = path.read_bytes()
        self.db.executescript('BEGIN;\n' + payload.decode() + '\nCOMMIT;')
        if self.lose_import_ack:
            self.lose_import_ack = False
            raise ConnectionError('Lost immediate completion before bookmark or accounting')
        self.account_usage({'rows_read':1,'rows_written':10}, hashlib.md5(payload).hexdigest())
        return {}


class TransferTests(unittest.TestCase):
    setUp = test_snapshot.SnapshotTests.setUp
    tearDown = test_snapshot.SnapshotTests.tearDown
    bundle = test_snapshot.SnapshotTests.bundle

    def prepare(self):
        self.bundle()
        manifest, digest, files = verify_bundle(self.output)
        remote = LocalRemote(self.root / 'remote.sqlite')
        state = self.root / 'state.json'
        self.addCleanup(remote.db.close)
        return manifest, digest, files, remote, state

    def run_transfer(self, manifest, digest, files, remote, state):
        with contextlib.redirect_stdout(io.StringIO()):
            return transfer_d1(self.output, manifest, digest, files, remote, state)

    def test_lost_completion_response_resumes_from_remote_receipt(self):
        manifest, digest, files, remote, state = self.prepare()
        remote.lose_ack = 2
        with self.assertRaises(ConnectionError):
            self.run_transfer(manifest, digest, files, remote, state)
        self.assertNotIn(files[1]['path'], json.loads(state.read_text())['completed'])
        count = remote.query('SELECT count(*) AS n FROM records')[0]['n']
        remote.lose_ack = None
        self.run_transfer(manifest, digest, files, remote, state)
        self.assertEqual(remote.imports, len(files))
        self.assertEqual(remote.query('SELECT count(*) AS n FROM records')[0]['n'], count)

    def test_failed_file_rolls_back_receipt_and_records(self):
        manifest, digest, files, remote, state = self.prepare()
        remote.fail_import = 2
        with self.assertRaises(sqlite3.OperationalError):
            self.run_transfer(manifest, digest, files, remote, state)
        self.assertEqual(remote.query('SELECT count(*) AS n FROM records')[0]['n'], 0)
        self.assertEqual(len(remote.query('SELECT * FROM ' + RECEIPTS)), 1)
        remote.fail_import = None
        self.run_transfer(manifest, digest, files, remote, state)
        self.assertEqual(remote.query('SELECT count(*) AS n FROM records')[0]['n'], 2)

    def test_schema_failure_is_atomic_and_retryable(self):
        manifest, digest, files, remote, state = self.prepare()
        remote.fail_import = 1
        with self.assertRaises(sqlite3.OperationalError):
            self.run_transfer(manifest, digest, files, remote, state)
        self.assertEqual(remote.query("SELECT name FROM sqlite_schema WHERE type='table'"), [])
        remote.fail_import = None
        self.run_transfer(manifest, digest, files, remote, state)

    def test_refuses_checkpoint_and_remote_bundle_mismatch(self):
        manifest, digest, files, remote, state = self.prepare()
        write_json(state, {'target': {'database': 'different'}, 'completed': {}})
        with self.assertRaisesRegex(ValueError, 'checkpoint target'):
            self.run_transfer(manifest, digest, files, remote, state)
        state.unlink()
        self.run_transfer(manifest, digest, files, remote, state)
        with self.assertRaisesRegex(ValueError, 'different bundle'):
            self.run_transfer(manifest, 'different', files, remote, self.root / 'new-state.json')

    def test_refuses_nonempty_target_without_receipts(self):
        manifest, digest, files, remote, state = self.prepare()
        remote.query('CREATE TABLE unrelated(id INTEGER)')
        with self.assertRaisesRegex(ValueError, 'nonempty'):
            self.run_transfer(manifest, digest, files, remote, state)

    def test_refuses_corrupt_receipt_and_out_of_order_receipts(self):
        manifest, digest, files, remote, state = self.prepare()
        self.run_transfer(manifest, digest, files, remote, state)
        remote.query('UPDATE ' + RECEIPTS + ' SET sha256=? WHERE path=?', ['wrong', files[1]['path']])
        with self.assertRaisesRegex(ValueError, 'changed remote'):
            self.run_transfer(manifest, digest, files, remote, state)
        remote.query('UPDATE ' + RECEIPTS + ' SET sha256=? WHERE path=?', [files[1]['sha256'], files[1]['path']])
        remote.query('DELETE FROM ' + RECEIPTS + ' WHERE path=?', [files[1]['path']])
        with self.assertRaisesRegex(ValueError, 'ordered prefix'):
            self.run_transfer(manifest, digest, files, remote, state)

    def test_refuses_corrupt_backups_and_paths_before_upload(self):
        self.bundle()
        p = self.output / 'database.sqlite'
        with p.open('ab') as stream:
            stream.write(b'changed')
        with self.assertRaisesRegex(ValueError, 'checksum'):
            verify_bundle(self.output)

    def test_remote_verification_compares_typed_data_views_and_tokens(self):
        db = sqlite3.connect(self.database)
        db.executescript("CREATE TABLE numeric_refs(a INTEGER,b INTEGER,role TEXT,PRIMARY KEY(a,b,role)) WITHOUT ROWID;CREATE VIEW public_refs AS SELECT a,b,role FROM numeric_refs;")
        db.executemany('INSERT INTO records VALUES(?,?,?)', [(str(n), 'value-' + str(n), None) for n in range(1200)])
        db.executemany('INSERT INTO numeric_refs VALUES(?,?,?)', [(n,n+100,'role') for n in range(1200)])
        db.execute('INSERT INTO records VALUES(?,?,?)', ('large-integer',None,9007199254740993))
        db.execute('INSERT INTO records VALUES(?,?,?)', ('real-value',None,1.0))
        db.commit();db.close()
        manifest, digest, files, remote, state = self.prepare()
        self.run_transfer(manifest, digest, files, remote, state)
        with contextlib.redirect_stdout(io.StringIO()):
            report = verify_remote(self.output, manifest, remote, self.root / 'verified.sqlite')
        self.assertEqual(report['tablesVerified'], len(manifest['tables']))
        self.assertEqual(report['viewsVerified'], 1)
        self.assertTrue(report['completeRestoreBackup'])
        restored = sqlite3.connect(self.root / 'verified.sqlite')
        self.assertEqual(restored.execute("SELECT rowid FROM article_content_search WHERE article_content_search MATCH '\"second paragraph\"'").fetchall(), [(7,)])
        restored.close()
        trigger = remote.query("SELECT sql FROM sqlite_schema WHERE name='immutable_records'")[0]['sql']
        remote.query('DROP TRIGGER immutable_records')
        remote.query("UPDATE records SET content='changed' WHERE id='synthetic'")
        remote.query(trigger)
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaisesRegex(ValueError, 'fingerprint'):
            verify_remote(self.output, manifest, remote, self.root / 'bad.sqlite')

    def test_verification_requires_the_final_receipt_and_installed_schema(self):
        manifest, digest, files, remote, state = self.prepare()
        remote.fail_import = len(files)
        with self.assertRaises(sqlite3.OperationalError):
            self.run_transfer(manifest, digest, files, remote, state)
        output = self.root / 'verified.sqlite'
        with self.assertRaisesRegex(ValueError, 'Complete matching remote transfer receipts'):
            verify_remote(self.output, manifest, remote, output)
        self.assertFalse(output.exists())
        remote.fail_import = None
        self.run_transfer(manifest, digest, files, remote, state)
        remote.query('DROP TRIGGER immutable_records')
        with self.assertRaisesRegex(ValueError, 'schema, indexes, views or triggers'):
            verify_remote(self.output, manifest, remote, output)
        self.assertFalse(output.exists())
        self.assertFalse(output.with_suffix('.sqlite.partial').exists())

    def test_verification_rejects_altered_remote_view_and_index(self):
        db = sqlite3.connect(self.database)
        db.executescript('CREATE VIEW public_records AS SELECT id,content FROM records; CREATE INDEX record_content_index ON records(content);')
        db.close()
        manifest, digest, files, remote, state = self.prepare()
        self.run_transfer(manifest, digest, files, remote, state)
        remote.query('DROP VIEW public_records')
        remote.query('CREATE VIEW public_records AS SELECT id,NULL AS content FROM records')
        with self.assertRaisesRegex(ValueError, 'schema, indexes, views or triggers'):
            verify_remote(self.output, manifest, remote, self.root / 'view.sqlite')
        remote.query('DROP VIEW public_records')
        remote.query('CREATE VIEW public_records AS SELECT id,content FROM records')
        remote.query('DROP INDEX record_content_index')
        with self.assertRaisesRegex(ValueError, 'schema, indexes, views or triggers'):
            verify_remote(self.output, manifest, remote, self.root / 'index.sqlite')

    def test_pending_bookmark_polls_before_queries_and_preserves_file_identity(self):
        manifest, digest, files, remote, state = self.prepare()
        original_import, original_query = remote.import_file, remote.query
        active = {'sql': None, 'polls': 0}
        def import_file(path, progress):
            if remote.imports == 1:
                remote.imports += 1
                active['sql'] = path.read_bytes().decode()
                progress('synthetic-running-bookmark')
                raise ConnectionError('Interrupted initial poll')
            return original_import(path, progress)
        def query(sql, params=None):
            if active['sql'] is not None:
                raise AssertionError('Queried D1 before polling its active import')
            return original_query(sql, params)
        def resume(bookmark, progress, import_id):
            self.assertEqual(bookmark, 'synthetic-running-bookmark')
            self.assertEqual(hashlib.md5(active['sql'].encode()).hexdigest(), import_id)
            active['polls'] += 1
            remote.db.executescript('BEGIN;\n' + active['sql'] + '\nCOMMIT;')
            active['sql'] = None
            return {}
        remote.import_file, remote.query, remote.resume_import = import_file, query, resume
        with self.assertRaises(ConnectionError):
            self.run_transfer(manifest, digest, files, remote, state)
        pending = json.loads(state.read_text())['pending']
        self.assertEqual(pending['path'], files[1]['path'])
        self.run_transfer(manifest, digest, files, remote, state)
        self.assertEqual(active['polls'], 1)
        self.assertEqual(remote.imports, len(files))
        self.assertNotIn('pending', json.loads(state.read_text()))
        self.assertEqual(remote.query('SELECT count(*) AS n FROM records')[0]['n'], 2)

    def test_invalid_pending_identity_is_rejected_before_polling(self):
        manifest, digest, files, remote, state = self.prepare()
        write_json(state, {'target': {'account': remote.account, 'database': remote.database, 'bundle': digest},
            'completed': {}, 'pending': {'path': files[0]['path'], 'sha256': files[0]['sha256'], 'bookmark': 'synthetic', 'importId': '0' * 32}})
        remote.resume_import = lambda *args: self.fail('Polled an invalid checkpoint')
        with self.assertRaisesRegex(ValueError, 'Pending import payload'):
            self.run_transfer(manifest, digest, files, remote, state)

    def test_verification_round_trips_sensitive_reals_and_pages_repeated_fts_terms(self):
        db = sqlite3.connect(self.database)
        values = [1.2345678901234567, 0.1, -5e-324, 1.7976931348623157e308]
        db.executemany('INSERT INTO records VALUES(?,?,?)', [('float-' + str(n),None,x) for n,x in enumerate(values)])
        db.executemany('INSERT INTO metadata_search(rowid,id,content) VALUES(?,?,?)', [(n,'doc-' + str(n),'same') for n in range(100,2201)])
        db.execute("INSERT INTO metadata_search(rowid,id,content) VALUES(5000,'offsets',?)", ('same ' * 2101,))
        db.commit();db.close()
        manifest, digest, files, remote, state = self.prepare()
        self.run_transfer(manifest, digest, files, remote, state)
        queries = []
        seeks = []
        original = remote.query
        def tracked(sql, params=None):
            queries.append(sql)
            if ' AS v WHERE (v.term,v.doc,v.col,v.offset)' in sql:
                self.assertIs(type(params[1]), int)
                self.assertIs(type(params[3]), int)
                seeks.extend(r['detail'] for r in original('EXPLAIN QUERY PLAN ' + sql, params))
            return original(sql, params)
        remote.query = tracked
        with contextlib.redirect_stdout(io.StringIO()):
            verify_remote(self.output, manifest, remote, self.root / 'verified.sqlite')
        self.assertTrue(any('PRIMARY KEY(term,doc,col,offset)' in sql and 'WITHOUT ROWID' in sql for sql in queries))
        self.assertTrue(seeks)
        self.assertTrue(all('PRIMARY KEY ((term,doc,col,offset)>' in detail for detail in seeks))
        self.assertFalse(remote.query("SELECT name FROM sqlite_schema WHERE name GLOB ?", [VOCAB_PREFIX + '*']))

    def test_failed_verification_cleans_partial_output_and_retries(self):
        manifest, digest, files, remote, state = self.prepare()
        self.run_transfer(manifest, digest, files, remote, state)
        original = remote.query
        failed = {'once': False}
        def interrupted(sql, params=None):
            if 'AS __source' in sql and not failed['once']:
                failed['once'] = True
                raise ConnectionError('Synthetic read interruption')
            return original(sql, params)
        remote.query = interrupted
        output = self.root / 'verified.sqlite'
        with self.assertRaises(ConnectionError):
            verify_remote(self.output, manifest, remote, output)
        self.assertFalse(output.exists())
        self.assertFalse(output.with_suffix('.sqlite.partial').exists())
        with contextlib.redirect_stdout(io.StringIO()):
            verify_remote(self.output, manifest, remote, output)
        self.assertTrue(output.exists())

    def test_fts_failure_cleans_only_its_owned_scratch_tables(self):
        manifest, digest, files, remote, state = self.prepare()
        self.run_transfer(manifest, digest, files, remote, state)
        original = remote.query
        failed = {'once': False}
        def interrupted(sql, params=None):
            if ' AS v ORDER BY' in sql and not failed['once']:
                failed['once'] = True
                raise ConnectionError('Synthetic vocabulary read interruption')
            return original(sql, params)
        remote.query = interrupted
        output = self.root / 'verified.sqlite'
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(ConnectionError):
            verify_remote(self.output, manifest, remote, output)
        self.assertFalse(remote.query('SELECT name FROM sqlite_schema WHERE name GLOB ?', [VOCAB_PREFIX + '*']))
        self.assertFalse(output.exists())
        self.assertFalse(output.with_suffix('.sqlite.partial').exists())

    def test_reserved_bookkeeping_names_are_rejected_before_transfer(self):
        db = sqlite3.connect(self.database)
        db.execute('CREATE TABLE imladris_transfer_vocab_retained(id TEXT)')
        db.close()
        self.bundle()
        with self.assertRaisesRegex(ValueError, 'bookkeeping collides'):
            verify_bundle(self.output)

    def test_native_usage_is_persistent_deduplicated_and_target_bound(self):
        path = self.root / 'usage.json'
        remote = Cloudflare('account','database',self.root / 'never-read-oauth')
        remote.configure_usage(path, 'bundle')
        remote.account_usage({'rows_read': 10, 'rows_written': 20})
        remote.account_usage({'rows_read': 5, 'rows_written': 7}, 'same-import')
        remote.account_usage({'rows_read': 5, 'rows_written': 7}, 'same-import')
        resumed = Cloudflare('account','database',self.root / 'never-read-oauth')
        resumed.configure_usage(path, 'bundle')
        self.assertEqual(resumed.usage, {'rows_read': 15, 'rows_written': 27})
        self.assertFalse(remote.usage_fresh)
        self.assertIn('same-import', remote.usage_state['imports'])
        with self.assertRaisesRegex(ValueError, 'usage checkpoint target'):
            resumed.configure_usage(path, 'different-bundle')

    def test_native_usage_budget_and_missing_measurement_stop_future_work(self):
        remote = Cloudflare('account','database',self.root / 'never-read-oauth')
        path = self.root / 'usage.json'
        remote.configure_usage(path, 'bundle')
        remote.usage['rows_read'] = BUDGET['rows_read'] - 1
        with self.assertRaisesRegex(RuntimeError, 'budget exhausted'):
            remote.account_usage({'rows_read': 2, 'rows_written': 0})
        resumed = Cloudflare('account','database',self.root / 'never-read-oauth')
        with self.assertRaisesRegex(RuntimeError, 'budget exhausted'):
            resumed.configure_usage(path, 'bundle')
        other = self.root / 'other-usage.json'
        resumed.configure_usage(other, 'bundle')
        with self.assertRaisesRegex(RuntimeError, 'metadata is missing'):
            resumed.account_usage({})
        with self.assertRaisesRegex(RuntimeError, 'usage is uncertain'):
            resumed.configure_usage(other, 'bundle')

    def test_usage_history_cannot_be_reset_around_existing_transfer_state(self):
        write_json(self.root / 'd1-state.json', {'synthetic': True})
        remote = Cloudflare('account','database',self.root / 'never-read-oauth')
        with self.assertRaisesRegex(ValueError, 'no native usage history'):
            remote.configure_usage(self.root / 'usage.json', 'bundle')

    def test_cloudflare_resume_polls_and_accounts_completion_once(self):
        remote = Cloudflare('account','database',self.root / 'never-read-oauth')
        remote.configure_usage(self.root / 'usage.json', 'bundle')
        calls = []
        def request(method, path, body):
            calls.append(body)
            return {'status': 'complete', 'result': {'meta': {'rows_read': 10, 'rows_written': 20}}}
        remote.request = request
        remote.resume_import('saved-bookmark', lambda b: None, 'import-id')
        remote.resume_import('saved-bookmark', lambda b: None, 'import-id')
        self.assertEqual(calls, [{'action': 'poll', 'current_bookmark': 'saved-bookmark'}] * 2)
        self.assertEqual(remote.usage, {'rows_read': 10, 'rows_written': 20})

    def test_r2_url_is_pinned_and_helper_bindings_are_checked(self):
        expected = 'https://media-tracker-transfer.synthetic-account.workers.dev'
        settings = {'url': expected, 'clientId': 'synthetic', 'clientSecret': 'synthetic', 'bearer': 'synthetic', 'serviceTokenId': 'synthetic-token'}
        remote = Cloudflare('account','database',self.root / 'never-read-oauth')
        responses = {
            'workers/subdomain': {'subdomain': 'synthetic-account'},
            'workers/scripts/media-tracker-transfer/settings': {'limits': {'cpu_ms':100}, 'bindings': [{'name': 'RAW_BUCKET', 'type': 'r2_bucket', 'bucket_name': 'synthetic-bucket'}, {'name': 'TRANSFER_SECRET', 'type': 'secret_text'}]},
            'workers/scripts/media-tracker-transfer/subdomain': {'enabled': True, 'previews_enabled': False},
            'access/apps/helper-app': {'id': 'helper-app', 'domain': 'media-tracker-transfer.synthetic-account.workers.dev', 'policies': [{'decision': 'non_identity', 'include': [{'service_token': {'token_id': 'synthetic-token'}}]}]},
        }
        remote.request = lambda method,path: responses[path]
        self.assertEqual(remote.guard_r2({'bucket': 'synthetic-bucket', 'transferAccessApplicationId': 'helper-app'}, settings), expected)
        for bad in ['http://' + expected[8:], expected + '/', expected + '?x=1', expected + '#x', expected + ':443', 'https://user@' + expected[8:], 'https://unrelated.example']:
            with self.subTest(url=bad), self.assertRaises(ValueError):
                R2Transfer({**settings, 'url': bad}, expected)
        helper = responses['workers/scripts/media-tracker-transfer/settings']
        for cpu in [None,0,True,101,10000]:
            helper['limits'] = {'cpu_ms':cpu}
            with self.subTest(cpu=cpu),self.assertRaisesRegex(ValueError,'CPU ceiling'):
                remote.guard_r2({'bucket':'synthetic-bucket','transferAccessApplicationId':'helper-app'},settings)
        helper['limits'] = {'cpu_ms':100}
        responses['workers/scripts/media-tracker-transfer/subdomain']['previews_enabled'] = True
        with self.assertRaisesRegex(ValueError, 'preview configuration'):
            remote.guard_r2({'bucket': 'synthetic-bucket', 'transferAccessApplicationId': 'helper-app'}, settings)
        responses['workers/scripts/media-tracker-transfer/subdomain']['previews_enabled'] = False
        responses['workers/scripts/media-tracker-transfer/settings']['bindings'][0]['bucket_name'] = 'wrong-bucket'
        with self.assertRaisesRegex(ValueError, 'bindings differ'):
            remote.guard_r2({'bucket': 'synthetic-bucket', 'transferAccessApplicationId': 'helper-app'}, settings)

    def test_management_requests_are_paced_and_429_retry_is_bounded(self):
        remote = Cloudflare('account','database',self.root / 'never-read-oauth')
        remote.token = lambda: 'synthetic'
        remote.oauth_expired = lambda: False
        clock = {'now': 0.0}
        calls = []
        class Client:
            def open(self, request, timeout):
                calls.append(clock['now'])
                return io.BytesIO(b'{"success":true,"result":{}}')
        remote.client = Client()
        with patch('transfer.time.monotonic', side_effect=lambda: clock['now']), patch('transfer.time.sleep', side_effect=lambda n: clock.update(now=clock['now'] + n)):
            for _ in range(4):remote.request('GET', 'synthetic')
        self.assertGreaterEqual(calls[3] - calls[0], 1)
        headers = Message();headers['Retry-After'] = '2'
        class Limited:
            def open(self, request, timeout):
                calls.append(clock['now'])
                raise urllib.error.HTTPError(request.full_url,429,'rate limit',headers,io.BytesIO(b'PRIVATE RESPONSE BODY'))
        remote.client = Limited();calls.clear()
        with patch('transfer.time.monotonic', side_effect=lambda: clock['now']), patch('transfer.time.sleep', side_effect=lambda n: clock.update(now=clock['now'] + n)), self.assertRaisesRegex(RuntimeError, 'HTTP 429') as error:
            remote.request('GET', 'synthetic')
        self.assertEqual(len(calls), 4)
        self.assertTrue(all(b-a >= 2 for a,b in zip(calls,calls[1:])))
        self.assertNotIn('PRIVATE', str(error.exception))

    def test_oauth_refresh_is_once_only_and_permission_denial_never_refreshes(self):
        remote = Cloudflare('account','database',self.root / 'never-read-oauth')
        remote.token = lambda: 'synthetic'
        expiry_checks = iter([False,True,False])
        remote.oauth_expired = lambda: next(expiry_checks)
        calls = []
        class Client:
            def open(self, request, timeout):
                calls.append(request)
                if len(calls) == 1:
                    raise urllib.error.HTTPError(request.full_url,401,'expired',Message(),io.BytesIO(b'PRIVATE RESPONSE BODY'))
                return io.BytesIO(b'{"success":true,"result":{}}')
        remote.client = Client()
        with patch('transfer.time.sleep'), patch('transfer.subprocess.run', return_value=SimpleNamespace(returncode=0)) as refresh:
            remote.request('GET', 'synthetic')
        refresh.assert_called_once()
        self.assertEqual(refresh.call_args.args[0], ['pnpm','--filter','@media-tracker/api','exec','wrangler','whoami'])
        class Denied:
            def open(self, request, timeout):
                raise urllib.error.HTTPError(request.full_url,403,'denied',Message(),io.BytesIO(b'PRIVATE RESPONSE BODY'))
        remote.client = Denied()
        remote.oauth_expired = lambda: False
        with patch('transfer.time.sleep'), patch('transfer.subprocess.run') as refresh, self.assertRaisesRegex(RuntimeError,'HTTP 403'):
            remote.request('GET', 'synthetic')
        refresh.assert_not_called()

    def test_near_expiry_authorization_rejection_refreshes_once_after_bounded_pause(self):
        remote = Cloudflare('account','database',self.root/'never-read-oauth')
        remote.token = lambda:'synthetic';remote.oauth_expired = lambda:False
        remote.oauth_seconds_remaining = lambda:65
        class Client:
            calls = 0
            def open(self,request,timeout):
                self.calls += 1
                if self.calls == 1:
                    raise urllib.error.HTTPError(request.full_url,403,'expired early',Message(),io.BytesIO(b'PRIVATE RESPONSE'))
                return io.BytesIO(b'{"success":true,"result":{}}')
        remote.client = Client()
        with patch('transfer.time.sleep') as sleep,patch('transfer.subprocess.run',return_value=SimpleNamespace(returncode=0)) as refresh:
            remote.request('GET','synthetic')
        refresh.assert_called_once()
        self.assertTrue(all(call.args[0] <= 30 for call in sleep.call_args_list))
        self.assertGreaterEqual(sum(call.args[0] for call in sleep.call_args_list),66)
        self.assertEqual(remote.client.calls,2)
        remote.client.calls = 0;remote.oauth_seconds_remaining = lambda:181
        with patch('transfer.time.sleep'),patch('transfer.subprocess.run') as refresh,self.assertRaisesRegex(RuntimeError,'HTTP 403'):
            remote.request('GET','synthetic')
        refresh.assert_not_called()

    def test_management_and_r2_clients_disable_redirects(self):
        remote = Cloudflare('account','database',self.root / 'never-read-oauth')
        r2 = R2Transfer({'url':'https://media-tracker-transfer.synthetic.workers.dev'}, 'https://media-tracker-transfer.synthetic.workers.dev')
        for client in (remote.client,r2.client):
            self.assertTrue(any(isinstance(handler, NoRedirect) for handler in client.handlers))

    def test_typed_copy_preserves_tiny_and_large_reals_without_sql_literal_conversion(self):
        from transfer import copy_remote_table
        remote = LocalRemote(self.root / 'precision-remote.sqlite')
        local = sqlite3.connect(':memory:')
        self.addCleanup(remote.db.close);self.addCleanup(local.close)
        schema = 'CREATE TABLE exact_values(id TEXT PRIMARY KEY,value BLOB)'
        remote.query(schema);local.execute(schema)
        values = [1e-300, 1.2345678901234567, 0.1, -5e-324, 1.7976931348623157e308]
        remote.db.executemany('INSERT INTO exact_values VALUES(?,?)', [(str(n),x) for n,x in enumerate(values)])
        remote.db.commit()
        self.assertEqual(copy_remote_table(remote, local, 'exact_values'), len(values))
        self.assertEqual([r[0].hex() for r in local.execute('SELECT value FROM exact_values ORDER BY id')], [x.hex() for x in values])

    def test_contentless_restore_preserves_tokenless_documents_and_phrase_search(self):
        db = sqlite3.connect(self.database)
        db.execute('INSERT INTO article_content_chunks VALUES(?,?,?,?,?)', ('manifest',1,0,0,hashlib.sha256(b'').hexdigest()))
        db.execute('INSERT INTO article_content_search_map VALUES(?,?,?)', (8,'manifest',1))
        db.execute("INSERT INTO article_content_search(rowid,content) VALUES(8,'')")
        db.commit();db.close()
        manifest, digest, files, remote, state = self.prepare()
        self.run_transfer(manifest, digest, files, remote, state)
        output = self.root / 'verified.sqlite'
        with contextlib.redirect_stdout(io.StringIO()):report = verify_remote(self.output, manifest, remote, output)
        self.assertTrue(report['contentlessTokenStateRestored'])
        restored = sqlite3.connect(output)
        try:
            self.assertEqual(restored.execute('SELECT rowid FROM article_content_search ORDER BY rowid').fetchall(), [(7,),(8,)])
            self.assertEqual(restored.execute("SELECT rowid FROM article_content_search WHERE article_content_search MATCH '\"second paragraph\"'").fetchall(), [(7,)])
        finally:restored.close()

    def test_contentless_restore_rejects_unsupported_columns_and_position_gaps(self):
        from transfer import restore_contentless_search
        for column,offset in [('manifest_id',0),('content',1)]:
            with self.subTest(column=column,offset=offset):
                db = sqlite3.connect(':memory:')
                db.execute("CREATE VIRTUAL TABLE article_content_search USING fts5(manifest_id UNINDEXED,content,content='')")
                db.execute("INSERT INTO article_content_search(rowid,content) VALUES(7,'')")
                definition = db.execute("SELECT sql FROM sqlite_schema WHERE name='article_content_search'").fetchone()[0]
                db.execute('CREATE TABLE temp.remote_vocab(term TEXT,doc INTEGER,col TEXT,offset INTEGER)')
                db.execute('INSERT INTO temp.remote_vocab VALUES(?,?,?,?)', ('word',7,column,offset))
                try:
                    with self.assertRaisesRegex(ValueError,'Unsupported contentless index token positions'):
                        restore_contentless_search(db,'article_content_search',{},definition)
                finally:db.close()

    def test_short_lived_access_attestation_validates_owner_mfa_and_helper_identity(self):
        from transfer import validate_access_attestation
        resources = {'accountId':'account','databaseId':'database','ownerAccessVerified':True,'ownerEmail':'owner@example.invalid',
            'bucket':'synthetic-bucket','hostname':'media-tracker.synthetic.workers.dev','accessApplicationId':'owner-app',
            'transferAccessApplicationId':'helper-app','syncQueueId':'sync','deadLetterQueueId':'dead'}
        mfa = {'mfa_disabled':False,'allowed_authenticators':['totp','biometrics','security_key']}
        now = datetime.datetime.now(datetime.timezone.utc)
        attestation = {'version':1,'issuedAt':(now-datetime.timedelta(seconds=1)).isoformat(), 'expiresAt':(now+datetime.timedelta(minutes=10)).isoformat(),
            'accountId':'account','applicationId':'owner-app','audience':'synthetic-audience','ownerEmail':resources['ownerEmail'],'hostname':resources['hostname'],
            'application':{'id':'owner-app','aud':'synthetic-audience','domain':resources['hostname'],'mfa_config':dict(mfa),
                'policies':[{'decision':'allow','include':[{'email':{'email':resources['ownerEmail']}}],'require':[],'mfa_config':dict(mfa)}]},
            'helperApplication':{'id':'helper-app','domain':'media-tracker-transfer.synthetic.workers.dev','policies':[{'decision':'non_identity','include':[{'service_token':{'token_id':'service-token'}}]}]}}
        remote = Cloudflare('account','database',self.root / 'never-read-oauth')
        responses = {
            'workers/scripts/media-tracker/settings':{'bindings':[{'type':'plain_text','name':k,'text':v} for k,v in {
                'AUTH_MODE':'access','SYNC_ENABLED':'false','MAINTENANCE_ENABLED':'false','CATALOG_AUTO_REFRESH':'false','OWNER_EMAIL':resources['ownerEmail'],'ACCESS_AUD':'synthetic-audience'}.items()] + [{'type':'d1','name':'DB','id':'database'},{'type':'r2_bucket','name':'RAW_BUCKET','bucket_name':'synthetic-bucket'}]},
            'workers/scripts/media-tracker/schedules':{'schedules':[]},'queues/sync/consumers':[],'queues/dead/consumers':[],
            'r2/buckets/synthetic-bucket/domains/managed':{'enabled':False},'r2/buckets/synthetic-bucket/domains/custom':{'domains':[]},
            'workers/subdomain':{'subdomain':'synthetic'},
            'workers/scripts/media-tracker-transfer/settings':{'limits':{'cpu_ms':100},'bindings':[{'name':'RAW_BUCKET','type':'r2_bucket','bucket_name':'synthetic-bucket'},{'name':'TRANSFER_SECRET','type':'secret_text'}]},
            'workers/scripts/media-tracker-transfer/subdomain':{'enabled':True,'previews_enabled':False},
        }
        remote.request = lambda method,path: responses[path]
        remote.guard(resources,attestation)
        settings = {'url':'https://media-tracker-transfer.synthetic.workers.dev','serviceTokenId':'service-token'}
        self.assertEqual(remote.guard_r2(resources,settings,attestation), settings['url'])
        for field in ['accountId','applicationId','audience','ownerEmail','hostname']:
            with self.subTest(field=field), self.assertRaisesRegex(ValueError,'identity mismatch'):
                validate_access_attestation({**attestation,field:'wrong'},resources,'synthetic-audience')
        with self.assertRaisesRegex(ValueError,'expired'):
            validate_access_attestation({**attestation,'expiresAt':(now-datetime.timedelta(seconds=1)).isoformat()},resources,'synthetic-audience')
        with self.assertRaisesRegex(ValueError,'validity window'):
            validate_access_attestation({**attestation,'expiresAt':(now+datetime.timedelta(hours=1)).isoformat()},resources,'synthetic-audience')
        attestation['application']['policies'][0]['mfa_config']['mfa_disabled'] = True
        with self.assertRaisesRegex(ValueError,'Access policy'):
            remote.guard(resources,attestation)
        with self.assertRaisesRegex(ValueError,'specified service token'):
            remote.guard_r2(resources,{**settings,'serviceTokenId':'wrong'},attestation)

    def test_r2_request_sets_descriptive_user_agent_without_redirects(self):
        r2 = R2Transfer({'url':'https://media-tracker-transfer.synthetic.workers.dev','clientId':'synthetic','clientSecret':'synthetic','bearer':'synthetic'}, 'https://media-tracker-transfer.synthetic.workers.dev')
        r2.reserve_request = lambda:None
        requests = []
        class Client:
            def open(self,request,timeout):
                requests.append(request)
                return io.BytesIO(b'{"size":0}')
        r2.client = Client()
        r2.request('/head','synthetic-key')
        self.assertEqual(requests[0].get_header('User-agent'),'Mozilla/5.0 ImladrisPrivateTransfer/1.0')

    def native_prepare(self):
        self.bundle()
        manifest,digest,files = verify_bundle(self.output)
        remote = NativeBridge(self.root / 'native.sqlite', self.root / 'native-usage.json', digest)
        self.addCleanup(remote.db.close)
        return manifest,digest,files,remote,self.root / 'd1-state.json'

    def lost_status_prepare(self):
        manifest,digest,files,remote,state = self.native_prepare()
        payload = prepared_sql(self.output,digest,files[0],True)
        remote.db.executescript('BEGIN;\n' + payload.decode() + '\nCOMMIT;')
        remote.imports = 1
        pending = {'path':files[0]['path'],'sha256':files[0]['sha256'],
            'importId':hashlib.md5(payload).hexdigest(),'bookmark':'synthetic-bookmark'}
        write_json(state,{'target':remote.usage_state['target'],'completed':{},'pending':pending})
        def lost(*args,**kwargs):
            return remote.poll_import({'success':False,'error':NO_IMPORT},lambda bookmark:None,pending['importId'])
        with self.assertRaises(ImportStatusLost):lost()
        remote.resume_import = lost
        remote.native_counters = lambda:{'target':remote.usage_state['target'],'unsampled':True,
            'totals':{'rows_read':1000,'rows_written':1000,'readQueries':12,'writeQueries':1}}
        return manifest,digest,files,remote,state,pending

    def reconcile(self, digest, files, remote, pending, extra_reads=0):
        return remote.reconcile_import_status(pending,self.output,digest,files,extra_reads)

    def test_exact_lost_status_reconciles_and_resumes_without_duplicate_writes(self):
        manifest,digest,files,remote,state,pending = self.lost_status_prepare()
        failure = dict(remote.usage_state['importFailure'])
        diagnostic = remote.usage_path.parent / failure['path']
        self.assertEqual(json.loads(diagnostic.read_text())['response'],{'success':False,'error':NO_IMPORT})
        self.assertEqual(diagnostic.stat().st_mode & 0o777,0o600)
        with contextlib.redirect_stdout(io.StringIO()):
            transfer_d1(self.output,manifest,digest,files,remote,state,True,9)
        self.assertEqual(remote.imports,len(files))
        self.assertEqual(len(remote.usage_state['imports']),len(files))
        self.assertFalse(remote.usage_state['unmeasured'])
        proof = remote.usage_state['importReconciliations'][0]
        self.assertEqual(proof['importId'],pending['importId'])
        self.assertEqual(proof['diagnostic']['importId'],failure['importId'])
        self.assertTrue((remote.usage_path.parent/proof['diagnostic']['path']).exists())
        self.assertEqual(proof['diagnosticCharges']['rows_read'],11)
        self.assertEqual(proof['adoptedUsage'],{'rows_read':1011,'rows_written':1000})
        remote.resume_import = lambda *args,**kwargs:self.fail('Accounted import must never be polled again')
        checkpoint = json.loads(state.read_text());checkpoint['pending'] = pending;write_json(state,checkpoint)
        self.run_transfer(manifest,digest,files,remote,state)
        self.assertEqual(remote.imports,len(files))
        self.assertTrue(diagnostic.exists())

    def test_reconciliation_rejects_absent_or_changed_receipt(self):
        manifest,digest,files,remote,state,pending = self.lost_status_prepare()
        remote.db.execute('DELETE FROM ' + RECEIPTS);remote.db.commit()
        with self.assertRaisesRegex(ValueError,'Exact pending receipt'):
            self.reconcile(digest,files,remote,pending)
        self.assertTrue(remote.usage_state['unmeasured'])
        self.assertEqual(remote.usage_state['imports'],[])
        remote.db.execute('INSERT INTO ' + RECEIPTS + ' VALUES(?,?,?)',(digest,pending['path'],'wrong'));remote.db.commit()
        with self.assertRaisesRegex(ValueError,'payload differs'):
            self.reconcile(digest,files,remote,pending)

    def test_lagging_telemetry_is_bounded_and_keeps_charges_on_retry(self):
        manifest,digest,files,remote,state,pending = self.lost_status_prepare()
        remote.native_counters = lambda:{'target':remote.usage_state['target'],'unsampled':True,
            'totals':{'rows_read':1000,'rows_written':1000,'readQueries':12,'writeQueries':0}}
        with patch('transfer.time.sleep') as wait:
            with self.assertRaisesRegex(RuntimeError,'still lagging'):
                self.reconcile(digest,files,remote,pending,9)
        self.assertEqual(wait.call_count,11)
        self.assertTrue(remote.usage_state['unmeasured'])
        self.assertEqual(remote.usage_state['importReconciliationDiagnostics']['rows_read'],11)
        remote.native_counters = lambda:{'target':remote.usage_state['target'],'unsampled':True,
            'totals':{'rows_read':1000,'rows_written':1000,'readQueries':12,'writeQueries':1}}
        self.reconcile(digest,files,remote,pending,9)
        self.assertEqual(remote.usage_state['importReconciliations'][0]['diagnosticCharges']['rows_read'],13)
        self.assertEqual(remote.usage['rows_read'],1013)

    def test_reconciliation_refuses_wrong_target_pending_identity_and_unrelated_writes(self):
        manifest,digest,files,remote,state,pending = self.lost_status_prepare()
        wrong = dict(pending,importId='0'*32)
        with self.assertRaisesRegex(ValueError,'payload identity'):
            self.reconcile(digest,files,remote,wrong)
        remote.native_counters = lambda:{'target':{},'unsampled':True,'totals':{}}
        with self.assertRaisesRegex(ValueError,'snapshot target'):
            self.reconcile(digest,files,remote,pending)
        remote.native_counters = lambda:{'target':remote.usage_state['target'],'unsampled':True,
            'totals':{'rows_read':1000,'rows_written':1000,'readQueries':12,'writeQueries':2}}
        with self.assertRaisesRegex(ValueError,'Unrelated writes'):
            self.reconcile(digest,files,remote,pending)
        self.assertTrue(remote.usage_state['unmeasured'])

    def test_reconciliation_refuses_unrelated_pending_queries_cleanup_and_scratch(self):
        manifest,digest,files,remote,state,pending = self.lost_status_prepare()
        for name,value in [('pendingQuery',{'id':'normal','kind':'normal'}),('pendingCleanupQueries',['cleanup'])]:
            remote.usage_state[name] = value
            with self.assertRaisesRegex(ValueError,'unrelated query'):
                self.reconcile(digest,files,remote,pending)
            remote.usage_state.pop(name)
        scratch = remote.scratch_state()
        scratch['owned'] = [{'name':VOCAB_PREFIX+'b'*32,'sql':'CREATE TABLE synthetic(id)'}]
        write_json(remote.scratch_path(),scratch)
        with self.assertRaisesRegex(ValueError,'scratch uncertainty'):
            self.reconcile(digest,files,remote,pending)

    def test_receipt_proof_response_loss_retains_inflight_marker_and_blocks_retry(self):
        manifest,digest,files,remote,state,pending = self.lost_status_prepare()
        remote.crash_query = True
        with self.assertRaises(SystemExit):self.reconcile(digest,files,remote,pending)
        persisted = json.loads(remote.usage_path.read_text())
        self.assertEqual(persisted['pendingQuery']['kind'],'import-reconciliation-read')
        self.assertTrue(persisted['unmeasured'])
        with self.assertRaisesRegex(ValueError,'unrelated query'):
            self.reconcile(digest,files,remote,pending)

    def test_real_import_error_preserves_full_private_diagnostic_and_stops_recovery(self):
        manifest,digest,files,remote,state = self.native_prepare()
        response = {'success':False,'status':'error','error':'Synthetic sensitive SQL detail','result':{'diagnostic':'retained'}}
        with self.assertRaisesRegex(RuntimeError,'private diagnostic saved') as error:
            remote.poll_import(response,lambda bookmark:None,'a'*32)
        self.assertNotIn(response['error'],str(error.exception))
        failure = remote.usage_state['importFailure']
        self.assertEqual(failure['kind'],'failed')
        self.assertEqual(json.loads((remote.usage_path.parent/failure['path']).read_text())['response'],response)
        with self.assertRaisesRegex(ValueError,'Confirmed import failure'):remote.import_recovery_budget()
        with self.assertRaisesRegex(RuntimeError,'usage is uncertain'):remote.check_budget()

    def test_reconciliation_rejects_lagging_row_cost_and_changed_extra_charge(self):
        manifest,digest,files,remote,state,pending = self.lost_status_prepare()
        remote.usage['rows_written'] = 2000
        remote.native_counters = lambda:{'target':remote.usage_state['target'],'unsampled':True,
            'totals':{'rows_read':1000,'rows_written':1000,'readQueries':12,'writeQueries':1}}
        with patch('transfer.time.sleep'):
            with self.assertRaisesRegex(RuntimeError,'still lagging'):
                self.reconcile(digest,files,remote,pending,9)
        self.assertEqual(remote.usage['rows_written'],2000)
        with self.assertRaisesRegex(ValueError,'diagnostic charge differs'):
            self.reconcile(digest,files,remote,pending,0)
        self.assertTrue(remote.usage_state['unmeasured'])

    def test_reconciliation_proof_transport_loss_preserves_unknown_query(self):
        manifest,digest,files,remote,state,pending = self.lost_status_prepare()
        remote.request = lambda *args,**kwargs:(_ for _ in ()).throw(urllib.error.URLError('private response detail'))
        with self.assertRaisesRegex(RuntimeError,'proof response was lost') as error:
            self.reconcile(digest,files,remote,pending)
        self.assertNotIn('private response detail',str(error.exception))
        self.assertEqual(remote.usage_state['pendingQuery']['kind'],'import-reconciliation-read')
        self.assertTrue(remote.usage_state['unmeasured'])
        with self.assertRaisesRegex(ValueError,'unrelated query'):
            remote.import_recovery_budget()

    def test_native_counters_require_unsampled_whole_lifetime_exact_target(self):
        manifest,digest,files,remote,state = self.native_prepare()
        today = datetime.datetime.now(datetime.timezone.utc).date()
        database = {'uuid':remote.database,'created_at':today.isoformat()+'T00:00:00Z'}
        group = {'dimensions':{'date':today.isoformat(),'databaseId':remote.database},
            'sum':{'rowsRead':123,'rowsWritten':456,'readQueries':3,'writeQueries':1},'avg':{'sampleInterval':1}}
        calls = []
        def request(method,path,body=None):
            calls.append((method,path,body))
            return database if method == 'GET' else {'viewer':{'accounts':[{'d1AnalyticsAdaptiveGroups':[group]}]}}
        remote.request = request
        snapshot = Cloudflare.native_counters(remote)
        self.assertEqual(snapshot['totals'],{'rows_read':123,'rows_written':456,'readQueries':3,'writeQueries':1})
        self.assertIn('avg {sampleInterval}',calls[1][2]['query'])
        for invalid in ({}, {'sampleInterval':2}, {'sampleInterval':True}):
            group['avg'] = invalid
            with self.assertRaisesRegex(ValueError,'sampling interval'):Cloudflare.native_counters(remote)
        group['avg'] = {'sampleInterval':1}
        group['dimensions']['databaseId'] = 'wrong'
        with self.assertRaisesRegex(ValueError,'group target'):Cloudflare.native_counters(remote)
        group['dimensions']['databaseId'] = remote.database
        database['created_at'] = (today-datetime.timedelta(days=30)).isoformat()+'T00:00:00Z'
        with self.assertRaisesRegex(ValueError,'database lifetime'):Cloudflare.native_counters(remote)

    def owned_scratch(self, remote):
        name = VOCAB_PREFIX + 'a' * 32
        definition = 'CREATE TABLE "' + name + '"(id INTEGER)'
        remote.claim_scratch({name:definition})
        remote.query(definition)
        return name

    def test_lost_immediate_import_ack_with_existing_ledger_is_not_false_certain(self):
        manifest,digest,files,remote,state = self.native_prepare()
        remote.lose_import_ack = True
        with self.assertRaises(ConnectionError):
            self.run_transfer(manifest,digest,files,remote,state)
        self.assertEqual(remote.usage_state['imports'], [])
        self.assertFalse(remote.usage_state['unmeasured'])
        resumed = NativeBridge(self.root / 'native.sqlite', self.root / 'native-usage.json', digest)
        self.addCleanup(resumed.db.close)
        with self.assertRaisesRegex(ValueError,'no accounted native usage history'):
            self.run_transfer(manifest,digest,files,resumed,state)
        self.assertTrue(json.loads((self.root / 'native-usage.json').read_text())['unmeasured'])

    def test_each_known_receipt_requires_accounted_import_even_after_restart(self):
        manifest,digest,files,remote,state = self.native_prepare()
        self.run_transfer(manifest,digest,files,remote,state)
        writes = remote.usage['rows_written']
        self.run_transfer(manifest,digest,files,remote,state)
        self.assertEqual(remote.imports, len(files))
        self.assertEqual(remote.usage['rows_written'], writes)
        remote.usage_state['imports'].pop(1)
        write_json(remote.usage_path,remote.usage_state)
        resumed = NativeBridge(self.root / 'native.sqlite', self.root / 'native-usage.json', digest)
        self.addCleanup(resumed.db.close)
        with self.assertRaisesRegex(ValueError,'no accounted native usage history'):
            self.run_transfer(manifest,digest,files,resumed,state)
        self.assertTrue(resumed.usage_state['unmeasured'])

    def test_normal_native_verification_cleans_journal_and_restores_search(self):
        manifest,digest,files,remote,state = self.native_prepare()
        self.run_transfer(manifest,digest,files,remote,state)
        with contextlib.redirect_stdout(io.StringIO()):
            verify_remote(self.output,manifest,remote,self.root / 'verified.sqlite')
        self.assertFalse(remote.scratch_state()['owned'])
        self.assertFalse(remote.usage_state.get('pendingCleanupQueries'))
        self.assertFalse(remote.usage_state.get('pendingQuery'))
        remote.query('SELECT 1')

    def test_cleanup_reserve_works_after_phase_budget_exhaustion(self):
        manifest,digest,files,remote,state = self.native_prepare()
        name = self.owned_scratch(remote)
        from transfer import CLEANUP_RESERVE
        remote.usage['rows_written'] = BUDGET['rows_written'] - CLEANUP_RESERVE['rows_written']
        write_json(remote.usage_path,remote.usage_state)
        with self.assertRaisesRegex(RuntimeError,'budget exhausted'):remote.check_budget()
        remote.cleanup_scratch()
        self.assertFalse(remote.db.execute('SELECT 1 FROM sqlite_schema WHERE name=?',(name,)).fetchone())
        self.assertFalse(remote.scratch_state()['owned'])
        self.assertGreater(remote.scratch_state()['cleanupUsage']['rows_written'],0)
        with self.assertRaisesRegex(RuntimeError,'budget exhausted'):remote.check_budget()

    def test_crash_owned_orphan_recovers_and_preserves_interrupted_query(self):
        manifest,digest,files,remote,state = self.native_prepare()
        name = self.owned_scratch(remote)
        remote.crash_query = True
        with self.assertRaises(SystemExit):remote.query('SELECT 1')
        original = json.loads(remote.usage_path.read_text())['pendingQuery']
        resumed = NativeBridge(self.root / 'native.sqlite',self.root / 'native-usage.json',digest,allow_stopped=True)
        self.addCleanup(resumed.db.close)
        with self.assertRaisesRegex(RuntimeError,'usage is uncertain'):resumed.check_budget()
        resumed.cleanup_scratch()
        self.assertFalse(resumed.db.execute('SELECT 1 FROM sqlite_schema WHERE name=?',(name,)).fetchone())
        self.assertEqual(resumed.usage_state['pendingQuery'],original)
        self.assertTrue(resumed.usage_state['unmeasured'])
        self.assertFalse(resumed.usage_state.get('pendingCleanupQueries'))
        with self.assertRaisesRegex(RuntimeError,'usage is uncertain'):resumed.check_budget()

    def test_lost_drop_ack_preserves_ownership_until_absence_is_confirmed(self):
        manifest,digest,files,remote,state = self.native_prepare()
        name = self.owned_scratch(remote)
        remote.lose_drop_ack = True
        with self.assertRaises(RuntimeError):remote.cleanup_scratch()
        self.assertTrue(remote.scratch_state()['owned'])
        self.assertFalse(remote.db.execute('SELECT 1 FROM sqlite_schema WHERE name=?',(name,)).fetchone())
        unresolved = list(remote.usage_state['pendingCleanupQueries'])
        resumed = NativeBridge(self.root / 'native.sqlite',self.root / 'native-usage.json',digest,allow_stopped=True)
        self.addCleanup(resumed.db.close)
        resumed.cleanup_scratch()
        self.assertFalse(resumed.scratch_state()['owned'])
        self.assertEqual(resumed.usage_state['pendingCleanupQueries'],unresolved)
        with self.assertRaisesRegex(RuntimeError,'usage is uncertain'):resumed.check_budget()

    def test_cleanup_refuses_unowned_names_and_changed_owned_definitions(self):
        manifest,digest,files,remote,state = self.native_prepare()
        remote.query('CREATE TABLE retained(id TEXT)')
        with self.assertRaisesRegex(ValueError,'journal-owned'):
            remote.execute_query('DROP TABLE retained',cleanup=True)
        name = self.owned_scratch(remote)
        remote.db.execute('ALTER TABLE "' + name + '" ADD COLUMN changed TEXT');remote.db.commit()
        with self.assertRaisesRegex(ValueError,'definition differs'):remote.cleanup_scratch()
        self.assertTrue(remote.db.execute("SELECT 1 FROM sqlite_schema WHERE name='retained'").fetchone())
        self.assertTrue(remote.scratch_state()['owned'])

    def test_oauth_refresh_handles_multiple_expirations_during_one_phase(self):
        remote = Cloudflare('account','database',self.root / 'never-read-oauth')
        remote.token = lambda:'synthetic'
        expiry_checks = iter([True,False,False,True,False])
        remote.oauth_expired = lambda:next(expiry_checks)
        class Client:
            def open(self,request,timeout):return io.BytesIO(b'{"success":true,"result":{}}')
        remote.client = Client()
        with patch('transfer.time.sleep'),patch('transfer.subprocess.run',return_value=SimpleNamespace(returncode=0)) as refresh:
            for _ in range(3):remote.request('GET','synthetic')
        self.assertEqual(refresh.call_count,2)

    def test_oauth_refresh_stops_if_wrangler_leaves_expired_credentials(self):
        remote = Cloudflare('account','database',self.root / 'never-read-oauth')
        remote.oauth_expired = lambda:True
        with patch('transfer.subprocess.run',return_value=SimpleNamespace(returncode=0)) as refresh, self.assertRaisesRegex(RuntimeError,'valid credentials'):
            remote.request('GET','synthetic')
        refresh.assert_called_once()

    def test_oauth_refresh_does_not_loop_on_repeated_unauthorized_response(self):
        remote = Cloudflare('account','database',self.root / 'never-read-oauth')
        remote.token = lambda:'synthetic'
        expiry_checks = iter([False,True,False])
        remote.oauth_expired = lambda:next(expiry_checks)
        class Client:
            def open(self,request,timeout):
                raise urllib.error.HTTPError(request.full_url,401,'denied',Message(),io.BytesIO(b'PRIVATE RESPONSE BODY'))
        remote.client = Client()
        with patch('transfer.time.sleep'),patch('transfer.subprocess.run',return_value=SimpleNamespace(returncode=0)) as refresh, self.assertRaisesRegex(RuntimeError,'HTTP 401'):
            remote.request('GET','synthetic')
        refresh.assert_called_once()

    def test_r2_request_limit_survives_failure_and_restart_before_network(self):
        url = 'https://media-tracker-transfer.synthetic.workers.dev'
        settings = {'url':url,'clientId':'synthetic','clientSecret':'synthetic','bearer':'synthetic'}
        path = self.root / 'r2-usage.json'
        write_json(path,{'target':{'url':url,'bundle':'bundle'},'requestLimit':R2_REQUEST_LIMIT,'requests':R2_REQUEST_LIMIT-1})
        r2 = R2Transfer(settings,url,path,'bundle')
        class Client:
            calls = 0
            def open(self,request,timeout):
                self.calls += 1
                raise ConnectionError('Lost response after invocation')
        client = Client();r2.client = client
        with self.assertRaises(ConnectionError):r2.request('/head','synthetic')
        self.assertEqual(json.loads(path.read_text())['requests'],R2_REQUEST_LIMIT)
        resumed = R2Transfer(settings,url,path,'bundle');resumed.client = client
        with self.assertRaisesRegex(RuntimeError,'request limit'):resumed.request('/head','synthetic')
        self.assertEqual(client.calls,1)
        with self.assertRaisesRegex(ValueError,'checkpoint'):R2Transfer(settings,url,path,'wrong-bundle')

    def test_r2_concurrent_request_reservations_cannot_exceed_limit(self):
        import concurrent.futures
        url = 'https://media-tracker-transfer.synthetic.workers.dev';path = self.root / 'r2-usage.json'
        write_json(path,{'target':{'url':url,'bundle':'bundle'},'requestLimit':R2_REQUEST_LIMIT,'requests':R2_REQUEST_LIMIT-5})
        r2 = R2Transfer({'url':url},url,path,'bundle')
        def reserve():
            try:r2.reserve_request();return True
            except RuntimeError:return False
        with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
            self.assertEqual(sum(pool.map(lambda _:reserve(),range(30))),5)
        self.assertEqual(json.loads(path.read_text())['requests'],R2_REQUEST_LIMIT)

    def test_r2_resume_batches_existing_objects_and_writes_only_missing(self):
        items = {str(i):{'bytes':i} for i in range(40)}
        class Fake:
            groups = []
            copied = []
            def heads(self,keys):
                self.groups.append(keys)
                return [None if key == '39' else items[key] for key in keys]
            def matches(self,actual,expected):return actual == expected
            def copy(self,directory,key,expected):self.copied.append(key)
        r2 = Fake()
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(transfer_r2(self.root,{'objects':items},r2,4),40)
        self.assertEqual(sorted(map(len,r2.groups)),[8,16,16])
        self.assertEqual(r2.copied,['39'])
        r2.groups.clear();r2.copied.clear();items['0']={'bytes':-1}
        r2.heads = lambda keys:[{'bytes':int(key)} for key in keys]
        with contextlib.redirect_stdout(io.StringIO()),self.assertRaisesRegex(ValueError,'differs'):
            transfer_r2(self.root,{'objects':items},r2,4)
        self.assertEqual(r2.copied,[])

    def test_r2_network_requests_require_persistent_accounting(self):
        url = 'https://media-tracker-transfer.synthetic.workers.dev'
        with self.assertRaisesRegex(ValueError,'Persistent R2'):
            R2Transfer({'url':url},url).request('/head','synthetic')

    def test_r2_resume_compares_checksum_size_and_exact_metadata(self):
        class FakeR2(R2Transfer):
            def __init__(self):
                self.object = None
                self.puts = 0
                self.lose_ack = True
            def request(self, route, key, metadata=None, path=None):
                if route == '/head':return self.object
                self.puts += 1
                self.object = {'size': metadata['bytes'], 'sha256': checksum(path), 'httpMetadata': metadata['httpMetadata'], 'customMetadata': metadata['customMetadata']}
                if self.lose_ack:raise ConnectionError('Lost R2 response')
                return self.object
        manifest = self.bundle()
        key, expected = next(iter(manifest['objects'].items()))
        expected['customMetadata'] = {'parserVersion': 'preserved'}
        r2 = FakeR2()
        with self.assertRaises(ConnectionError):r2.copy(self.output,key,expected)
        r2.lose_ack = False
        r2.copy(self.output,key,expected)
        self.assertEqual(r2.puts, 1)
        r2.object['customMetadata'] = {'parserversion': 'preserved'}
        with self.assertRaisesRegex(ValueError, 'refusing to overwrite'):r2.copy(self.output,key,expected)


if __name__ == '__main__':
    unittest.main()
