#!/usr/bin/env python3
"""Read-only, resumable production D1/R2 capture into a protected local bundle.

Hold all application writers/cron/queue delivery paused for the whole capture.
No remote schema, object, source, or queue mutation is performed by this tool.
"""
import argparse
import concurrent.futures
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

import snapshot
from transfer import API, NoRedirect, RECEIPTS, VOCAB_PREFIX, typed_value, write_json

PROGRESS = '_cf_imladris_capture_progress'
MAX_RESPONSE = 32 * 1024 * 1024
LIVE_OPERATIONAL_KEYS = {'operations/operating-state.json'}


class CaptureError(RuntimeError):
    pass


class ResponseTooLarge(CaptureError):
    """Only the local bounded-response read can raise this retry signal."""


def shadow_writes_supported():
    # Some system Python builds force SQLite defensive mode, which intentionally
    # forbids even local FTS shadow reconstruction. Fail before any account read.
    db = sqlite3.connect(':memory:')
    try:
        db.execute('CREATE VIRTUAL TABLE capture_probe USING fts5(content)')
        db.execute('DELETE FROM capture_probe_data')
        return True
    except sqlite3.DatabaseError:
        return False
    finally:
        db.close()


class Client:
    def __init__(self, account, database, bucket, token_file):
        self.account, self.database, self.bucket = account, database, bucket
        token_file = Path(token_file)
        if token_file.is_symlink() or not token_file.is_file() or token_file.stat().st_mode & 0o077:
            raise CaptureError('Token must be a protected regular file')
        self.token = token_file.read_text().strip()
        if not self.token or any(c.isspace() for c in self.token):
            raise CaptureError('Token file is empty or malformed')
        self.lock = threading.Lock()
        self.next_request = 0
        self.rows_read = 0
        self.requests = 0
        self.meter_path = None

    def configure_meter(self, path):
        self.meter_path = path
        expected = {'account': self.account, 'database': self.database, 'bucket': self.bucket}
        if path.exists():
            state = json.loads(path.read_text())
            if state.get('target') != expected or any(type(state.get(name)) is not int or state[name] < 0 for name in ('requests', 'rowsRead')):
                raise CaptureError('Capture usage checkpoint differs from this target')
            self.requests, self.rows_read = state['requests'], state['rowsRead']
        self.persist_meter()

    def persist_meter(self):
        if self.meter_path:
            write_json(self.meter_path, {'target': {'account': self.account, 'database': self.database, 'bucket': self.bucket}, 'requests': self.requests, 'rowsRead': self.rows_read})

    def open(self, suffix, body=None, headers=None):
        # Cloudflare's account API has a shared request ceiling. Parallel reads
        # overlap latency while this limiter bounds aggregate starts to 3/s.
        with self.lock:
            if self.requests >= 60_000:
                raise CaptureError('Capture management request ceiling reached; inspect the retained checkpoint')
            time.sleep(max(0, self.next_request - time.monotonic()))
            self.next_request = time.monotonic() + 1 / 3
            self.requests += 1
            self.persist_meter()
        request = urllib.request.Request(API + '/accounts/' + self.account + suffix,
            data=None if body is None else json.dumps(body).encode(),
            headers={'Authorization': 'Bearer ' + self.token,
                     'Content-Type': 'application/json', **(headers or {})})
        try:
            return urllib.request.build_opener(NoRedirect).open(request, timeout=60)
        except urllib.error.HTTPError as error:
            raise CaptureError('Cloudflare read failed (HTTP ' + str(error.code) + ')') from None
        except (OSError, TimeoutError):
            raise CaptureError('Cloudflare read failed; the partial local capture can be resumed') from None

    def request(self, suffix, body=None):
        with self.open(suffix, body) as response:
            payload = response.read(MAX_RESPONSE + 1)
        if len(payload) > MAX_RESPONSE:
            raise ResponseTooLarge('Management response exceeded the bounded capture size')
        result = json.loads(payload)
        if result.get('success') is not True:
            raise CaptureError('Cloudflare read was unsuccessful')
        return result

    def query(self, sql, params=None):
        # Call sites construct SELECT statements only, including schema PRAGMAs
        # exposed through table-valued functions. Reject accidental mutation.
        if not sql.startswith('SELECT '):
            raise CaptureError('Capture permits SELECT queries only')
        if self.rows_read >= 100_000_000:
            raise CaptureError('Capture D1 read ceiling is already exhausted; inspect query plans before resuming')
        result = self.request('/d1/database/' + self.database + '/query', {'sql': sql, 'params': params or []})['result']
        if len(result) != 1 or result[0].get('success') is not True:
            raise CaptureError('D1 read was unsuccessful')
        if result[0].get('meta', {}).get('rows_written') != 0:
            raise CaptureError('A capture query unexpectedly reported writes')
        observed = result[0].get('meta', {}).get('rows_read')
        if type(observed) is not int or observed < 0:
            raise CaptureError('D1 read accounting is missing')
        with self.lock:
            self.rows_read += observed
            self.persist_meter()
            if self.rows_read > 100_000_000:
                raise CaptureError('Capture D1 read ceiling reached; inspect query plans before resuming')
        return result[0]['results']

    def bookmark(self):
        return self.request('/d1/database/' + self.database + '/time_travel/bookmark')['result']

    def inventory(self):
        objects, cursor, start_after, seen = {}, None, None, set()
        while True:
            query = urllib.parse.urlencode({'per_page': 1000, **({'cursor': cursor} if cursor else {}), **({'start_after': start_after} if start_after is not None else {})})
            result = self.request('/r2/buckets/' + urllib.parse.quote(self.bucket, safe='') + '/objects?' + query)
            if not isinstance(result.get('result'), list) or len(result['result']) > 1000:
                raise CaptureError('Invalid R2 inventory page')
            for item in result['result']:
                key = item.get('key')
                if not isinstance(key, str) or key in objects or type(item.get('size')) is not int or item['size'] < 0 or not item.get('etag'):
                    raise CaptureError('Invalid or duplicate R2 inventory entry')
                if start_after is not None and key <= start_after:
                    raise CaptureError('R2 inventory keyset did not advance')
                if item.get('ssec') or item.get('storage_class', 'Standard') != 'Standard':
                    raise CaptureError('Capture requires existing Standard objects without customer-supplied encryption')
                objects[key] = item
            info = result.get('result_info', {})
            if info.get('is_truncated') is False:
                return objects
            cursor = info.get('cursor')
            if not cursor and info.get('is_truncated') is not True:
                # The native account API omits result_info on a final page.
                # A short page is complete. For an exactly full page, verify
                # the tail through the documented lexicographic keyset option.
                if len(result['result']) < 1000:
                    return objects
                keys = [item['key'] for item in result['result']]
                if keys != sorted(keys):
                    raise CaptureError('R2 inventory keys are not ordered')
                start_after = keys[-1]
                continue
            if not cursor or cursor in seen:
                raise CaptureError('R2 inventory pagination is incomplete')
            seen.add(cursor)
            start_after = None

    def download(self, item, path):
        suffix = '/r2/buckets/' + urllib.parse.quote(self.bucket, safe='') + '/objects/' + urllib.parse.quote(item['key'], safe='')
        with self.open(suffix, headers={'If-Match': '"' + item['etag'].strip('"') + '"'}) as response:
            observed = re.fullmatch(r'(W/)?"([^\"]+)"', response.headers.get('ETag', '').strip())
            expected = item['etag'].strip('"')
            if observed is None or observed[2] != expected:
                raise CaptureError('R2 object changed after inventory')
            if observed[1] and not re.fullmatch('[0-9a-fA-F]{32}', expected):
                raise CaptureError('Weak multipart R2 etag cannot prove exact backup bytes')
            # The account API can weaken its HTTP validator during transport.
            # Accept that form only for single-part MD5 etags: stream_object
            # independently proves the exact paused-inventory size AND MD5.
            # Missing/mismatched validators and weak multipart etags still stop.
            return stream_object(response, path, item)


def stream_object(source, target, item):
    sha, md5, size = hashlib.sha256(), hashlib.md5(), 0
    temporary = target.with_name(target.name + '.' + uuid.uuid4().hex + '.partial')
    try:
        with temporary.open('xb') as output:
            for chunk in iter(lambda: source.read(1024 * 1024), b''):
                size += len(chunk)
                if size > item['size']:
                    raise CaptureError('R2 object exceeded its captured size')
                sha.update(chunk)
                md5.update(chunk)
                output.write(chunk)
            output.flush()
            os.fsync(output.fileno())
        etag = item['etag'].strip('"')
        if size != item['size'] or (re.fullmatch('[0-9a-fA-F]{32}', etag) and md5.hexdigest() != etag.lower()):
            raise CaptureError('R2 object size or etag verification failed')
        temporary.replace(target)
        return sha.hexdigest()
    finally:
        temporary.unlink(missing_ok=True)


def schema(remote):
    definitions = remote.query("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY type,name")
    if any(r['name'].startswith(VOCAB_PREFIX) or r['name'] == 'imladris_transfer_vocab' for r in definitions):
        raise CaptureError('Previous transfer scratch tables require operator reconciliation')
    return [r for r in definitions if r['name'] != RECEIPTS and not r['name'].startswith(('sqlite_', '_cf_', '_mf_'))]


def expression(column):
    c = snapshot.identifier(column)
    return ('json_array(typeof(' + c + '),CASE WHEN typeof(' + c + ") IN ('blob','text') THEN hex(" + c +
            ") WHEN typeof(" + c + ")='real' THEN printf('%!.26g'," + c + ') ELSE ' + c + ' END)')


def capture_table(remote, db, name, page_size=2000):
    if type(page_size) is not int or not 1 <= page_size <= 2000:
        raise CaptureError('Capture page size must be between 1 and 2000 rows')
    info = db.execute('PRAGMA table_info(' + snapshot.identifier(name) + ')').fetchall()
    columns = [r[1] for r in info]
    without_rowid = bool(db.execute('SELECT wr FROM pragma_table_list WHERE name=?', (name,)).fetchone()[0])
    keys = [r[1] for r in sorted(info, key=lambda r: r[5]) if r[5]] if without_rowid else [next(k for k in ('_rowid_', 'rowid', 'oid') if k not in columns)]
    # Preserve hidden rowids as well: external-content FTS and legacy row maps
    # can depend on them even when a table's declared primary key is textual.
    selected_columns = columns if without_rowid else [keys[0], *columns]
    selected = ','.join(expression(c) + ' AS ' + snapshot.identifier('__value_' + str(i)) for i, c in enumerate(selected_columns))
    extras = ','.join(expression(k) + ' AS ' + snapshot.identifier('__key_' + str(i)) for i, k in enumerate(keys))
    order = ','.join(snapshot.identifier(k) for k in keys)
    progress = db.execute('SELECT cursor,count,complete FROM ' + PROGRESS + ' WHERE name=?', (name,)).fetchone()
    previous, count, complete = (json.loads(progress[0]), progress[1], progress[2]) if progress else (None, 0, False)
    if complete:
        return count
    while True:
        where, params = '', []
        if previous is not None:
            casts = []
            for encoded in previous:
                kind, value = json.loads(encoded)
                if kind == 'blob':
                    # FTS5's WITHOUT ROWID segment index has a BLOB key. A
                    # validated bytes literal preserves its exact indexed order;
                    # JSON API parameters cannot represent binary values.
                    casts.append(snapshot.literal(typed_value(encoded)))
                    continue
                if kind not in ('integer', 'real', 'text'):
                    raise CaptureError('Unsupported primary-key capture type')
                casts.append('CAST(? AS ' + kind.upper() + ')')
                params.append(str(typed_value(encoded)))
            where = ' WHERE (' + order + ')>(' + ','.join(casts) + ')'
        try:
            result = remote.query('SELECT ' + selected + ',' + extras + ' FROM ' + snapshot.identifier(name) + where + ' ORDER BY ' + order + ' LIMIT ' + str(page_size), params)
        except ResponseTooLarge:
            if page_size == 1:
                raise
            # No rows or cursor have been committed yet. Retry the exact same
            # keyset with a smaller result; authentication/network failures are
            # deliberately not caught or retried here.
            page_size = max(1, page_size // 2)
            continue
        if len(result) > page_size:
            raise CaptureError('D1 returned an oversized capture page')
        with db:
            if result:
                db.executemany('INSERT INTO ' + snapshot.identifier(name) + '(' + ','.join(snapshot.identifier(c) for c in selected_columns) + ') VALUES(' + ','.join('?' for _ in selected_columns) + ')',
                    [tuple(typed_value(r['__value_' + str(i)]) for i in range(len(selected_columns))) for r in result])
                previous = [result[-1]['__key_' + str(i)] for i in range(len(keys))]
                count += len(result)
            db.execute('INSERT OR REPLACE INTO ' + PROGRESS + ' VALUES(?,?,?,?)', (name, json.dumps(previous), count, not result))
        if not result:
            if remote.query('SELECT COUNT(*) AS n FROM ' + snapshot.identifier(name))[0]['n'] != count:
                raise CaptureError('Remote table count changed during capture')
            return count


def capture_database(remote, destination, definitions, page_size=2000):
    path = destination / 'database.sqlite'
    fresh = not path.exists()
    db = sqlite3.connect(path)
    try:
        if fresh:
            # Build virtual tables first, then copy their physical shadow rows.
            # This preserves exact contentless FTS positions without any remote
            # scratch vocabulary, token reconstruction, or source mutation.
            virtual = [r for r in definitions if r['type'] == 'table' and r['sql'].upper().startswith('CREATE VIRTUAL TABLE')]
            for item in virtual:
                if 'using fts5' not in item['sql'].lower():
                    raise CaptureError('Unsupported remote virtual table')
                db.execute(item['sql'])
            shadows = {r[1] for r in db.execute('PRAGMA table_list') if r[2] == 'shadow'}
            for item in definitions:
                if item['type'] == 'table' and item not in virtual and item['name'] not in shadows:
                    db.execute(item['sql'])
            for name in shadows:
                db.execute('DELETE FROM ' + snapshot.identifier(name))
            db.execute('CREATE TABLE ' + PROGRESS + '(name TEXT PRIMARY KEY,cursor TEXT,count INTEGER,complete INTEGER)')
            db.commit()
        else:
            virtual = [r for r in definitions if r['type'] == 'table' and r['sql'].upper().startswith('CREATE VIRTUAL TABLE')]
        skip = {r['name'] for r in virtual}
        for item in definitions:
            if item['type'] == 'table' and item['name'] not in skip:
                capture_table(remote, db, item['name'], page_size)
        if db.execute("SELECT 1 FROM sqlite_schema WHERE name='sqlite_sequence'").fetchone():
            if not db.execute('SELECT 1 FROM ' + PROGRESS + ' WHERE name=?', ('sqlite_sequence',)).fetchone():
                db.execute('DELETE FROM sqlite_sequence')
                db.commit()
            capture_table(remote, db, 'sqlite_sequence', page_size)
        # INSTEAD OF triggers require their compatibility views to exist first.
        for item in sorted(definitions, key=lambda r: {'index': 0, 'view': 1, 'trigger': 2}.get(r['type'], 3)):
            if item['type'] in ('index', 'view', 'trigger'):
                exists = db.execute('SELECT sql FROM sqlite_schema WHERE name=?', (item['name'],)).fetchone()
                if not exists:
                    db.execute(item['sql'])
                elif exists[0] != item['sql']:
                    raise CaptureError('Local captured schema differs')
        db.commit()
        if db.execute('PRAGMA quick_check').fetchone()[0] != 'ok' or db.execute('PRAGMA foreign_key_check').fetchone():
            raise CaptureError('Captured database integrity failed')
        for item in virtual:
            snapshot.vocabulary(db, item['name'])
    finally:
        db.close()
    return path


def capture_objects(remote, destination, inventory, reuse=None, workers=8):
    directory = destination / 'objects'
    directory.mkdir(exist_ok=True)
    metadata = sqlite3.connect(destination / 'r2-metadata.sqlite')
    metadata.execute('CREATE TABLE IF NOT EXISTS _mf_objects(key TEXT PRIMARY KEY,blob_id TEXT,size INTEGER,http_metadata TEXT,custom_metadata TEXT,etag TEXT)')
    retained = {r[0]: r[1:] for r in metadata.execute('SELECT key,blob_id,size,etag FROM _mf_objects')}
    baseline = json.loads((reuse / 'manifest.json').read_text()).get('objects', {}) if reuse else {}

    def copy(item):
        key = item['key']
        old = retained.get(key)
        if old and old[1:] == (item['size'], item['etag']):
            target = directory / old[0]
            if target.is_file() and not target.is_symlink() and target.stat().st_size == item['size'] and snapshot.checksum(target) == old[0]:
                return key, old[0], item, True
        target = directory / ('pending-' + hashlib.sha256(key.encode()).hexdigest())
        prior = baseline.get(key)
        reused = False
        if prior and prior.get('bytes') == item['size']:
            source = (reuse / prior['path']).resolve()
            if reuse.resolve() not in source.parents or source.is_symlink():
                raise CaptureError('Unsafe retained object path')
            if source.is_file() and snapshot.checksum(source) == prior['sha256']:
                md5 = hashlib.md5()
                with source.open('rb') as stream:
                    for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                        md5.update(chunk)
                if md5.hexdigest() == item['etag'].strip('"').lower():
                    with source.open('rb') as stream:
                        digest = stream_object(stream, target, item)
                    reused = True
        if not reused:
            digest = remote.download(item, target)
        target.replace(directory / digest)
        return key, digest, item, reused

    copied, reused_count = 0, 0
    try:
        # Bound queued futures as well as active downloads; real object keys and
        # failures remain private, and a retry reuses every committed object.
        items = iter(inventory.values())
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
            pending = set()
            for _ in range(workers):
                item = next(items, None)
                if item is not None:
                    pending.add(executor.submit(copy, item))
            while pending:
                done, pending = concurrent.futures.wait(pending, return_when=concurrent.futures.FIRST_COMPLETED)
                for future in done:
                    key, digest, item, reused = future.result()
                    metadata.execute('INSERT OR REPLACE INTO _mf_objects VALUES(?,?,?,?,?,?)', (key, digest, item['size'], json.dumps(item.get('http_metadata', {})), json.dumps(item.get('custom_metadata', {})), item['etag']))
                    copied += 1
                    reused_count += int(reused)
                    if copied % 100 == 0:
                        metadata.commit()
                    item = next(items, None)
                    if item is not None:
                        pending.add(executor.submit(copy, item))
        metadata.commit()
    finally:
        metadata.close()
    return {'objects': copied, 'reusedObjects': reused_count}


def finalize_bundle(destination):
    db = sqlite3.connect(destination / 'database.sqlite')
    metadata = sqlite3.connect(destination / 'r2-metadata.sqlite')
    try:
        db.execute('DROP TABLE IF EXISTS ' + PROGRESS)
        db.commit()
        objects = {key: {'path': 'objects/' + blob, 'sha256': blob, 'bytes': size, 'httpMetadata': json.loads(http), 'customMetadata': json.loads(custom)}
                   for key, blob, size, http, custom in metadata.execute('SELECT key,blob_id,size,http_metadata,custom_metadata FROM _mf_objects ORDER BY key')}
        references = snapshot.verify_references(db, objects)
        ordinary, virtual = snapshot.tables(db)
        schema_path, indexes, view_definitions, sequences = snapshot.export_schema(db, ordinary, virtual, destination)
        if (destination / 'data').exists():
            shutil.rmtree(destination / 'data')
        writer = snapshot.SqlFiles(destination / 'data')
        inventory = {name: snapshot.export_table(db, name, writer) for name in snapshot.table_order(db, ordinary)}
        for name in virtual:
            inventory[name] = snapshot.export_content_search(db, objects, destination, writer) if name == 'article_content_search' else snapshot.export_table(db, name, writer, virtual=True)
            inventory[name]['vocabularySha256'] = snapshot.vocabulary(db, name)
        views = {}
        for name in view_definitions:
            digest, count = hashlib.sha256(), 0
            for row in snapshot.rows(db, name, view=True)[1]:
                snapshot.hash_row(digest, row)
                count += 1
            views[name] = {'count': count, 'sha256': digest.hexdigest()}
        files = writer.finish()
        backups = {name: {'path': name, 'sha256': snapshot.checksum(destination / name), 'bytes': (destination / name).stat().st_size} for name in ('database.sqlite', 'r2-metadata.sqlite')}
        migrations = []
        if 'd1_migrations' in ordinary:
            applied = {r[0] for r in db.execute('SELECT name FROM d1_migrations')}
            for name in sorted(applied):
                path = snapshot.ROOT / 'packages/db/migrations' / name
                if not path.is_file() or path.name != name:
                    raise CaptureError('Remote migration is absent from this checkout')
                migrations.append({'name': name, 'sha256': snapshot.checksum(path)})
        manifest = {'version': 2, 'backups': backups, 'schema': {'path': schema_path.name, 'sha256': snapshot.checksum(schema_path)}, 'indexes': {'path': indexes.name, 'sha256': snapshot.checksum(indexes)},
                    'data': files, 'tables': inventory, 'views': views, 'objects': objects, 'referencesVerified': references, 'migrations': migrations, 'sequences': sequences, 'databaseBytes': backups['database.sqlite']['bytes']}
        write_json(destination / 'manifest.json', manifest)
        return manifest
    finally:
        metadata.close()
        db.close()


def capture(remote, destination, writers_paused=False, reuse=None, workers=8, page_size=2000, pause_id=None):
    if not writers_paused:
        raise CaptureError('Hold all writers paused and explicitly attest --writers-paused')
    if not shadow_writes_supported():
        raise CaptureError('This SQLite build forbids local FTS reconstruction; use Python with a non-defensive SQLite build')
    if not isinstance(pause_id, str) or not pause_id.strip():
        raise CaptureError('An uninterrupted maintenance-window pause ID is required')
    if type(workers) is not int or not 1 <= workers <= 16 or type(page_size) is not int or not 1 <= page_size <= 2000:
        raise CaptureError('Capture concurrency or page size exceeds its bound')
    destination = destination.resolve()
    if snapshot.ROOT / '.private' not in destination.parents:
        raise CaptureError('Capture staging must be inside the ignored .private directory')
    destination.mkdir(parents=True, exist_ok=True, mode=0o700)
    if any(p.is_symlink() or p.stat().st_mode & 0o077 for p in [destination, *destination.rglob('*')]):
        raise CaptureError('Capture files must be protected and contain no symlinks')
    # Lock before any target-bound state or schema is read/written. In particular,
    # two initial invocations must never race to overwrite each other's pause ID.
    with (destination / 'capture.lock').open('a') as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        return capture_locked(remote, destination, reuse, workers, page_size, pause_id)


def capture_locked(remote, destination, reuse, workers, page_size, pause_id):
    if (destination / 'manifest.json').exists():
        raise CaptureError('A completed capture already exists; verify or rehearse it separately')
    if hasattr(remote, 'configure_meter'):
        remote.configure_meter(destination / 'capture-usage.json')
    target = {'account': remote.account, 'database': remote.database, 'bucket': remote.bucket}
    definitions = schema(remote)
    inventory = {key: item for key, item in remote.inventory().items() if key not in LIVE_OPERATIONAL_KEYS}
    identity = {'target': target, 'pauseId': pause_id, 'schema': definitions, 'inventory': inventory, 'excludedLiveOperationalKeys': sorted(LIVE_OPERATIONAL_KEYS)}
    state_path = destination / 'capture.json'
    if state_path.exists():
        state = json.loads(state_path.read_text())
        if state['identity'] != identity:
            raise CaptureError('Remote identity/schema/object inventory changed; start a fresh capture')
    else:
        if any(path.name not in ('capture.lock', 'capture-usage.json') for path in destination.iterdir()):
            raise CaptureError('Capture destination contains unrelated files')
        state = {'identity': identity, 'writersPausedAttested': True, 'startedAt': datetime.now(timezone.utc).isoformat(), 'bookmarkBefore': remote.bookmark(), 'databaseComplete': False}
        # A prior transfer's receipts identify that old target/import, and must
        # not become receipts for a future restored target. Retain this evidence
        # separately instead of feeding it back into application restoration.
        if remote.query('SELECT name FROM sqlite_schema WHERE name=?', [RECEIPTS]):
            state['previousTransferReceipts'] = remote.query('SELECT bundle,path,sha256 FROM ' + RECEIPTS + ' ORDER BY path')
        write_json(state_path, state)
    if not state['databaseComplete']:
        capture_database(remote, destination, definitions, page_size)
        state['databaseComplete'] = True
        write_json(state_path, state)
    report = capture_objects(remote, destination, inventory, reuse, workers)
    final_inventory = {key: item for key, item in remote.inventory().items() if key not in LIVE_OPERATIONAL_KEYS}
    if schema(remote) != definitions or final_inventory != inventory:
        raise CaptureError('Remote schema/object inventory changed during capture')
    state['bookmarkAfter'] = remote.bookmark()
    # Time Travel bookmarks can encode timestamps: record both, never mistake
    # equality/difference for a database transaction consistency proof.
    state['completedAt'] = datetime.now(timezone.utc).isoformat()
    write_json(state_path, state)
    manifest = finalize_bundle(destination)
    rehearsal = snapshot.rehearse(destination)
    return {**report, 'tables': len(manifest['tables']), 'referencesVerified': manifest['referencesVerified'], 'independentRestoreVerified': rehearsal['status'] == 'passed'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--account', required=True)
    parser.add_argument('--database', required=True)
    parser.add_argument('--bucket', required=True)
    parser.add_argument('--token-file', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--reuse-bundle', type=Path)
    parser.add_argument('--workers', type=int, choices=range(1, 17), default=8)
    parser.add_argument('--page-size', type=int, default=2000, help='Maximum D1 rows per page (1..2000); oversized responses reduce this automatically')
    parser.add_argument('--writers-paused', action='store_true')
    parser.add_argument('--pause-id', required=True, help='Unique maintenance-window ID; reuse it only while the same uninterrupted writer pause is held')
    args = parser.parse_args()
    try:
        remote = Client(args.account, args.database, args.bucket, args.token_file)
        print(json.dumps(capture(remote, args.output, args.writers_paused, args.reuse_bundle, args.workers, page_size=args.page_size, pause_id=args.pause_id)))
    except Exception as error:
        # SQL/native exceptions may contain private keys/content. Keep the public
        # diagnostic categorical; retained files and receipts stay local.
        print('Production capture stopped (' + type(error).__name__ + ')' + (': ' + str(error) if isinstance(error, CaptureError) else ''), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    os.umask(0o077)
    sys.exit(main())
