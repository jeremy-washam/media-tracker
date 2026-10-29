#!/usr/bin/env python3
"""Exact-revision release guard. Live responses and configuration never enter public logs."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import uuid
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
API = 'https://api.cloudflare.com/client/v4'
ORIGIN = 'https://media-tracker.jeremydwasham.workers.dev'


class ReleaseError(RuntimeError):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch(url, headers=None, body=None):
    request = urllib.request.Request(url, headers={
        'User-Agent': 'ImladrisDeployment/1.0', **(headers or {}),
    }, data=body)
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=30) as response:
            payload = response.read(2 * 1024 * 1024 + 1)
            if len(payload) > 2 * 1024 * 1024:
                raise ReleaseError('Management response exceeded size limit')
            return response.status, payload
    except urllib.error.HTTPError as error:
        # Never expose an error body, URL, owner data, or authentication headers.
        return error.code, b''
    except (OSError, TimeoutError) as error:
        raise ReleaseError('Request failed; no release retry was performed') from error


def management(account, suffix, body=None):
    token = os.environ.get('CLOUDFLARE_API_TOKEN')
    if not token:
        raise ReleaseError('CLOUDFLARE_API_TOKEN is required')
    status, payload = fetch(API + '/accounts/' + account + suffix,
                            {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'},
                            json.dumps(body).encode() if body is not None else None)
    if status != 200:
        raise ReleaseError('Cloudflare request failed (HTTP ' + str(status) + ')')
    try:
        result = json.loads(payload)
        if result.get('success') is not True:
            raise ReleaseError('Cloudflare request was unsuccessful')
        return result['result']
    except (ValueError, KeyError) as error:
        raise ReleaseError('Invalid Cloudflare response') from error


def run(arguments):
    result = subprocess.run(arguments, cwd=ROOT, capture_output=True, text=True, check=False)
    if result.returncode:
        # Wrangler output includes bindings/owner identity. Retain it only locally.
        raise ReleaseError('Command failed: ' + arguments[0] + ' (private output suppressed)')
    return result.stdout


def migration_inventory():
    return [{'name': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
            for path in sorted((ROOT / 'packages/db/migrations').glob('*.sql'))]


def inventory_digest(inventory):
    return hashlib.sha256(json.dumps(inventory, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def pending_migrations(inventory, applied):
    names = [item['name'] for item in inventory]
    if len(set(applied)) != len(applied) or any(name not in names for name in applied):
        raise ReleaseError('Applied migration inventory differs from this revision')
    # A gap in the applied prefix means deployment history requires investigation.
    if set(applied) != set(names[:len(applied)]):
        raise ReleaseError('Applied migration history is not an ordered prefix')
    return names[len(applied):]


def verify_revision(revision):
    if not re.fullmatch('[0-9a-f]{40}', revision):
        raise ReleaseError('Use a full immutable commit SHA')
    if run(['git', 'rev-parse', 'HEAD']).strip() != revision:
        raise ReleaseError('Checked-out revision does not match validated revision')
    if run(['git', 'status', '--porcelain', '--untracked-files=normal']).strip():
        raise ReleaseError('Release checkout must be clean')
    # Re-read current main immediately before the remote operation. Do not deploy
    # an older queued run after a newer release, or a workflow_dispatch branch.
    remote = run(['git', 'ls-remote', 'origin', 'refs/heads/main']).split()
    if not remote or remote[0] != revision:
        raise ReleaseError('Only the current origin/main revision can be released')


def verify_live(configuration, live, queues):
    if configuration.get('name') != 'media-tracker' or configuration.get('vars', {}).get('AUTH_MODE') != 'access':
        raise ReleaseError('Unexpected production target or authentication mode')
    bindings = live.get('bindings', [])
    plaintext = {item['name']: item.get('text') for item in bindings if item['type'] == 'plain_text'}
    if plaintext != configuration['vars']:
        raise ReleaseError('Production variables drifted; reconcile protected configuration first')
    wanted_d1 = {(item['binding'], item['database_id']) for item in configuration.get('d1_databases', [])}
    actual_d1 = {(item['name'], item['id']) for item in bindings if item['type'] == 'd1'}
    wanted_r2 = {(item['binding'], item['bucket_name']) for item in configuration.get('r2_buckets', [])}
    actual_r2 = {(item['name'], item['bucket_name']) for item in bindings if item['type'] == 'r2_bucket'}
    if wanted_d1 != actual_d1 or wanted_r2 != actual_r2:
        raise ReleaseError('Production storage bindings drifted')
    queue_names = {item['queue_id']: item['queue_name'] for item in queues}
    wanted_queues = {(item['binding'], item['queue']) for item in configuration['queues']['producers']}
    actual_queues = {(item['name'], item.get('queue_name') or queue_names.get(item.get('queue_id'))) for item in bindings if item['type'] == 'queue'}
    if wanted_queues != actual_queues:
        raise ReleaseError('Production queue bindings drifted')
    if configuration['vars'].get('OPERATING_MONITOR_ENABLED') == 'true':
        monitor_id = configuration['vars'].get('SYNC_QUEUE_ID')
        producer = next((item for item in bindings if item['name'] == 'SYNC_QUEUE' and item['type'] == 'queue'), {})
        producer_id = producer.get('queue_id') or next((key for key,value in queue_names.items() if value == producer.get('queue_name')), None)
        if not monitor_id or monitor_id != producer_id or queue_names.get(monitor_id) != 'media-tracker-sync':
            raise ReleaseError('Operating monitor must control the actual sync queue')
    if live.get('limits') != configuration.get('limits'):
        raise ReleaseError('Production runtime limits drifted')
    wanted_assets = {configuration.get('assets', {}).get('binding')} - {None}
    actual_assets = {item['name'] for item in bindings if item['type'] == 'assets'}
    if wanted_assets != actual_assets:
        raise ReleaseError('Production assets binding drifted')
    wanted_limits = {item['name']: (str(item['namespace_id']), item['simple']) for item in configuration.get('ratelimits', [])}
    actual_limits = {item['name']: (str(item['namespace_id']), item['simple']) for item in bindings if item['type'] == 'ratelimit'}
    if wanted_limits != actual_limits:
        raise ReleaseError('Production rate limits drifted')
    if any(item['type'] not in {'plain_text', 'secret_text', 'd1', 'r2_bucket', 'queue', 'assets', 'ratelimit'} for item in bindings):
        raise ReleaseError('Unrecognized production binding requires explicit release support')


def verify_schedules(configuration, schedules):
    entries = schedules.get('schedules', []) if isinstance(schedules, dict) else schedules
    if sorted(item['cron'] for item in entries) != sorted(configuration['triggers']['crons']):
        raise ReleaseError('Production schedules drifted')


def verify_consumers(configuration, queues, consumers_by_queue):
    expected = {item['queue']: item for item in configuration['queues']['consumers']}
    actual = {}
    fields = {'max_batch_size': 'batch_size', 'max_concurrency': 'max_concurrency',
              'max_retries': 'max_retries'}
    for queue in queues:
        consumers = [item for item in consumers_by_queue[queue['queue_id']]
                     if item.get('script') == 'media-tracker']
        if consumers:
            if len(consumers) != 1 or queue['queue_name'] in actual:
                raise ReleaseError('Unexpected production queue consumer')
            actual[queue['queue_name']] = consumers[0]
    if set(actual) != set(expected):
        raise ReleaseError('Production queue consumers drifted')
    for name, wanted in expected.items():
        found = actual[name]
        if any(found.get('settings', {}).get(remote) != wanted[local]
               for local, remote in fields.items() if local in wanted):
            raise ReleaseError('Production queue consumer limits drifted')
        if found.get('dead_letter_queue', '') != wanted.get('dead_letter_queue', ''):
            raise ReleaseError('Production dead-letter queue drifted')
        if 'max_batch_timeout' in wanted and found.get('settings', {}).get('max_wait_time_ms') != wanted['max_batch_timeout'] * 1000:
            raise ReleaseError('Production queue batch timeout drifted')


def private_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with open(path, 'x', opener=lambda name, flags: os.open(name, flags, 0o600)) as stream:
        json.dump(value, stream, indent=2)
        stream.write('\n')


def record_phase(directory, receipt, phase, configuration_path):
    # The receipt contains management metadata, not source rows or credentials.
    # Keep it private and durable before any mutation; ephemeral CI disks vanish.
    value = dict(receipt, state=phase, recordedAt=datetime.now(timezone.utc).isoformat())
    path = directory / (phase + '.json')
    private_json(path, value)
    key = 'media-tracker-raw/operations/releases/' + directory.name + '/' + path.name
    run(['pnpm', '--filter', '@media-tracker/api', 'exec', 'wrangler', 'r2', 'object', 'put',
         key, '--file', str(path), '--remote', '--content-type', 'application/json',
         '--config', str(configuration_path)])


def read_operating_state(configuration_path, directory):
    path = directory / 'operating-state.json'
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    run(['pnpm', '--filter', '@media-tracker/api', 'exec', 'wrangler', 'r2', 'object', 'get',
         'media-tracker-raw/operations/operating-state.json', '--file', str(path), '--remote',
         '--config', str(configuration_path)])
    path.chmod(0o600)
    if path.stat().st_size > 65536:
        raise ReleaseError('Operating-state safety record exceeded size limit')
    value = json.loads(path.read_text())
    if value.get('version') != 1 or type(value.get('paused')) is not bool:
        raise ReleaseError('Operating-state safety record is invalid')
    return value


def verify_quiescence(state, queues, queue_names, now=None):
    now = now or datetime.now(timezone.utc)
    try:
        paused_at = datetime.fromisoformat(state.get('pausedAt', '').replace('Z', '+00:00'))
        elapsed = (now - paused_at).total_seconds()
    except (ValueError, TypeError):
        raise ReleaseError('Migration requires a recorded manual pause timestamp') from None
    if state.get('paused') is not True or state.get('reason') != 'manual' or elapsed < 20 * 60:
        raise ReleaseError('Migration requires a manual pause held for at least 20 minutes')
    found = {item['queue_name']: item for item in queues}
    if any(found.get(name, {}).get('settings', {}).get('delivery_paused') is not True for name in queue_names):
        raise ReleaseError('Migration requires native queue delivery paused')


def smoke(library=False):
    client_id = os.environ.get('CF_ACCESS_CLIENT_ID')
    client_secret = os.environ.get('CF_ACCESS_CLIENT_SECRET')
    if not client_id or not client_secret:
        raise ReleaseError('A dedicated read-only Access smoke identity is required')
    unauthenticated, _ = fetch(ORIGIN + '/api/health')
    if unauthenticated not in (302, 303, 401, 403):
        raise ReleaseError('Unauthenticated health request was not denied')
    status, payload = fetch(ORIGIN + '/api/health', {
        'CF-Access-Client-Id': client_id, 'CF-Access-Client-Secret': client_secret,
    })
    try:
        healthy = json.loads(payload)
    except ValueError:
        healthy = {}
    if status != 200 or healthy.get('status') != 'ok' or healthy.get('service') != 'media-tracker-api':
        raise ReleaseError('Authenticated production smoke failed')
    if library:
        headers = {'CF-Access-Client-Id': client_id, 'CF-Access-Client-Secret': client_secret}
        for family in ['books', 'movies', 'articles', 'podcasts', 'music', 'videos']:
            status, payload = fetch(ORIGIN + '/api/library/' + family + '/summary', headers)
            try:
                value = json.loads(payload)
                counts = value['counts' if family == 'books' else 'membershipCounts' if family == 'movies' else 'sectionCounts']
            except (ValueError, KeyError, TypeError):
                counts = None
            if status != 200 or not isinstance(counts, dict) or not counts or any(type(count) is not int or count < 0 for count in counts.values()):
                raise ReleaseError('Authenticated Library summary smoke failed')


ACTIVE_LEASE_SQL = "SELECT (SELECT count(*) FROM source_sync_lease WHERE expires_at>?) + (SELECT count(*) FROM catalog_refresh_jobs WHERE state='running' AND lease_expires_at>?) + (SELECT count(*) FROM spotify_catalog_backfill_jobs WHERE state='running' AND lease_expires_at>?) AS active"


def deploy(revision, migration_digest=None):
    verify_revision(revision)
    # Verify smoke credentials before touching any production state.
    smoke()
    configuration_text = os.environ.get('PRODUCTION_CONFIGURATION')
    if not configuration_text:
        raise ReleaseError('Protected PRODUCTION_CONFIGURATION is required')
    configuration = json.loads(configuration_text)
    account = configuration.get('account_id', '')
    if not re.fullmatch('[a-f0-9]{32}', account):
        raise ReleaseError('Invalid production account')
    database = configuration['d1_databases'][0]['database_id']
    live = management(account, '/workers/scripts/media-tracker/settings')
    queues = management(account, '/queues')
    verify_live(configuration, live, queues)
    verify_schedules(configuration, management(account, '/workers/scripts/media-tracker/schedules'))
    consumers = {queue['queue_id']: management(account, '/queues/' + queue['queue_id'] + '/consumers') for queue in queues}
    verify_consumers(configuration, queues, consumers)
    path = ROOT / 'apps/api/wrangler.production.jsonc'
    # Do not overwrite an operator's protected config in a local checkout.
    private_json(path, configuration)
    run(['pnpm', '--filter', '@media-tracker/cli', 'start', 'deployment', 'deploy', '--dry-run'])
    inventory = migration_inventory()
    state = management(account, '/d1/database/' + database + '/query',
                       {'sql': 'SELECT name FROM d1_migrations ORDER BY id'})
    applied = [row['name'] for row in state[0]['results']]
    pending = pending_migrations(inventory, applied)
    if pending and not migration_digest:
        raise ReleaseError('Pending migrations require the reviewed migration release workflow')
    if migration_digest and (not pending or migration_digest != inventory_digest(inventory)):
        raise ReleaseError('Reviewed migration digest does not match this revision')
    journal = ROOT / '.private/releases' / (datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + revision[:12] + '-' + uuid.uuid4().hex[:8])
    operating = read_operating_state(path, journal)
    if not operating['paused']:
        smoke(library=True)
    if pending:
        # The sticky application pause blocks writes; the native queue pause
        # stops new deliveries. Twenty minutes drains bounded in-flight workers.
        verify_quiescence(operating, queues, [item['queue'] for item in configuration['queues']['producers']])
        now = datetime.now(timezone.utc)
        leases = management(account, '/d1/database/' + database + '/query', {
            'sql': ACTIVE_LEASE_SQL,
            'params': [int(now.timestamp() * 1000), now.isoformat().replace('+00:00', 'Z'), now.isoformat().replace('+00:00', 'Z')],
        })
        if leases[0]['results'][0]['active'] != 0:
            raise ReleaseError('Migration requires all source and catalog leases drained')
    bookmark = management(account, '/d1/database/' + database + '/time_travel/bookmark')
    versions = management(account, '/workers/scripts/media-tracker/deployments')
    receipt = {'revision': revision, 'createdAt': datetime.now(timezone.utc).isoformat(),
               'bookmark': bookmark, 'previousDeployments': versions,
               'migrationDigest': inventory_digest(inventory), 'pendingMigrations': pending,
               'operatingState': operating, 'state': 'prepared'}
    record_phase(journal, receipt, 'prepared', path)
    verify_revision(revision)
    if pending:
        record_phase(journal, receipt, 'migration-starting', path)
        run(['pnpm', '--filter', '@media-tracker/api', 'exec', 'wrangler', 'd1', 'migrations', 'apply',
             'media-tracker', '--config', str(path), '--remote'])
        after = management(account, '/d1/database/' + database + '/query',
                           {'sql': 'SELECT name FROM d1_migrations ORDER BY id'})
        if pending_migrations(inventory, [row['name'] for row in after[0]['results']]):
            raise ReleaseError('Migration verification failed; production remains in maintenance')
        record_phase(journal, receipt, 'migration-verified', path)
    record_phase(journal, receipt, 'deploy-starting', path)
    run(['pnpm', '--filter', '@media-tracker/cli', 'start', 'deployment', 'deploy'])
    after = read_operating_state(path, journal / 'after')
    if operating['paused'] and (not after['paused'] or after.get('pausedAt') != operating.get('pausedAt')):
        raise ReleaseError('Production release did not preserve the emergency pause')
    if operating['paused']:
        current_queues = management(account, '/queues')
        protected = {item['queue_name'] for item in queues if item.get('settings', {}).get('delivery_paused') is True}
        if any(item['queue_name'] in protected and item.get('settings', {}).get('delivery_paused') is not True for item in current_queues):
            raise ReleaseError('Production release did not preserve native queue pause')
    receipt['operatingStateAfter'] = after
    smoke(library=not after['paused'])
    record_phase(journal, receipt, 'smoke-passed', path)
    # Do not automatically roll back: connected database/schema changes and data
    # are not reverted by a Worker rollback. Preserve the original recovery point.
    print('Exact-revision deployment and authenticated smoke passed. Recovery receipt retained locally and in private R2.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=['plan', 'smoke', 'deploy'])
    parser.add_argument('--revision')
    parser.add_argument('--migration-digest')
    args = parser.parse_args()
    try:
        if args.operation == 'plan':
            inventory = migration_inventory()
            print(json.dumps({'migrationDigest': inventory_digest(inventory), 'migrations': inventory}, indent=2))
        elif args.operation == 'smoke':
            smoke(library=True)
            print('Authenticated smoke and unauthenticated denial passed.')
        else:
            deploy(args.revision or '', args.migration_digest)
    except (ReleaseError, KeyError, ValueError, OSError) as error:
        # JSON decode exceptions can contain fragments of private config.
        message = str(error) if isinstance(error, ReleaseError) else type(error).__name__
        print('Release stopped: ' + message, file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    os.umask(0o077)
    sys.exit(main())
