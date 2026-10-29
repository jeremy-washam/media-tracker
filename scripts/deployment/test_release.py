import copy
from datetime import datetime, timedelta, timezone
import json
import sqlite3
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import release


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.configuration = {
            'name': 'media-tracker', 'account_id': 'a' * 32,
            'vars': {'AUTH_MODE': 'access', 'SYNC_ENABLED': 'true'},
            'limits': {'cpu_ms': 30000},
            'd1_databases': [{'binding': 'DB', 'database_id': 'database'}],
            'r2_buckets': [{'binding': 'RAW_BUCKET', 'bucket_name': 'media-tracker-raw'}],
            'queues': {'producers': [{'binding': 'SYNC_QUEUE', 'queue': 'media-tracker-sync'}],
                       'consumers': []},
            'triggers': {'crons': ['0 * * * *']},
        }
        self.live = {'limits': {'cpu_ms': 30000}, 'bindings': [
            {'name': name, 'type': 'plain_text', 'text': value}
            for name, value in self.configuration['vars'].items()
        ] + [{'name': 'DB', 'type': 'd1', 'id': 'database'},
             {'name': 'RAW_BUCKET', 'type': 'r2_bucket', 'bucket_name': 'media-tracker-raw'},
             {'name': 'SYNC_QUEUE', 'type': 'queue', 'queue_id': 'queue'},
             {'name': 'PRIVATE_SECRET', 'type': 'secret_text'}]}
        self.queues = [{'queue_id': 'queue', 'queue_name': 'media-tracker-sync', 'settings': {'delivery_paused': True}}]
        self.inventory = [{'name': '0001.sql', 'sha256': '1'}, {'name': '0002.sql', 'sha256': '2'}]

    def test_quiescence_counts_spotify_and_ignores_deferred_catalog_work(self):
        database = sqlite3.connect(':memory:')
        try:
            database.executescript("CREATE TABLE source_sync_lease(expires_at INTEGER); CREATE TABLE catalog_refresh_jobs(state TEXT,lease_expires_at TEXT); CREATE TABLE spotify_catalog_backfill_jobs(state TEXT,lease_expires_at TEXT); INSERT INTO catalog_refresh_jobs VALUES('pending','2026-11-30T00:00:00Z');")
            params = [0,'2026-10-29T00:00:00Z','2026-10-29T00:00:00Z']
            self.assertEqual(database.execute(release.ACTIVE_LEASE_SQL,params).fetchone()[0],0)
            database.execute("INSERT INTO spotify_catalog_backfill_jobs VALUES('running','2026-10-30T00:00:00Z')")
            self.assertEqual(database.execute(release.ACTIVE_LEASE_SQL,params).fetchone()[0],1)
        finally:
            database.close()

    def test_migration_history_rejects_unknown_duplicate_and_gaps(self):
        for applied in [['other.sql'], ['0001.sql', '0001.sql'], ['0002.sql']]:
            with self.subTest(applied=applied), self.assertRaises(release.ReleaseError):
                release.pending_migrations(self.inventory, applied)
        self.assertEqual(release.pending_migrations(self.inventory, ['0001.sql']), ['0002.sql'])

    def test_migration_digest_binds_names_and_content(self):
        original = release.inventory_digest(self.inventory)
        changed = copy.deepcopy(self.inventory)
        changed[1]['sha256'] = 'different'
        self.assertNotEqual(original, release.inventory_digest(changed))

    def test_live_drift_rejects_removed_or_changed_variables_and_storage(self):
        release.verify_live(self.configuration, self.live, self.queues)
        for name in ['variables', 'database', 'r2', 'queue', 'limits']:
            live = copy.deepcopy(self.live)
            if name == 'variables':
                live['bindings'][1]['text'] = 'false'
            elif name == 'database':
                live['bindings'][2]['id'] = 'other'
            elif name == 'r2':
                live['bindings'][3]['bucket_name'] = 'other'
            elif name == 'queue':
                live['bindings'][4]['queue_id'] = 'other'
            else:
                live['limits']['cpu_ms'] = 300000
            with self.subTest(name=name), self.assertRaises(release.ReleaseError):
                release.verify_live(self.configuration, live, self.queues)

    def test_native_queue_name_bindings_match_the_live_api(self):
        self.live['bindings'][4] = {'name':'SYNC_QUEUE','type':'queue','queue_name':'media-tracker-sync'}
        release.verify_live(self.configuration,self.live,self.queues)
        self.configuration['vars'].update({'OPERATING_MONITOR_ENABLED':'true','SYNC_QUEUE_ID':'queue'})
        self.live['bindings'].extend([{'name':key,'type':'plain_text','text':value} for key,value in self.configuration['vars'].items() if key in {'OPERATING_MONITOR_ENABLED','SYNC_QUEUE_ID'}])
        release.verify_live(self.configuration,self.live,self.queues)

    def test_monitor_queue_id_must_match_the_actual_sync_producer(self):
        self.configuration['vars'].update({'OPERATING_MONITOR_ENABLED': 'true', 'SYNC_QUEUE_ID': 'queue'})
        self.live['bindings'].extend([
            {'name': 'OPERATING_MONITOR_ENABLED', 'type': 'plain_text', 'text': 'true'},
            {'name': 'SYNC_QUEUE_ID', 'type': 'plain_text', 'text': 'queue'},
        ])
        release.verify_live(self.configuration, self.live, self.queues)
        self.queues.append({'queue_id': 'other', 'queue_name': 'unrelated-queue'})
        self.configuration['vars']['SYNC_QUEUE_ID'] = 'other'
        self.live['bindings'][-1]['text'] = 'other'
        with self.assertRaisesRegex(release.ReleaseError, 'actual sync queue'):
            release.verify_live(self.configuration, self.live, self.queues)
        self.configuration['vars']['SYNC_QUEUE_ID'] = ''
        self.live['bindings'][-1]['text'] = ''
        with self.assertRaisesRegex(release.ReleaseError, 'actual sync queue'):
            release.verify_live(self.configuration, self.live, self.queues)

    def test_consumer_and_schedule_drift_stops_release(self):
        release.verify_schedules(self.configuration, {'schedules': [{'cron': '0 * * * *'}]})
        with self.assertRaises(release.ReleaseError):
            release.verify_schedules(self.configuration, {'schedules': [{'cron': '* * * * *'}]})
        release.verify_consumers(self.configuration, self.queues, {'queue': []})
        found = {'script': 'media-tracker', 'settings': {'batch_size': 1, 'max_concurrency': 1, 'max_retries': 1}}
        with self.assertRaises(release.ReleaseError):
            release.verify_consumers(self.configuration, self.queues, {'queue': [found]})
        self.configuration['queues']['consumers'] = [{'queue': 'media-tracker-sync', 'max_batch_size': 1, 'max_concurrency': 1, 'max_retries': 1}]
        release.verify_consumers(self.configuration, self.queues, {'queue': [found]})
        found['settings']['max_concurrency'] = 50
        with self.assertRaises(release.ReleaseError):
            release.verify_consumers(self.configuration, self.queues, {'queue': [found]})

    def test_exact_revision_requires_clean_current_main(self):
        revision = 'a' * 40
        for outputs in [[revision, 'dirty', revision], [revision, '', 'b' * 40], ['b' * 40, '', revision]]:
            with self.subTest(outputs=outputs), patch.object(release, 'run', side_effect=outputs), self.assertRaises(release.ReleaseError):
                release.verify_revision(revision)
        with patch.object(release, 'run', side_effect=[revision, '', revision + '\trefs/heads/main']):
            release.verify_revision(revision)
        with self.assertRaises(release.ReleaseError):
            release.verify_revision('main; unsafe')

    def test_smoke_requires_denial_and_authenticated_health(self):
        with patch.dict('os.environ', {'CF_ACCESS_CLIENT_ID': 'id', 'CF_ACCESS_CLIENT_SECRET': 'secret'}):
            with patch.object(release, 'fetch', side_effect=[(302, b''), (200, b'{"status":"ok","service":"media-tracker-api"}')]):
                release.smoke()
            for responses in [[(200, b'public')], [(302, b''), (200, b'<html>login</html>')], [(302, b''), (503, b'')]]:
                with patch.object(release, 'fetch', side_effect=responses), self.assertRaises(release.ReleaseError):
                    release.smoke()

    def test_library_smoke_queries_only_fixed_paths_and_validates_json(self):
        responses = [(302, b''), (200, b'{"status":"ok","service":"media-tracker-api"}')]
        for family in ['books', 'movies', 'articles', 'podcasts', 'music', 'videos']:
            key = 'counts' if family == 'books' else 'membershipCounts' if family == 'movies' else 'sectionCounts'
            responses.append((200, json.dumps({key: {'items': 1}}).encode()))
        with patch.dict('os.environ', {'CF_ACCESS_CLIENT_ID': 'id', 'CF_ACCESS_CLIENT_SECRET': 'secret'}):
            with patch.object(release, 'fetch', side_effect=responses) as fetch:
                release.smoke(library=True)
                self.assertEqual(fetch.call_count, 8)
                self.assertTrue(all('?' not in args[0][0] for args in fetch.call_args_list))
            responses[-1] = (200, b'{"sectionCounts":{"items":-1}}')
            with patch.object(release, 'fetch', side_effect=responses), self.assertRaises(release.ReleaseError):
                release.smoke(library=True)

    def test_redirect_handler_never_forwards_credentials(self):
        self.assertIsNone(release.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://elsewhere.invalid'))

    def exercise_deploy(self, applied, digest=None, sync='true', smoke_failure=False):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        root.joinpath('apps/api').mkdir(parents=True)
        configuration = copy.deepcopy(self.configuration)
        configuration['vars']['SYNC_ENABLED'] = sync
        live = copy.deepcopy(self.live)
        live['bindings'][1]['text'] = sync
        commands = []
        queries = 0
        def management(account, suffix, body=None):
            nonlocal queries
            if suffix.endswith('/settings'):
                return live
            if suffix == '/queues':
                return self.queues
            if suffix.endswith('/consumers'):
                return []
            if suffix.endswith('/schedules'):
                return {'schedules': [{'cron': '0 * * * *'}]}
            if suffix.endswith('/query'):
                if ' AS active' in body['sql']:
                    return [{'results': [{'active': 0}]}]
                queries += 1
                return [{'results': [{'name': name} for name in (applied if queries == 1 else ['0001.sql', '0002.sql'])]}]
            if suffix.endswith('/bookmark'):
                return {'bookmark': 'protected-recovery-point'}
            if suffix.endswith('/deployments'):
                return {'deployments': [{'versions': [{'version_id': 'old-version'}]}]}
            raise AssertionError(suffix)
        def run(arguments):
            commands.append(arguments)
            return ''
        smoke = [None, None, release.ReleaseError('Authenticated production smoke failed')] if smoke_failure else [None, None, None]
        patches = [patch.object(release, 'ROOT', root), patch.object(release, 'verify_revision'),
                   patch.object(release, 'migration_inventory', return_value=self.inventory),
                   patch.object(release, 'management', side_effect=management),
                   patch.object(release, 'read_operating_state', return_value={'version': 1, 'paused': sync == 'false', 'reason': 'manual', 'pausedAt': (datetime.now(timezone.utc) - timedelta(minutes=21)).isoformat()}),
                   patch.object(release, 'run', side_effect=run), patch.object(release, 'smoke', side_effect=smoke),
                   patch.dict('os.environ', {'PRODUCTION_CONFIGURATION': json.dumps(configuration)})]
        for item in patches:
            item.start()
            self.addCleanup(item.stop)
        return commands, root, lambda: release.deploy('a' * 40, digest)

    def test_migration_pause_must_be_manual_old_enough_and_native(self):
        now = datetime.now(timezone.utc)
        state = {'version': 1, 'paused': True, 'reason': 'manual', 'pausedAt': (now - timedelta(minutes=21)).isoformat()}
        release.verify_quiescence(state, self.queues, ['media-tracker-sync'], now)
        for mutation in [{'paused': False}, {'reason': 'spend'}, {'pausedAt': now.isoformat()}, {'pausedAt': 'invalid'}]:
            with self.subTest(mutation=mutation), self.assertRaises(release.ReleaseError):
                release.verify_quiescence(dict(state, **mutation), self.queues, ['media-tracker-sync'], now)
        self.queues[0]['settings']['delivery_paused'] = False
        with self.assertRaises(release.ReleaseError):
            release.verify_quiescence(state, self.queues, ['media-tracker-sync'], now)

    def test_code_release_refuses_pending_migrations_without_mutation(self):
        commands, _, action = self.exercise_deploy(['0001.sql'])
        with self.assertRaisesRegex(release.ReleaseError, 'Pending migrations'):
            action()
        self.assertFalse(any('put' in command or 'apply' in command or command[-1] == 'deploy' for command in commands))

    def test_reviewed_migration_requires_pause_before_mutation(self):
        commands, _, action = self.exercise_deploy(['0001.sql'], release.inventory_digest(self.inventory))
        with self.assertRaisesRegex(release.ReleaseError, 'manual pause'):
            action()
        self.assertFalse(any('put' in command or 'apply' in command for command in commands))

    def test_durable_bookmark_precedes_migration_and_deploy(self):
        commands, root, action = self.exercise_deploy(['0001.sql'], release.inventory_digest(self.inventory), sync='false')
        action()
        phases = [command[8] for command in commands if 'put' in command]
        self.assertTrue(any('prepared.json' in str(command) for command in commands))
        mutation = next(index for index, command in enumerate(commands) if 'apply' in command)
        prepared = next(index for index, command in enumerate(commands) if any('prepared.json' in arg for arg in command))
        self.assertLess(prepared, mutation)
        receipt = next(root.glob('.private/releases/*/prepared.json'))
        self.assertEqual(json.loads(receipt.read_text())['bookmark']['bookmark'], 'protected-recovery-point')
        self.assertEqual(receipt.stat().st_mode & 0o777, 0o600)
        self.assertEqual(len(phases), 5)
        self.assertFalse(any('restore' in command or 'rollback' in command for command in commands))

    def test_failed_smoke_retains_recovery_point_and_never_rolls_back(self):
        commands, root, action = self.exercise_deploy(['0001.sql', '0002.sql'], smoke_failure=True)
        with self.assertRaises(release.ReleaseError):
            action()
        self.assertTrue(list(root.glob('.private/releases/*/prepared.json')))
        self.assertFalse(list(root.glob('.private/releases/*/smoke-passed.json')))
        self.assertFalse(any('restore' in command or 'rollback' in command for command in commands))


if __name__ == '__main__':
    unittest.main()
