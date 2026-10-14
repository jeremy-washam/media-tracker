#!/usr/bin/env python3
"""Ordered, resumable deployment transfer. Credentials and payloads stay private."""
import argparse
import base64
import concurrent.futures
import datetime
import fcntl
import hashlib
import json
import os
import re
from pathlib import Path
import sqlite3
import subprocess
import uuid
from email.utils import parsedate_to_datetime
import time
import urllib.error
import urllib.parse
import urllib.request

from snapshot import checksum, hash_row, identifier, literal, rows, vocabulary

RECEIPTS = 'imladris_deployment_receipts'
API = 'https://api.cloudflare.com/client/v4'
BUDGET = {'rows_read': 100_000_000, 'rows_written': 25_000_000}
CLEANUP_RESERVE = {'rows_read': 10_000_000, 'rows_written': 5_000_000}
HELPER = 'media-tracker-transfer'
VOCAB_PREFIX = 'imladris_transfer_vocab_'
REQUEST_INTERVAL = 1 / 3 + 0.001
NO_IMPORT = 'Not currently importing anything.'
RECONCILIATION_ATTEMPTS = 12
RECONCILIATION_DELAY = 5


class ImportStatusLost(RuntimeError):
    def __init__(self):
        super().__init__('D1 import status is unavailable; exact receipt and native usage reconciliation are required')


class ManagementError(RuntimeError):
    def __init__(self, status=None, codes=None):
        self.status = status
        super().__init__('Cloudflare management request failed (' + ('HTTP ' + str(status) if status is not None else 'codes ' + ','.join(codes or [])) + ')')


def write_json(path, value):
    temporary = path.with_suffix(path.suffix + '.tmp')
    with temporary.open('w') as stream:
        json.dump(value, stream, indent=2)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    temporary.chmod(0o600)
    temporary.replace(path)


def verify_bundle(directory):
    directory = directory.resolve()
    manifest_path = directory / 'manifest.json'
    manifest = json.loads(manifest_path.read_text())
    if manifest.get('version') != 2:
        raise ValueError('Transfer requires a version 2 bundle')
    backups = manifest.get('backups', {})
    for name in ('database.sqlite', 'r2-metadata.sqlite'):
        if backups.get(name, {}).get('path') != name or not isinstance(backups[name].get('bytes'), int):
            raise ValueError('Both physical backup hashes and sizes are required')
    files = [manifest['schema'], *manifest['data'], manifest['indexes']]
    if len({item['path'] for item in files}) != len(files):
        raise ValueError('Duplicate transfer paths')
    for item in [*backups.values(), *files, *manifest['objects'].values()]:
        path = (directory / item['path']).resolve()
        if directory not in path.parents or not path.is_file() or checksum(path) != item['sha256']:
            raise ValueError('Bundle path or checksum mismatch')
        if 'bytes' in item and path.stat().st_size != item['bytes']:
            raise ValueError('Bundle size mismatch')
    if RECEIPTS in manifest['tables'] or any(name.startswith(VOCAB_PREFIX) or name == 'imladris_transfer_vocab' for name in manifest['tables']):
        raise ValueError('Transfer bookkeeping collides with source schema')
    return manifest, checksum(manifest_path), files


class Cloudflare:
    def __init__(self, account, database, oauth_file):
        self.account = account
        self.database = database
        self.oauth_file = Path(oauth_file)
        self.usage = {'rows_read': 0, 'rows_written': 0}
        self.client = urllib.request.build_opener(NoRedirect)
        self.usage_path = None
        self.usage_state = None
        self.last_request = None

    def token(self):
        token = os.environ.get('CLOUDFLARE_API_TOKEN')
        if token:
            return token
        for line in self.oauth_file.read_text().splitlines():
            if line.strip().startswith('oauth_token ='):
                return json.loads(line.split('=', 1)[1].strip())
        raise ValueError('Wrangler OAuth credentials are missing')

    def configure_usage(self, path, bundle):
        target = {'account': self.account, 'database': self.database, 'bundle': bundle}
        self.usage_fresh = not path.exists()
        if self.usage_fresh and any((path.parent / name).exists() for name in ('d1-state.json', 'r2-complete.json', 'verification.json')):
            raise ValueError('Existing transfer checkpoints have no native usage history')
        state = json.loads(path.read_text()) if path.exists() else {'target': target, 'usage': {name: 0 for name in BUDGET}, 'imports': [], 'unmeasured': False}
        if state.get('target') != target or not isinstance(state.get('imports'), list) or type(state.get('unmeasured')) is not bool or any(not isinstance(value, str) for value in state['imports']) or len(set(state['imports'])) != len(state['imports']):
            raise ValueError('Native usage checkpoint target mismatch')
        if set(state.get('usage', {})) != set(BUDGET) or any(type(value) is not int or value < 0 for value in state['usage'].values()):
            raise ValueError('Invalid native usage checkpoint')
        self.usage_path, self.usage_state, self.usage = path, state, state['usage']
        write_json(path, state)
        self.check_budget()

    def check_budget(self):
        if self.usage_state is None:
            raise ValueError('Persistent native usage accounting is required')
        if self.usage_state.get('unmeasured') or self.usage_state.get('pendingQuery') or self.usage_state.get('pendingCleanupQueries'):
            raise RuntimeError('Native usage is uncertain; reconcile it before continuing')
        if any(self.usage[name] >= maximum - CLEANUP_RESERVE[name] for name, maximum in BUDGET.items()):
            raise RuntimeError('Native deployment usage budget exhausted')

    def unknown_usage(self):
        self.usage_state['unmeasured'] = True
        write_json(self.usage_path, self.usage_state)

    def account_usage(self, metadata, import_id=None, query_complete=False, cleanup=False):
        if import_id and import_id in self.usage_state['imports']:
            return
        if not isinstance(metadata, dict) or any(type(metadata.get(name)) is not int or metadata[name] < 0 for name in BUDGET):
            self.unknown_usage()
            raise RuntimeError('Native D1 usage metadata is missing; refusing unmeasured work')
        for name in BUDGET:
            self.usage[name] += metadata[name]
        if import_id:
            self.usage_state['imports'].append(import_id)
        if query_complete:
            if cleanup:
                self.usage_state['pendingCleanupQueries'] = [value for value in self.usage_state.get('pendingCleanupQueries', []) if value != query_complete]
            else:
                self.usage_state.pop('pendingQuery', None)
        write_json(self.usage_path, self.usage_state)
        if import_id:
            self.usage_fresh = False
        if not cleanup:
            self.check_budget()

    def pace(self):
        now = time.monotonic()
        if self.last_request is not None:
            time.sleep(max(0, REQUEST_INTERVAL - (now - self.last_request)))
        self.last_request = time.monotonic()

    def oauth_expired(self):
        if os.environ.get('CLOUDFLARE_API_TOKEN'):
            return False
        for line in self.oauth_file.read_text().splitlines():
            if line.strip().startswith('expiration_time ='):
                expiry = datetime.datetime.fromisoformat(json.loads(line.split('=', 1)[1].strip()).replace('Z', '+00:00'))
                return expiry <= datetime.datetime.now(datetime.timezone.utc)
        return False

    def refresh_oauth(self):
        result = subprocess.run(['pnpm', '--filter', '@media-tracker/api', 'exec', 'wrangler', 'whoami'],
            cwd=Path(__file__).resolve().parents[2], capture_output=True, timeout=120)
        if result.returncode or self.oauth_expired():
            raise RuntimeError('Wrangler OAuth refresh did not produce valid credentials')

    def request(self, method, path, body=None):
        data = None if body is None else json.dumps(body).encode()
        retries = 0
        refreshed = False
        while True:
            if not refreshed and self.oauth_expired():
                self.refresh_oauth()
                refreshed = True
            self.pace()
            url = API + '/graphql' if path == 'graphql' else API + '/accounts/' + self.account + '/' + path
            request = urllib.request.Request(url,
                data=data, method=method,
                headers={'Authorization': 'Bearer ' + self.token(), 'Content-Type': 'application/json'})
            try:
                with self.client.open(request, timeout=60) as response:
                    result = json.load(response)
            except urllib.error.HTTPError as error:
                if error.code == 401 and not refreshed and self.oauth_expired():
                    self.refresh_oauth()
                    refreshed = True
                    continue
                if error.code == 429 and retries < 3:
                    value = error.headers.get('Retry-After')
                    try:
                        delay = float(value) if value is not None else 2 ** retries
                    except ValueError:
                        delay = (parsedate_to_datetime(value) - datetime.datetime.now(datetime.timezone.utc)).total_seconds()
                    if delay > 60:
                        raise RuntimeError('Management API requires a longer rate-limit pause; resume later') from None
                    retries += 1
                    time.sleep(max(0, delay))
                    continue
                raise ManagementError(error.code) from None
            if path == 'graphql':
                if result.get('errors') or not isinstance(result.get('data'), dict):
                    raise RuntimeError('Native GraphQL usage request failed; inspect the private configuration')
                return result['data']
            if not result.get('success'):
                codes = [str(error.get('code')) for error in result.get('errors', [])]
                raise ManagementError(codes=codes)
            return result['result']

    def execute_query(self, sql, params=None, cleanup=False):
        if cleanup:
            journal = self.scratch_state()
            owned = {entry['name'] for entry in journal['owned']}
            allowed_lookup = sql == 'SELECT type,sql FROM sqlite_schema WHERE name=?' and params and len(params) == 1 and params[0] in owned
            allowed_drop = any(sql == 'DROP TABLE IF EXISTS ' + identifier(name) for name in owned)
            if not allowed_lookup and not allowed_drop:
                raise ValueError('Reserved cleanup permits only journal-owned table lookups and drops')
            self.check_cleanup_budget()
        else:
            self.check_budget()
        query_id = uuid.uuid4().hex
        if cleanup:
            if self.usage_state.get('pendingQuery') or self.usage_state.get('pendingCleanupQueries'):
                self.usage_state['unmeasured'] = True
            self.usage_state.setdefault('pendingCleanupQueries', []).append(query_id)
        else:
            self.usage_state['pendingQuery'] = {'kind': 'normal', 'id': query_id}
        write_json(self.usage_path, self.usage_state)
        try:
            result = self.request('POST', 'd1/database/' + self.database + '/query', {'sql': sql, 'params': params or []})
        except ManagementError as error:
            if error.status in (401, 403, 429):
                if cleanup:
                    self.usage_state['pendingCleanupQueries'].remove(query_id)
                else:
                    self.usage_state.pop('pendingQuery', None)
                write_json(self.usage_path, self.usage_state)
            else:
                self.unknown_usage()
            raise
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, UnicodeDecodeError):
            self.unknown_usage()
            raise RuntimeError('D1 response lost; native query usage must be reconciled') from None
        metadata = {name: 0 for name in BUDGET}
        if not isinstance(result, list) or not result:
            self.unknown_usage()
            raise RuntimeError('Native D1 query result is incomplete')
        for item in result:
            observed = item.get('meta', {})
            if any(type(observed.get(name)) is not int or observed[name] < 0 for name in BUDGET):
                self.unknown_usage()
                raise RuntimeError('Native D1 usage metadata is missing; refusing unmeasured work')
            for name in BUDGET:
                metadata[name] += observed[name]
        if cleanup:
            journal = self.scratch_state()
            for name in BUDGET:
                journal['cleanupUsage'][name] += metadata[name]
            write_json(self.scratch_path(), journal)
        self.account_usage(metadata, query_complete=query_id, cleanup=cleanup)
        if any(not item.get('success') for item in result):
            raise RuntimeError('D1 query failed')
        return result[0]['results']

    def query(self, sql, params=None):
        return self.execute_query(sql, params)

    def scratch_path(self):
        return self.usage_path.with_name('scratch.json')

    def scratch_state(self):
        path = self.scratch_path()
        state = json.loads(path.read_text()) if path.exists() else {'target': self.usage_state['target'], 'owned': [], 'cleanupUsage': {name: 0 for name in BUDGET}}
        if state.get('target') != self.usage_state['target'] or not isinstance(state.get('owned'), list) or len(state['owned']) > 2:
            raise ValueError('Scratch ownership checkpoint target mismatch')
        names = set()
        for item in state['owned']:
            name = item.get('name')
            if not isinstance(name, str) or not re.fullmatch(VOCAB_PREFIX + r'[a-f0-9]{32}(?:_rows)?', name) or name in names or not isinstance(item.get('sql'), str):
                raise ValueError('Invalid scratch ownership record')
            names.add(name)
        if set(state.get('cleanupUsage', {})) != set(BUDGET) or any(type(v) is not int or v < 0 for v in state['cleanupUsage'].values()):
            raise ValueError('Invalid cleanup usage checkpoint')
        return state

    def claim_scratch(self, definitions):
        self.check_budget()
        state = self.scratch_state()
        if state['owned']:
            raise ValueError('Recover owned scratch tables before creating another vocabulary')
        state['owned'] = [{'name': name, 'sql': sql} for name,sql in definitions.items()]
        state['cleanupUsage'] = {name: 0 for name in BUDGET}
        write_json(self.scratch_path(), state)
        self.scratch_state()

    def check_cleanup_budget(self):
        state = self.scratch_state()
        if len(self.usage_state.get('pendingCleanupQueries', [])) >= 8 or any(state['cleanupUsage'][name] >= CLEANUP_RESERVE[name] or self.usage[name] >= BUDGET[name] for name in BUDGET):
            raise RuntimeError('Reserved scratch cleanup budget exhausted; ownership remains journaled')

    def cleanup_scratch(self):
        state = self.scratch_state()
        for item in sorted(state['owned'], key=lambda x: not x['name'].endswith('_rows')):
            name = item['name']
            actual = self.execute_query('SELECT type,sql FROM sqlite_schema WHERE name=?', [name], cleanup=True)
            if actual:
                if actual != [{'type': 'table', 'sql': item['sql']}]:
                    raise ValueError('Journal-owned scratch definition differs; refusing to drop it')
                self.execute_query('DROP TABLE IF EXISTS ' + identifier(name), cleanup=True)
            state = self.scratch_state()
            state['owned'] = [entry for entry in state['owned'] if entry['name'] != name]
            write_json(self.scratch_path(), state)

    def import_recovery_budget(self):
        if self.usage_state is None or self.usage_state.get('pendingQuery') or self.usage_state.get('pendingCleanupQueries') or self.scratch_state()['owned']:
            raise ValueError('Import reconciliation refuses unrelated query or scratch uncertainty')
        if any(self.usage[name] >= BUDGET[name] - CLEANUP_RESERVE[name] for name in BUDGET):
            raise RuntimeError('Native deployment usage budget exhausted')
        failure = self.usage_state.get('importFailure', {})
        if failure.get('kind') == 'failed':
            raise ValueError('Confirmed import failure requires separate native usage reconciliation')

    def persist_import_error(self, response, import_id, kind):
        directory = self.usage_path.parent / 'import-errors'
        directory.mkdir(mode=0o700, exist_ok=True)
        record_id = uuid.uuid4().hex
        path = directory / (record_id + '.json')
        record = {'target':self.usage_state['target'], 'id':record_id, 'importId':import_id, 'kind':kind,
            'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(), 'response':response}
        write_json(path, record)
        self.usage_state['importFailure'] = {'id':record_id, 'importId':import_id, 'kind':kind,
            'path':str(path.relative_to(self.usage_path.parent)), 'sha256':checksum(path)}
        self.unknown_usage()

    def native_counters(self):
        now = datetime.datetime.now(datetime.timezone.utc)
        start = (now.date() - datetime.timedelta(days=29)).isoformat()
        end = now.date().isoformat()
        database = self.request('GET', 'd1/database/' + self.database)
        created = datetime.datetime.fromisoformat(database['created_at'].replace('Z','+00:00'))
        if database.get('uuid') != self.database or created.utcoffset() != datetime.timedelta(0) or not start <= created.date().isoformat() <= end:
            raise ValueError('Native usage range does not cover this exact database lifetime')
        query = 'query { viewer { accounts(filter:{accountTag:' + json.dumps(self.account) + '}) { d1AnalyticsAdaptiveGroups(limit:10000,filter:{date_geq:' + json.dumps(start) + ',date_leq:' + json.dumps(end) + ',databaseId:' + json.dumps(self.database) + '}) { sum {rowsRead rowsWritten readQueries writeQueries} dimensions {date databaseId} avg {sampleInterval} } } } }'
        data = self.request('POST', 'graphql', {'query':query})
        accounts = data.get('viewer', {}).get('accounts', [])
        if len(accounts) != 1 or not isinstance(accounts[0].get('d1AnalyticsAdaptiveGroups'), list):
            raise ValueError('Native usage response does not identify one filtered account')
        totals = {'rows_read':0,'rows_written':0,'readQueries':0,'writeQueries':0}
        seen = set()
        for group in accounts[0]['d1AnalyticsAdaptiveGroups']:
            dimension = group.get('dimensions', {})
            date = dimension.get('date')
            if dimension.get('databaseId') != self.database or not isinstance(date,str) or not start <= date <= end or date in seen:
                raise ValueError('Native usage group target or date differs from the requested range')
            if group.get('avg', {}).get('sampleInterval') != 1 or type(group['avg']['sampleInterval']) not in (int,float):
                raise ValueError('Native usage is sampled or lacks its sampling interval')
            seen.add(date)
            for name,field in [('rows_read','rowsRead'),('rows_written','rowsWritten'),('readQueries','readQueries'),('writeQueries','writeQueries')]:
                value = group.get('sum', {}).get(field)
                if type(value) not in (int,float) or value < 0 or value > 2**53-1 or int(value) != value:
                    raise ValueError('Native usage counters are not exact nonnegative integers')
                totals[name] += int(value)
        return {'target':self.usage_state['target'], 'start':start, 'end':end, 'databaseCreatedAt':database['created_at'],
            'fetchedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(), 'unsampled':True, 'totals':totals}

    def reconciliation_receipts(self, maximum):
        self.import_recovery_budget()
        diagnostics = self.usage_state.setdefault('importReconciliationDiagnostics', {'rows_read':0,'rows_written':0})
        sql = 'SELECT bundle,path,sha256 FROM ' + identifier(RECEIPTS) + ' LIMIT ' + str(maximum + 1)
        query_id = uuid.uuid4().hex
        self.usage_state['pendingQuery'] = {'kind':'import-reconciliation-read','id':query_id}
        write_json(self.usage_path,self.usage_state)
        try:
            result = self.request('POST','d1/database/' + self.database + '/query',{'sql':sql,'params':[]})
        except Exception:
            self.unknown_usage()
            raise RuntimeError('Import receipt proof response was lost; query usage must be reconciled separately') from None
        if not isinstance(result,list) or len(result) != 1 or not result[0].get('success'):
            self.unknown_usage()
            raise RuntimeError('Import receipt proof query failed')
        metadata = result[0].get('meta', {})
        if any(type(metadata.get(name)) is not int or metadata[name] < 0 for name in BUDGET) or metadata['rows_written'] != 0:
            self.unknown_usage()
            raise RuntimeError('Import receipt proof lacks exact read-only native usage metadata')
        for name in BUDGET:
            self.usage[name] += metadata[name]
            diagnostics[name] += metadata[name]
        self.usage_state.pop('pendingQuery',None)
        write_json(self.usage_path,self.usage_state)
        self.import_recovery_budget()
        return result[0]['results']

    def reconcile_import_status(self, pending, directory, bundle, files, extra_reads):
        self.import_recovery_budget()
        if type(extra_reads) is not int or not 0 <= extra_reads <= CLEANUP_RESERVE['rows_read']:
            raise ValueError('Declare a bounded conservative diagnostic read charge')
        item = next((item for item in files if item['path'] == pending.get('path')), None)
        if item is None or pending.get('sha256') != item['sha256'] or hashlib.md5(prepared_sql(directory,bundle,item,item is files[0])).hexdigest() != pending.get('importId') or self.usage_state['target'] != {'account':self.account,'database':self.database,'bundle':bundle}:
            raise ValueError('Pending reconciliation target or prepared payload identity differs')
        if pending['importId'] in self.usage_state['imports']:
            raise ValueError('Pending import usage is already accounted')
        failure = self.usage_state.get('importFailure', {})
        if failure.get('kind') != 'status-lost' or failure.get('importId') != pending['importId']:
            raise ValueError('Only the exact pending no-active-import status may be reconciled')
        error_path = (self.usage_path.parent / failure['path']).resolve()
        if self.usage_path.parent.resolve() not in error_path.parents or checksum(error_path) != failure['sha256']:
            raise ValueError('Private import status diagnostic differs')
        diagnostic = json.loads(error_path.read_text())
        if diagnostic.get('target') != self.usage_state['target'] or diagnostic.get('importId') != pending['importId'] or diagnostic.get('id') != failure['id'] or diagnostic.get('kind') != 'status-lost' or diagnostic.get('response',{}).get('error') != NO_IMPORT or diagnostic['response'].get('success') is not False or diagnostic['response'].get('status') is not None:
            raise ValueError('Private diagnostic does not prove the exact lost import status')
        declared = self.usage_state.setdefault('importReconciliationExtraReads', {})
        if pending['importId'] in declared and declared[pending['importId']] != extra_reads:
            raise ValueError('Previously declared diagnostic charge differs for this pending import')
        if pending['importId'] not in declared:
            declared[pending['importId']] = extra_reads
            diagnostics = self.usage_state.setdefault('importReconciliationDiagnostics', {'rows_read':0,'rows_written':0})
            diagnostics['rows_read'] += extra_reads
            self.usage['rows_read'] += extra_reads
            write_json(self.usage_path,self.usage_state)
        records = self.reconciliation_receipts(len(files))
        expected = {item['path']:item['sha256'] for item in files}
        known = {record['path']:record['sha256'] for record in records}
        if len(known) != len(records) or any(record.get('bundle') != bundle or expected.get(record['path']) != record['sha256'] for record in records):
            raise ValueError('Import reconciliation receipt target or payload differs')
        if known.get(pending['path']) != pending['sha256'] or set(known) != {item['path'] for item in files[:len(known)]}:
            raise ValueError('Exact pending receipt and ordered completed prefix are required')
        for number,item in enumerate(files[:len(known)]):
            import_id = hashlib.md5(prepared_sql(directory,bundle,item,number == 0)).hexdigest()
            if import_id != pending['importId'] and import_id not in self.usage_state['imports']:
                raise ValueError('Another completed import has unresolved usage')
        recorded = dict(self.usage)
        for attempt in range(RECONCILIATION_ATTEMPTS):
            snapshot = self.native_counters()
            if snapshot.get('target') != self.usage_state['target'] or snapshot.get('unsampled') is not True:
                raise ValueError('Native counter snapshot target or precision differs')
            totals = snapshot['totals']
            if totals['writeQueries'] > len(known):
                raise ValueError('Unrelated writes invalidate dedicated-target import telemetry')
            if totals['writeQueries'] == len(known) and all(totals[name] >= recorded[name] for name in BUDGET):
                break
            if attempt + 1 == RECONCILIATION_ATTEMPTS:
                raise RuntimeError('Native import telemetry is still lagging; no reconciliation was accepted')
            time.sleep(RECONCILIATION_DELAY)
        diagnostics = dict(self.usage_state['importReconciliationDiagnostics'])
        adopted = {name:totals[name] + diagnostics[name] for name in BUDGET}
        if any(adopted[name] >= BUDGET[name] - CLEANUP_RESERVE[name] for name in BUDGET):
            raise RuntimeError('Reconciled native deployment usage budget is exhausted')
        proof = {'target':self.usage_state['target'], 'importId':pending['importId'], 'path':pending['path'],'sha256':pending['sha256'],
            'diagnostic':failure,'receiptCount':len(known),'recordedBefore':recorded,'diagnosticCharges':diagnostics,'nativeSnapshot':snapshot,'adoptedUsage':adopted}
        self.usage.update(adopted)
        self.usage_state['imports'].append(pending['importId'])
        self.usage_state.setdefault('importReconciliations',[]).append(proof)
        self.usage_state['unmeasured'] = False
        self.usage_state.pop('importFailure',None)
        write_json(self.usage_path,self.usage_state)
        self.usage_fresh = False
        self.check_budget()

    def poll_import(self, result, progress, import_id):
        endpoint = 'd1/database/' + self.database + '/import'
        for _ in range(600):
            if not result.get('success', True) or result.get('status') == 'error':
                lost = result.get('success') is False and result.get('error') == NO_IMPORT and result.get('status') is None
                self.persist_import_error(result,import_id,'status-lost' if lost else 'failed')
                if lost:
                    raise ImportStatusLost()
                raise RuntimeError('D1 import failed; private diagnostic saved and native usage remains uncertain')
            if result.get('status') == 'complete':
                self.account_usage(result.get('result', {}).get('meta'), import_id)
                return result.get('result', {})
            bookmark = result.get('at_bookmark')
            if not isinstance(bookmark, str) or not bookmark:
                raise RuntimeError('D1 import returned no progress bookmark')
            progress(bookmark)
            time.sleep(0.5)
            result = self.request('POST', endpoint, {'action': 'poll', 'current_bookmark': bookmark})
        raise RuntimeError('D1 import still pending; resume rather than assuming completion')

    def resume_import(self, bookmark, progress, import_id, recovery=False):
        if recovery:
            self.import_recovery_budget()
        else:
            self.check_budget()
        result = self.request('POST', 'd1/database/' + self.database + '/import', {'action': 'poll', 'current_bookmark': bookmark})
        return self.poll_import(result, progress, import_id)

    def import_file(self, path, progress):
        self.check_budget()
        etag = hashlib.md5(path.read_bytes()).hexdigest()
        endpoint = 'd1/database/' + self.database + '/import'
        result = self.request('POST', endpoint, {'action': 'init', 'etag': etag})
        if 'upload_url' in result:
            url = urllib.parse.urlparse(result['upload_url'])
            if url.scheme != 'https' or url.username or url.password or url.port or not (url.hostname or '').endswith('.r2.cloudflarestorage.com'):
                raise RuntimeError('Unexpected D1 upload endpoint')
            with path.open('rb') as body:
                request = urllib.request.Request(result['upload_url'], data=body, method='PUT',
                    headers={'Content-Length': str(path.stat().st_size)})
                with self.client.open(request, timeout=120) as response:
                    if response.headers.get('ETag', '').strip('"') != etag:
                        raise RuntimeError('D1 upload checksum mismatch')
            result = self.request('POST', endpoint, {'action': 'ingest', 'filename': result['filename'], 'etag': etag})
        return self.poll_import(result, progress, etag)

    def guard_r2(self, resources, settings, attestation=None):
        subdomain = self.request('GET', 'workers/subdomain')['subdomain']
        if not isinstance(subdomain, str) or not subdomain or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in subdomain):
            raise ValueError('Unexpected account Workers subdomain')
        expected_url = 'https://' + HELPER + '.' + subdomain + '.workers.dev'
        validate_r2_url(settings['url'], expected_url)
        worker = self.request('GET', 'workers/scripts/' + HELPER + '/settings')
        buckets = [b for b in worker['bindings'] if b['name'] == 'RAW_BUCKET']
        secrets = [b for b in worker['bindings'] if b['name'] == 'TRANSFER_SECRET']
        if len(buckets) != 1 or buckets[0].get('type') != 'r2_bucket' or buckets[0].get('bucket_name') != resources['bucket'] or len(secrets) != 1 or secrets[0].get('type') != 'secret_text':
            raise ValueError('Temporary transfer Worker bindings differ from the verified target')
        domain = self.request('GET', 'workers/scripts/' + HELPER + '/subdomain')
        if domain.get('enabled') is not True or domain.get('previews_enabled') is not False:
            raise ValueError('Temporary transfer Worker endpoint or preview configuration is unsafe')
        helper = access_application(self, resources['transferAccessApplicationId'], attestation, 'helperApplication')
        if helper.get('id') != resources['transferAccessApplicationId'] or helper.get('domain') != urllib.parse.urlsplit(expected_url).hostname:
            raise ValueError('Helper Access application identity differs from the pinned Worker')
        policies = helper.get('policies', [])
        if len(policies) != 1 or policies[0].get('decision') != 'non_identity' or policies[0].get('include') != [{'service_token': {'token_id': settings.get('serviceTokenId')}}] or not settings.get('serviceTokenId'):
            raise ValueError('Helper Access policy differs from the specified service token')
        return expected_url

    def guard(self, resources, attestation=None):
        if not resources.get('ownerAccessVerified'):
            raise ValueError('Owner-authenticated Access confirmation is required')
        if resources['databaseId'] != self.database or resources['accountId'] != self.account:
            raise ValueError('Transfer target mismatch')
        settings = self.request('GET', 'workers/scripts/media-tracker/settings')
        variables = {b['name']: b.get('text') for b in settings['bindings'] if b['type'] == 'plain_text'}
        if variables.get('AUTH_MODE') != 'access' or any(variables.get(k) != 'false' for k in ('SYNC_ENABLED', 'MAINTENANCE_ENABLED', 'CATALOG_AUTO_REFRESH')):
            raise ValueError('Production must remain authenticated and paused')
        bindings = {b['name']: b for b in settings['bindings']}
        if bindings['DB'].get('id') != self.database or bindings['RAW_BUCKET'].get('bucket_name') != resources['bucket']:
            raise ValueError('Worker storage bindings differ from the transfer target')
        if self.request('GET', 'workers/scripts/media-tracker/schedules')['schedules']:
            raise ValueError('Production has an active cron')
        for key in ('syncQueueId', 'deadLetterQueueId'):
            if self.request('GET', 'queues/' + resources[key] + '/consumers'):
                raise ValueError('Production has an active queue consumer')
        if self.request('GET', 'r2/buckets/' + resources['bucket'] + '/domains/managed')['enabled']:
            raise ValueError('R2 public access is enabled')
        domains = self.request('GET', 'r2/buckets/' + resources['bucket'] + '/domains/custom')
        if domains.get('domains'):
            raise ValueError('R2 has custom public domains')
        if variables.get('OWNER_EMAIL') != resources['ownerEmail'] or not variables.get('ACCESS_AUD'):
            raise ValueError('Worker Access identity differs from the verified owner')
        if attestation is not None:
            validate_access_attestation(attestation, resources, variables['ACCESS_AUD'])
        app = access_application(self, resources['accessApplicationId'], attestation, 'application')
        if app.get('id') != resources['accessApplicationId'] or app.get('aud') != variables['ACCESS_AUD'] or app['domain'] != resources['hostname'] or not mfa_enabled(app):
            raise ValueError('Production Access or MFA differs from the verified setup')
        policies = app.get('policies', [])
        if len(policies) != 1 or policies[0]['decision'] != 'allow' or policies[0]['include'] != [{'email': {'email': resources['ownerEmail']}}] or not mfa_enabled(policies[0]):
            raise ValueError('Unexpected production Access policy')


def mfa_enabled(value):
    config = value.get('mfa_config', {})
    authenticators = config.get('allowed_authenticators', [])
    return config.get('mfa_disabled') is False and isinstance(authenticators, list) and bool(authenticators) and set(authenticators) <= {'totp', 'biometrics', 'security_key'}


def validate_access_attestation(attestation, resources, audience):
    bindings = {'accountId': resources['accountId'], 'applicationId': resources['accessApplicationId'],
        'audience': audience, 'ownerEmail': resources['ownerEmail'], 'hostname': resources['hostname']}
    if attestation.get('version') != 1 or any(attestation.get(key) != value for key,value in bindings.items()):
        raise ValueError('Access attestation identity mismatch')
    issued = datetime.datetime.fromisoformat(attestation['issuedAt'].replace('Z', '+00:00'))
    expires = datetime.datetime.fromisoformat(attestation['expiresAt'].replace('Z', '+00:00'))
    now = datetime.datetime.now(datetime.timezone.utc)
    if issued.utcoffset() != datetime.timedelta(0) or expires.utcoffset() != datetime.timedelta(0) or not issued <= now < expires or not datetime.timedelta(0) < expires-issued <= datetime.timedelta(minutes=15):
        raise ValueError('Access attestation is expired or exceeds its short-lived validity window')


def access_application(remote, application_id, attestation, field):
    if attestation is None:
        return remote.request('GET', 'access/apps/' + application_id)
    application = attestation.get(field)
    if not isinstance(application, dict):
        raise ValueError('Access attestation is missing the required application')
    return application


def prepared_sql(directory, bundle, item, first):
    path, digest = item['path'], item['sha256']
    payload = (directory / path).read_bytes()
    if hashlib.sha256(payload).hexdigest() != digest:
        raise ValueError('Transfer payload changed after validation')
    schema = ('CREATE TABLE ' + identifier(RECEIPTS) + '(bundle TEXT NOT NULL,path TEXT PRIMARY KEY,sha256 TEXT NOT NULL);\n') if first else ''
    receipt = 'INSERT INTO ' + identifier(RECEIPTS) + '(bundle,path,sha256) VALUES(' + ','.join(literal(x) for x in (bundle, path, digest)) + ');\n'
    return schema.encode() + payload + receipt.encode()


def require_usage_history(remote, known, directory, bundle, files):
    usage = getattr(remote, 'usage_state', None)
    if not known or usage is None:
        return
    for number,item in enumerate(files):
        if item['path'] not in known:
            continue
        import_id = hashlib.md5(prepared_sql(directory, bundle, item, number == 0)).hexdigest()
        if import_id not in usage['imports']:
            remote.unknown_usage()
            raise ValueError('Existing remote imports have no accounted native usage history')



def remote_receipts(remote, bundle):
    exists = remote.query('SELECT name FROM sqlite_schema WHERE type=\'table\' AND name=?', [RECEIPTS])
    if not exists:
        ordinary = remote.query("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT GLOB '_cf_*' AND name NOT GLOB 'sqlite_*'")
        if ordinary:
            raise ValueError('Remote database is nonempty without transfer receipts')
        return {}
    records = remote.query('SELECT bundle,path,sha256 FROM ' + identifier(RECEIPTS))
    if any(item['bundle'] != bundle for item in records):
        raise ValueError('Remote database belongs to a different bundle')
    return {item['path']: item['sha256'] for item in records}


def transfer_d1(directory, manifest, bundle, files, remote, state_path, reconcile_import_status=False, reconciliation_extra_reads=0):
    target = {'account': remote.account, 'database': remote.database, 'bundle': bundle}
    state = json.loads(state_path.read_text()) if state_path.exists() else {'target': target, 'completed': {}}
    if state.get('target') != target:
        raise ValueError('Local transfer checkpoint target mismatch')
    expected = {item['path']: item['sha256'] for item in files}
    pending = state.get('pending')
    if pending is not None:
        if not isinstance(pending, dict) or expected.get(pending.get('path')) != pending.get('sha256'):
            raise ValueError('Invalid pending import checkpoint')
        accounted = pending.get('importId') in getattr(remote,'usage_state',{}).get('imports',[]) if getattr(remote,'usage_state',None) is not None else False
        if 'bookmark' in pending and not accounted:
            if not isinstance(pending['bookmark'], str) or not pending['bookmark'] or not isinstance(pending.get('importId'), str):
                raise ValueError('Invalid pending import bookmark identity')
            item = next(item for item in files if item['path'] == pending['path'])
            payload = prepared_sql(directory, bundle, item, item is files[0])
            if hashlib.md5(payload).hexdigest() != pending['importId']:
                raise ValueError('Pending import payload differs from its checkpoint')
            def progress(bookmark):
                state['pending']['bookmark'] = bookmark
                write_json(state_path, state)
            try:
                if reconcile_import_status:
                    remote.resume_import(pending['bookmark'], progress, pending['importId'], recovery=True)
                else:
                    remote.resume_import(pending['bookmark'], progress, pending['importId'])
            except ImportStatusLost:
                if not reconcile_import_status:
                    raise
                remote.reconcile_import_status(pending,directory,bundle,files,reconciliation_extra_reads)
    known = remote_receipts(remote, bundle)
    if any(expected.get(path) != digest for path, digest in known.items()):
        raise ValueError('Unexpected or changed remote transfer receipt')
    require_usage_history(remote, known, directory, bundle, files)
    prefix = True
    for item in files:
        done = item['path'] in known
        if done and not prefix:
            raise ValueError('Remote receipts are not an ordered prefix')
        if not done:
            prefix = False
    for number, item in enumerate(files):
        path, digest = item['path'], item['sha256']
        if path in known:
            state['completed'][path] = digest
            if state.get('pending', {}).get('path') == path:
                state.pop('pending', None)
            write_json(state_path, state)
            continue
        if checksum(directory / path) != digest:
            raise ValueError('Transfer payload changed after validation')
        prepared = state_path.parent / 'pending.sql'
        prepared.write_bytes(prepared_sql(directory, bundle, item, number == 0))
        prepared.chmod(0o600)
        state['pending'] = {'path': path, 'sha256': digest, 'importId': hashlib.md5(prepared.read_bytes()).hexdigest()}
        write_json(state_path, state)
        def progress(bookmark):
            state['pending']['bookmark'] = bookmark
            write_json(state_path, state)
        try:
            remote.import_file(prepared, progress)
        except ImportStatusLost:
            if not reconcile_import_status:
                raise
            remote.reconcile_import_status(state['pending'],directory,bundle,files,reconciliation_extra_reads)
        proof = remote.query('SELECT sha256 FROM ' + identifier(RECEIPTS) + ' WHERE bundle=? AND path=?', [bundle, path])
        if proof != [{'sha256': digest}]:
            raise RuntimeError('Remote import receipt not confirmed')
        state['completed'][path] = digest
        state.pop('pending', None)
        write_json(state_path, state)
        print(json.dumps({'d1Files': number + 1, 'total': len(files), 'usage': remote.usage}), flush=True)
    prepared = state_path.parent / 'pending.sql'
    if prepared.exists():
        prepared.unlink()
    return state


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


def validate_r2_url(url, expected):
    parsed = urllib.parse.urlsplit(url)
    if url != expected or parsed.scheme != 'https' or parsed.username or parsed.password or parsed.port or parsed.path or parsed.query or parsed.fragment:
        raise ValueError('Transfer endpoint differs from the pinned account Worker URL')


class R2Transfer:
    def __init__(self, settings, expected_url):
        self.settings = settings
        self.client = urllib.request.build_opener(NoRedirect)
        validate_r2_url(settings['url'], expected_url)

    def request(self, route, key, metadata=None, path=None):
        headers = {'User-Agent': 'Mozilla/5.0 ImladrisPrivateTransfer/1.0', 'CF-Access-Client-Id': self.settings['clientId'], 'CF-Access-Client-Secret': self.settings['clientSecret'],
            'Authorization': 'Bearer ' + self.settings['bearer']}
        stream = None
        if path is not None:
            stream = path.open('rb')
            body = stream
            headers['Content-Length'] = str(path.stat().st_size)
            headers['X-Transfer-Metadata'] = base64.b64encode(json.dumps({'key': key, **metadata}, separators=(',', ':')).encode()).decode()
        else:
            body = json.dumps({'key': key}).encode()
            headers['Content-Type'] = 'application/json'
        request = urllib.request.Request(self.settings['url'] + route, data=body, method='POST', headers=headers)
        try:
            response = self.client.open(request, timeout=180)
            if route == '/get':
                return response
            with response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code == 404 and route == '/head':
                return None
            raise RuntimeError('Private R2 transfer failed (HTTP ' + str(error.code) + ')') from None
        finally:
            if stream:
                stream.close()

    def matches(self, actual, expected):
        return actual is not None and actual.get('size') == expected['bytes'] and actual.get('sha256') == expected['sha256'] and actual.get('httpMetadata', {}) == expected['httpMetadata'] and actual.get('customMetadata', {}) == expected['customMetadata']

    def copy(self, directory, key, expected):
        actual = self.request('/head', key)
        if actual is not None:
            if not self.matches(actual, expected):
                raise ValueError('Existing remote R2 object differs; refusing to overwrite')
            return
        path = directory / expected['path']
        if checksum(path) != expected['sha256']:
            raise ValueError('R2 payload changed after validation')
        actual = self.request('/put', key, expected, path)
        if not self.matches(actual, expected):
            raise RuntimeError('R2 upload checksum or metadata confirmation failed')
        if not self.matches(self.request('/head', key), expected):
            raise RuntimeError('Independent R2 metadata/checksum read failed')


def transfer_r2(directory, manifest, r2, workers=4):
    completed = 0
    def copy(item):
        key, expected = item
        r2.copy(directory, key, expected)
    pool = concurrent.futures.ThreadPoolExecutor(max_workers=workers)
    pending = set()
    items = iter(manifest['objects'].items())
    try:
        for _ in range(workers):
            item = next(items, None)
            if item is not None:
                pending.add(pool.submit(copy, item))
        while pending:
            done, pending = concurrent.futures.wait(pending, return_when=concurrent.futures.FIRST_COMPLETED)
            for future in done:
                future.result()
                completed += 1
                item = next(items, None)
                if item is not None:
                    pending.add(pool.submit(copy, item))
                if completed % 250 == 0 or completed == len(manifest['objects']):
                    print(json.dumps({'r2Objects': completed, 'total': len(manifest['objects'])}), flush=True)
    finally:
        for future in pending:
            future.cancel()
        pool.shutdown(wait=True, cancel_futures=True)
    return completed


def typed_value(value):
    kind, data = json.loads(value)
    if kind == 'blob':
        return bytes.fromhex(data)
    if kind == 'null':
        return None
    if kind == 'real':
        return float(data)
    if kind == 'integer':
        return int(data)
    if kind == 'text':
        return bytes.fromhex(data).decode('utf8')
    raise ValueError('Unexpected SQLite value type')


def copy_remote_table(remote, local, name, virtual=False, contentless=False):
    info = local.execute('PRAGMA table_info(' + identifier(name) + ')').fetchall()
    columns = ['rowid'] + [r[1] for r in info] if virtual else [r[1] for r in info]
    if contentless:
        columns = ['rowid']
    without_rowid = bool(local.execute('SELECT wr FROM pragma_table_list WHERE name=?', (name,)).fetchone()[0])
    keys = [r[1] for r in sorted(info, key=lambda r: r[5]) if r[5]] if without_rowid else ['_rowid_']
    selected = ','.join('json_array(typeof(' + identifier(c) + '),CASE WHEN typeof(' + identifier(c) + ") IN ('blob','text') THEN hex(" + identifier(c) + ") WHEN typeof(" + identifier(c) + ")='real' THEN printf('%!.26g'," + identifier(c) + ') ELSE ' + identifier(c) + ' END) AS ' + identifier(c) for c in columns)
    extras = ','.join('CAST(' + identifier(k) + ' AS TEXT) AS ' + identifier('__scan_' + str(i)) for i, k in enumerate(keys))
    order = ','.join('__source.' + identifier(k) for k in keys)
    previous = None
    count = 0
    while True:
        where = '' if previous is None else (' WHERE (' + order + ')>(' + ','.join('?' for _ in keys) + ')')
        result = remote.query('SELECT ' + selected + ',' + extras + ' FROM ' + identifier(name) + ' AS __source' + where + ' ORDER BY ' + order + ' LIMIT 500', previous)
        if not result:
            break
        if contentless:
            local.executemany('INSERT INTO ' + identifier(name) + '(rowid,content) VALUES(?,NULL)', [(typed_value(r['rowid']),) for r in result])
        else:
            local.executemany('INSERT INTO ' + identifier(name) + '(' + ','.join(identifier(c) for c in columns) + ') VALUES(' + ','.join('?' for _ in columns) + ')', [tuple(typed_value(r[c]) for c in columns) for r in result])
        previous = [result[-1]['__scan_' + str(i)] for i in range(len(keys))]
        count += len(result)
    local.commit()
    return count


def restore_contentless_search(db, name, expected, definition):
    if 'content' not in [r[1] for r in db.execute('PRAGMA table_info(' + identifier(name) + ')')]:
        raise ValueError('Unsupported contentless search column')
    db.execute('CREATE TABLE temp.contentless_rowids(rowid INTEGER PRIMARY KEY)')
    try:
        db.execute('INSERT INTO temp.contentless_rowids SELECT rowid FROM ' + identifier(name))
        db.execute('CREATE INDEX temp.remote_vocab_doc_idx ON remote_vocab(doc,col,offset,term)')
        db.execute('DROP TABLE ' + identifier(name))
        db.execute(definition)
        for rowid, in db.execute('SELECT rowid FROM temp.contentless_rowids ORDER BY rowid'):
            tokens = []
            for term,column,offset in db.execute('SELECT term,col,offset FROM temp.remote_vocab WHERE doc=? ORDER BY col,offset,term', (rowid,)):
                if column != 'content' or offset != len(tokens):
                    raise ValueError('Unsupported contentless index token positions')
                tokens.append(term)
            db.execute('INSERT INTO ' + identifier(name) + '(rowid,content) VALUES(?,?)', (rowid, ' '.join(tokens)))
        digest = hashlib.sha256()
        for row in db.execute('SELECT rowid FROM ' + identifier(name) + ' ORDER BY rowid'):
            hash_row(digest, row)
        if digest.hexdigest() != expected['sha256'] or vocabulary(db, name) != expected['vocabularySha256']:
            raise ValueError('Reconstructed contentless search differs from the remote fingerprint')
    finally:
        db.execute('DROP TABLE IF EXISTS temp.contentless_rowids')


def verify_remote(directory, manifest, remote, output):
    if output.exists():
        raise ValueError('Verification target already exists; choose a fresh output')
    partial = output.with_suffix(output.suffix + '.partial')
    if partial.exists():
        raise ValueError('Incomplete verification output exists; remove it deliberately before retrying')
    bundle = checksum(directory / 'manifest.json')
    files = [manifest['schema'], *manifest['data'], manifest['indexes']]
    receipts = remote_receipts(remote, bundle)
    if receipts != {item['path']: item['sha256'] for item in files}:
        raise ValueError('Complete matching remote transfer receipts are required for verification')
    require_usage_history(remote, receipts, directory, bundle, files)
    if hasattr(remote, 'cleanup_scratch'):
        remote.cleanup_scratch()
    db = sqlite3.connect(partial)
    success = False
    try:
        db.execute('PRAGMA foreign_keys=ON')
        db.executescript((directory / manifest['schema']['path']).read_bytes().decode('utf8'))
        definitions = sqlite3.connect(':memory:')
        try:
            definitions.executescript((directory / manifest['schema']['path']).read_bytes().decode('utf8'))
            definitions.executescript((directory / manifest['indexes']['path']).read_bytes().decode('utf8'))
            shadows = {r[1] for r in definitions.execute('PRAGMA table_list') if r[2] == 'shadow'}
            expected_schema = {(r[0],r[1],r[2]):r[3] for r in definitions.execute("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL") if not r[1].startswith(('sqlite_', '_cf_', '_mf_')) and r[1] not in shadows}
        finally:
            definitions.close()
        actual_schema = {(r['type'],r['name'],r['tbl_name']):r['sql'] for r in remote.query("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL") if r['name'] != RECEIPTS and not r['name'].startswith(('sqlite_', '_cf_', '_mf_')) and r['name'] not in shadows}
        if actual_schema != expected_schema:
            raise ValueError('Remote application schema, indexes, views or triggers differ')
        for name, expected in manifest['tables'].items():
            count = copy_remote_table(remote, db, name, expected['virtual'], expected.get('contentless', False))
            if count != expected['count']:
                raise ValueError('Remote table count differs: ' + name)
            digest = hashlib.sha256()
            records = db.execute('SELECT rowid FROM article_content_search ORDER BY rowid') if expected.get('contentless') else rows(db, name, expected['virtual'])[1]
            for row in records:
                hash_row(digest, row)
            if digest.hexdigest() != expected['sha256']:
                raise ValueError('Remote table fingerprint differs: ' + name)
            print(json.dumps({'tableVerified': name, 'rows': count, 'usage': remote.usage}), flush=True)
        db.executescript((directory / manifest['indexes']['path']).read_bytes().decode('utf8'))
        for name, expected in manifest.get('views', {}).items():
            digest = hashlib.sha256()
            for row in rows(db, name, view=True)[1]:
                hash_row(digest, row)
            if digest.hexdigest() != expected['sha256']:
                raise ValueError('Remote compatibility view differs')
        if remote.query('PRAGMA foreign_key_check'):
            raise ValueError('Remote foreign-key integrity failed')
        if remote.query('PRAGMA quick_check') != [{'quick_check': 'ok'}]:
            raise ValueError('Remote integrity failed')
        sequences = remote.query('SELECT name,CAST(seq AS TEXT) AS seq FROM sqlite_sequence ORDER BY name') if remote.query("SELECT name FROM sqlite_schema WHERE name='sqlite_sequence'") else []
        if [(x['name'],int(x['seq'])) for x in sequences] != [tuple(x) for x in manifest['sequences']]:
            raise ValueError('Remote sequence state differs')
        # FTS terms require an independent remotely-derived vocabulary check.
        for name, expected in manifest['tables'].items():
            if not expected['virtual']:
                continue
            scratch = VOCAB_PREFIX + uuid.uuid4().hex
            staging = scratch + '_rows'
            definitions = {scratch: 'CREATE VIRTUAL TABLE ' + identifier(scratch) + ' USING fts5vocab(' + literal(name) + ",'instance')", staging: 'CREATE TABLE ' + identifier(staging) + '(term TEXT NOT NULL,doc INTEGER NOT NULL,col TEXT NOT NULL,offset INTEGER NOT NULL,PRIMARY KEY(term,doc,col,offset)) WITHOUT ROWID'}
            if hasattr(remote, 'claim_scratch'):
                remote.claim_scratch(definitions)
            try:
                for definition in definitions.values():
                    remote.query(definition)
                instances = remote.query('SELECT COUNT(*) AS n FROM ' + identifier(scratch))[0]['n']
                if type(instances) is not int or instances < 0 or instances >= BUDGET['rows_written'] - CLEANUP_RESERVE['rows_written'] - remote.usage['rows_written'] or instances >= CLEANUP_RESERVE['rows_written'] - 1000:
                    raise RuntimeError('Insufficient native write budget for vocabulary staging')
                remote.query('INSERT INTO ' + identifier(staging) + ' SELECT term,CAST(doc AS INTEGER),col,CAST(offset AS INTEGER) FROM ' + identifier(scratch))
                db.execute('CREATE TABLE temp.remote_vocab(term TEXT,doc INTEGER,col TEXT,offset INTEGER)')
                previous = None
                while True:
                    sql = 'SELECT v.term,CAST(v.doc AS TEXT) AS doc,v.col,CAST(v.offset AS TEXT) AS offset FROM ' + identifier(staging) + ' AS v'
                    params = []
                    if previous:
                        sql += ' WHERE (v.term,v.doc,v.col,v.offset)>(?,?,?,?)'
                        params = previous
                    result = remote.query(sql + ' ORDER BY v.term,v.doc,v.col,v.offset LIMIT 2000', params)
                    if not result:
                        break
                    db.executemany('INSERT INTO temp.remote_vocab VALUES(?,?,?,?)', [(r['term'],int(r['doc']),r['col'],int(r['offset'])) for r in result])
                    r = result[-1]
                    previous = [r['term'],int(r['doc']),r['col'],int(r['offset'])]
                digest = hashlib.sha256()
                for row in db.execute('SELECT term,doc,col,offset FROM temp.remote_vocab ORDER BY doc,col,offset,term'):
                    hash_row(digest, row)
                if digest.hexdigest() != expected['vocabularySha256']:
                    raise ValueError('Remote search vocabulary differs: ' + name)
                if expected.get('contentless'):
                    restore_contentless_search(db, name, expected, expected_schema[('table', name, name)])
            finally:
                try:
                    if hasattr(remote, 'cleanup_scratch'):
                        remote.cleanup_scratch()
                    else:
                        try:
                            remote.query('DROP TABLE IF EXISTS ' + identifier(staging))
                        finally:
                            remote.query('DROP TABLE IF EXISTS ' + identifier(scratch))
                finally:
                    db.execute('DROP TABLE IF EXISTS temp.remote_vocab')
        local_schema = {(r[0],r[1],r[2]):r[3] for r in db.execute("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL") if not r[1].startswith(('sqlite_', '_cf_', '_mf_')) and r[1] not in shadows}
        if local_schema != expected_schema or db.execute('PRAGMA foreign_key_check').fetchone() or db.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
            raise ValueError('Local restore schema or integrity differs from the verified remote database')
        db.commit()
        success = True
        return {'schemaVerified': True, 'completeRestoreBackup': True, 'artifactPurpose': 'verified D1 restore', 'contentlessTokenStateRestored': True, 'tablesVerified': len(manifest['tables']), 'viewsVerified': len(manifest.get('views', {})), 'rowsVerified': sum(v['count'] for v in manifest['tables'].values()), 'usage': remote.usage}
    finally:
        db.close()
        if success:
            partial.replace(output)
        else:
            partial.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bundle', type=Path, required=True)
    parser.add_argument('--resources', type=Path, required=True)
    parser.add_argument('--oauth-file', type=Path, required=True)
    parser.add_argument('--phase', choices=['d1', 'r2', 'verify'], required=True)
    parser.add_argument('--r2-settings', type=Path)
    parser.add_argument('--r2-workers', type=int, choices=range(1, 17), default=4)
    parser.add_argument('--access-attestation', type=Path)
    parser.add_argument('--reconcile-import-status', action='store_true')
    parser.add_argument('--reconciliation-extra-reads', type=int)
    args = parser.parse_args()
    if args.reconcile_import_status and (args.phase != 'd1' or args.reconciliation_extra_reads is None):
        raise ValueError('Import reconciliation requires the D1 phase and an explicit diagnostic read charge')
    if args.reconciliation_extra_reads is not None and (not args.reconcile_import_status or args.reconciliation_extra_reads < 0):
        raise ValueError('Diagnostic read charges are only valid with explicit import reconciliation')
    os.umask(0o077)
    directory = args.bundle.resolve()
    manifest, bundle, files = verify_bundle(directory)
    resources = json.loads(args.resources.read_text())
    remote = Cloudflare(resources['accountId'], resources['databaseId'], args.oauth_file)
    work = directory / 'remote-transfer'
    work.mkdir(mode=0o700, exist_ok=True)
    with (work / 'lock').open('a') as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            remote.configure_usage(work / 'usage.json', bundle)
        except RuntimeError:
            if args.reconcile_import_status:
                remote.import_recovery_budget()
                state_path = work / 'd1-state.json'
                if not state_path.exists():
                    raise ValueError('Import reconciliation requires a target-bound pending checkpoint')
                checkpoint = json.loads(state_path.read_text())
                if checkpoint.get('target') != remote.usage_state['target'] or not checkpoint.get('pending', {}).get('bookmark'):
                    raise ValueError('Import reconciliation requires the exact target and pending bookmark')
            else:
                remote.cleanup_scratch()
                raise
        attestation = None
        if args.access_attestation:
            if args.access_attestation.stat().st_mode & 0o077:
                raise ValueError('Access attestation must be a private mode 0600 file')
            attestation = json.loads(args.access_attestation.read_text())
        remote.guard(resources, attestation)
        if args.phase == 'd1':
            transfer_d1(directory, manifest, bundle, files, remote, work / 'd1-state.json', args.reconcile_import_status, args.reconciliation_extra_reads or 0)
        elif args.phase == 'r2':
            if not args.r2_settings:
                raise ValueError('R2 transfer settings are required')
            settings = json.loads(args.r2_settings.read_text())
            expected_url = remote.guard_r2(resources, settings, attestation)
            count = transfer_r2(directory, manifest, R2Transfer(settings, expected_url), workers=args.r2_workers)
            write_json(work / 'r2-complete.json', {'bundle': bundle, 'objectsVerified': count})
        else:
            report = verify_remote(directory, manifest, remote, work / 'verified.sqlite')
            report['bundle'] = bundle
            write_json(work / 'verification.json', report)
            print(json.dumps(report), flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'status': 'stopped', 'error': str(error)}), flush=True)
        raise SystemExit(1)
