#!/usr/bin/env python3
"""Local, content-safe deployment bundle and restore rehearsal. Never uploads data."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import sys


ROOT = Path(__file__).resolve().parents[2]
STATEMENT_LIMIT = 95_000
FILE_LIMIT = 4 * 1024 * 1024


def identifier(value):
    return '"' + value.replace('"', '""') + '"'


def checksum(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def literal(value):
    if value is None:
        return 'NULL'
    if isinstance(value, bytes):
        return "X'" + value.hex() + "'"
    if isinstance(value, str):
        if '\x00' in value:
            return "CAST(X'" + value.encode().hex() + "' AS TEXT)"
        return "'" + value.replace("'", "''") + "'"
    return repr(value)


def hash_row(digest, row):
    encoded = [({'blob': value.hex()} if isinstance(value, bytes) else value) for value in row]
    digest.update((json.dumps(encoded, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n').encode())


def tables(database):
    entries = database.execute("SELECT name,sql FROM sqlite_schema WHERE type='table' AND sql IS NOT NULL ORDER BY name").fetchall()
    virtual = {name: sql for name, sql in entries if sql.upper().startswith('CREATE VIRTUAL TABLE')}
    shadow = {row[1] for row in database.execute('PRAGMA table_list') if row[2] == 'shadow'}
    ordinary = {name: sql for name, sql in entries if name not in virtual and name not in shadow and not name.startswith(('sqlite_', '_cf_', '_mf_'))}
    return ordinary, virtual


def foreign_key_indexes(database, ordinary):
    # Explicit UNIQUE indexes can be parent keys. They must exist before any
    # child insert while foreign keys remain enabled during restore.
    required = {}
    for child in ordinary:
        references = {}
        for row in database.execute('PRAGMA foreign_key_list(' + identifier(child) + ')'):
            references.setdefault((row[0], row[2]), []).append((row[1], row[4]))
        for (_, parent), columns in references.items():
            target = tuple(column for _, column in sorted(columns))
            if parent not in ordinary or any(column is None for column in target):
                continue
            for index in database.execute('PRAGMA index_list(' + identifier(parent) + ')').fetchall():
                name = index[1]
                if not index[2] or index[4]:
                    continue
                indexed = tuple(row[2] for row in database.execute('PRAGMA index_info(' + identifier(name) + ')'))
                if indexed != target:
                    continue
                definition = database.execute("SELECT sql FROM sqlite_schema WHERE type='index' AND name=?", (name,)).fetchone()
                if definition and definition[0]:
                    required[name] = definition[0]
    return dict(sorted(required.items()))


def export_schema(database, ordinary, virtual, destination):
    schema = destination / 'schema.sql'
    early_indexes = foreign_key_indexes(database, ordinary)
    schema.write_text(';\n'.join(list(ordinary.values()) + list(virtual.values()) + list(early_indexes.values())) + ';\n')
    indexes = destination / 'indexes-and-triggers.sql'
    views = {name: sql for name, sql in database.execute("SELECT name,sql FROM sqlite_schema WHERE type='view' AND sql IS NOT NULL ORDER BY name") if not name.startswith(('sqlite_', '_cf_', '_mf_'))}
    definitions = list(views.values()) + [sql for name, sql in database.execute("SELECT name,sql FROM sqlite_schema WHERE type IN ('index','trigger') AND sql IS NOT NULL ORDER BY type,name") if name not in early_indexes and not name.startswith(('sqlite_', '_cf_', '_mf_'))]
    sequences = sequence_state(database, ordinary)
    for name, seq in sequences:
        definitions += ['DELETE FROM sqlite_sequence WHERE name=' + literal(name), 'INSERT INTO sqlite_sequence(name,seq) VALUES(' + literal(name) + ',' + literal(seq) + ')']
    indexes.write_text(';\n'.join(definitions) + (';\n' if definitions else ''))
    return schema, indexes, views, sequences


def table_order(database, ordinary):
    pending = set(ordinary)
    result = []
    dependencies = {name: {row[2] for row in database.execute('PRAGMA foreign_key_list(' + identifier(name) + ')')} & pending - {name} for name in pending}
    while pending:
        ready = sorted(name for name in pending if not (dependencies[name] & pending))
        if not ready:
            raise ValueError('Cyclic table dependencies require an explicit transfer design')
        result.extend(ready)
        pending.difference_update(ready)
    return result


def rows(database, table, virtual=False, view=False):
    info = database.execute('PRAGMA table_info(' + identifier(table) + ')').fetchall()
    columns = [row[1] for row in info]
    keys = [row[1] for row in sorted(info, key=lambda row: row[5]) if row[5]]
    if virtual:
        columns.insert(0, 'rowid')
        keys = ['rowid']
    order = ','.join(identifier(key) for key in (columns if view else (keys or ['rowid'])))
    selected = ','.join(identifier(column) for column in columns)
    return columns, database.execute(f'SELECT {selected} FROM {identifier(table)} ORDER BY {order}')


class SqlFiles:
    def __init__(self, directory):
        self.directory = directory
        directory.mkdir()
        self.paths = []
        self.stream = None
        self.size = 0

    def write(self, sql):
        encoded = (sql + ';\n').encode()
        if len(encoded) > STATEMENT_LIMIT:
            raise ValueError('A transfer row exceeds the D1 SQL statement limit; use a bound-parameter transfer for this dataset')
        if self.stream is None or self.size + len(encoded) > FILE_LIMIT:
            if self.stream:
                self.stream.close()
            path = self.directory / f'{len(self.paths):05d}.sql'
            self.paths.append(path)
            self.stream = path.open('wb')
            self.size = 0
        self.stream.write(encoded)
        self.size += len(encoded)

    def finish(self):
        if self.stream:
            self.stream.close()
        return [{'path': str(path.relative_to(self.directory.parent)), 'sha256': checksum(path), 'bytes': path.stat().st_size} for path in self.paths]

    def __del__(self):
        if self.stream and not self.stream.closed:
            self.stream.close()


def export_table(database, name, output, virtual=False):
    columns, records = rows(database, name, virtual)
    prefix = f'INSERT INTO {identifier(name)}(' + ','.join(identifier(column) for column in columns) + ') VALUES('
    digest = hashlib.sha256()
    count = 0
    for row in records:
        output.write(prefix + ','.join(literal(value) for value in row) + ')')
        hash_row(digest, row)
        count += 1
    return {'count': count, 'sha256': digest.hexdigest(), 'virtual': virtual}


def vocabulary(database, table):
    database.execute('DROP TABLE IF EXISTS temp.deployment_vocab')
    database.execute("CREATE VIRTUAL TABLE temp.deployment_vocab USING fts5vocab(main," + literal(table) + ",'instance')")
    digest = hashlib.sha256()
    for row in database.execute('SELECT term,doc,col,offset FROM temp.deployment_vocab ORDER BY doc,col,offset,term'):
        hash_row(digest, row)
    database.execute('DROP TABLE temp.deployment_vocab')
    return digest.hexdigest()


def sequence_state(database, ordinary):
    if not database.execute("SELECT 1 FROM sqlite_schema WHERE name='sqlite_sequence'").fetchone():
        return []
    return [(name, seq) for name, seq in database.execute('SELECT name,seq FROM sqlite_sequence ORDER BY name') if name in ordinary]


def stable_sqlite_copy(source, target):
    # Miniflare's live SQLite VFS need not allow ordinary SQLite connections.
    # Reject pending journals, then verify that every copied byte was stable.
    for suffix in ('-wal', '-journal'):
        journal = Path(str(source) + suffix)
        if journal.exists() and journal.stat().st_size:
            raise ValueError('Pause local writes before snapshotting a database with a live journal')
    before = checksum(source)
    shutil.copyfile(source, target)
    if before != checksum(target) or before != checksum(source):
        raise ValueError('Database changed during the snapshot; retry after pausing local writes')
    for suffix in ('-wal', '-journal'):
        journal = Path(str(source) + suffix)
        if journal.exists() and journal.stat().st_size:
            raise ValueError('Database journal appeared during the snapshot; pause local writes')


def copy_r2(metadata, blobs, destination):
    copied_metadata = destination / 'r2-metadata.sqlite'
    stable_sqlite_copy(metadata, copied_metadata)
    db = sqlite3.connect(copied_metadata)
    try:
        if db.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
            raise ValueError('R2 metadata integrity check failed')
        objects = {}
        object_directory = destination / 'objects'
        object_directory.mkdir()
        for key, blob, size, http, custom in db.execute('SELECT key,blob_id,size,http_metadata,custom_metadata FROM _mf_objects WHERE blob_id IS NOT NULL ORDER BY key'):
            if Path(blob).name != blob:
                raise ValueError('Unexpected Miniflare blob path')
            source = blobs / blob
            if not source.is_file():
                raise ValueError('A stored R2 blob is missing')
            digest = checksum(source)
            target = object_directory / digest
            if not target.exists():
                shutil.copyfile(source, target)
            if target.stat().st_size != size or checksum(target) != digest:
                raise ValueError('R2 object integrity check failed')
            objects[key] = {'path': f'objects/{digest}', 'sha256': digest, 'bytes': size, 'httpMetadata': json.loads(http), 'customMetadata': json.loads(custom)}
        return objects
    finally:
        db.close()


def verify_references(database, objects):
    ordinary, _ = tables(database)
    checks = [
        ('raw_objects', 'storage_key', 'sha256'),
        ('article_content_manifests', 'raw_object_key', 'raw_sha256'),
        ('article_content_manifests', 'extracted_object_key', 'extracted_sha256'),
        ('article_content_raw_acquisitions', 'storage_key', 'sha256'),
        ('catalog_responses', 'storage_key', 'sha256'),
    ]
    references = 0
    for table, column, digest_column in checks:
        if table not in ordinary:
            continue
        columns = {row[1] for row in database.execute('PRAGMA table_info(' + identifier(table) + ')')}
        if column not in columns or digest_column not in columns:
            continue
        for key, digest in database.execute(f'SELECT {identifier(column)},{identifier(digest_column)} FROM {identifier(table)}'):
            if key is None:
                continue
            obj = objects.get(key)
            if obj is None or obj['sha256'] != digest:
                raise ValueError(f'A {table} object reference is missing or corrupt')
            references += 1
    return references


def export_content_search(database, objects, directory, output):
    # The contentless table cannot return its original input. Preserve the exact
    # normalized token sequence instead, then verify every term/doc/position on
    # restore. This also retains legacy indexes whose byte locators are imperfect.
    database.execute("CREATE VIRTUAL TABLE temp.content_tokens USING fts5vocab(main,'article_content_search','instance')")
    tokens = {}
    for term, doc, column, offset in database.execute('SELECT term,doc,col,offset FROM temp.content_tokens ORDER BY doc,col,offset,term'):
        terms = tokens.setdefault(doc, [])
        if column != 'content' or offset != len(terms):
            raise ValueError('Unsupported contentless index token positions')
        terms.append(term)
    database.execute('DROP TABLE temp.content_tokens')
    query = '''SELECT s.rowid,m.manifest_id,m.chunk_ordinal,f.extracted_object_key,
                      c.byte_start,c.byte_length,c.sha256
               FROM article_content_search s
               JOIN article_content_search_map m ON m.rowid=s.rowid
               JOIN article_content_manifests f ON f.id=m.manifest_id
               JOIN article_content_chunks c ON c.manifest_id=m.manifest_id AND c.ordinal=m.chunk_ordinal
               ORDER BY s.rowid'''
    digest = hashlib.sha256()
    count = 0
    mismatches = 0
    for rowid, manifest, ordinal, key, start, length, expected in database.execute(query):
        with (directory / objects[key]['path']).open('rb') as stream:
            stream.seek(start)
            content = stream.read(length)
        if len(content) != length or hashlib.sha256(content).hexdigest() != expected:
            mismatches += 1
        search_text = ' '.join(tokens.get(rowid, []))
        output.write('INSERT INTO article_content_search(rowid,manifest_id,chunk_ordinal,content) VALUES(' + ','.join(literal(value) for value in (rowid, manifest, ordinal, search_text)) + ')')
        hash_row(digest, (rowid,))
        count += 1
    if count != database.execute('SELECT count(*) FROM article_content_search').fetchone()[0]:
        raise ValueError('Article content index contains unmapped rows')
    return {'count': count, 'sha256': digest.hexdigest(), 'virtual': True, 'contentless': True, 'origin': 'preserved-token-positions', 'existingChunkHashMismatches': mismatches}


def create_bundle(database_path, metadata_path, blobs_path, destination):
    if destination.exists():
        raise ValueError('Snapshot output already exists; choose a new directory')
    if destination == ROOT or ROOT not in destination.parents:
        raise ValueError('Snapshots must be inside the repository ignored .private directory')
    private_root = ROOT / '.private'
    if private_root not in destination.parents:
        raise ValueError('Snapshot output must be under .private')
    os.umask(0o077)
    destination.mkdir(parents=True, mode=0o700)
    snapshot = destination / 'database.sqlite'
    stable_sqlite_copy(database_path, snapshot)
    db = sqlite3.connect(snapshot)
    try:
        if db.execute('PRAGMA quick_check').fetchone()[0] != 'ok' or db.execute('PRAGMA foreign_key_check').fetchone():
            raise ValueError('Source database integrity check failed')
        ordinary, virtual = tables(db)
        if any('fts5' not in sql.lower() for sql in virtual.values()):
            raise ValueError('Unsupported virtual table')
        migrations = []
        if 'd1_migrations' in ordinary:
            applied = {row[0] for row in db.execute('SELECT name FROM d1_migrations')}
            expected = sorted((ROOT / 'packages/db/migrations').glob('*.sql'))
            if applied != {path.name for path in expected}:
                raise ValueError('Apply all local migrations before taking the deployment snapshot')
            migrations = [{'name': path.name, 'sha256': checksum(path)} for path in expected]
        objects = copy_r2(metadata_path, blobs_path, destination)
        references = verify_references(db, objects)
        schema, indexes, view_definitions, sequences = export_schema(db, ordinary, virtual, destination)
        writer = SqlFiles(destination / 'data')
        inventory = {}
        for name in table_order(db, ordinary):
            inventory[name] = export_table(db, name, writer)
            if inventory[name]['count'] > 100_000:
                print(f'Exported {name}: {inventory[name]["count"]} rows', flush=True)
        for name in virtual:
            inventory[name] = (export_content_search(db, objects, destination, writer) if name == 'article_content_search' else export_table(db, name, writer, virtual=True))
            inventory[name]['vocabularySha256'] = vocabulary(db, name)
        views = {}
        for name in view_definitions:
            digest = hashlib.sha256()
            count = 0
            for row in rows(db, name, view=True)[1]:
                hash_row(digest, row)
                count += 1
            views[name] = {'count': count, 'sha256': digest.hexdigest()}
        files = writer.finish()
        manifest = {'version': 1, 'schema': {'path': schema.name, 'sha256': checksum(schema)}, 'indexes': {'path': indexes.name, 'sha256': checksum(indexes)}, 'data': files, 'tables': inventory, 'views': views, 'objects': objects, 'referencesVerified': references, 'migrations': migrations, 'sequences': sequences, 'databaseBytes': snapshot.stat().st_size}
        (destination / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
        return manifest
    finally:
        db.close()


def rehearse(directory):
    manifest = json.loads((directory / 'manifest.json').read_text())
    target = directory / 'restored.sqlite'
    if target.exists():
        raise ValueError('Restore target already exists; use a fresh bundle for a new rehearsal')
    for item in [manifest['schema'], *manifest['data'], manifest['indexes'], *manifest['objects'].values()]:
        path = (directory / item['path']).resolve()
        if directory.resolve() not in path.parents or checksum(path) != item['sha256']:
            raise ValueError('Bundle checksum or path validation failed')
    db = sqlite3.connect(target)
    try:
        db.execute('PRAGMA foreign_keys=ON')
        db.executescript((directory / manifest['schema']['path']).read_bytes().decode('utf8'))
        for item in manifest['data']:
            db.executescript('BEGIN;\n' + (directory / item['path']).read_bytes().decode('utf8') + '\nCOMMIT;')
        db.executescript((directory / manifest['indexes']['path']).read_bytes().decode('utf8'))
        if db.execute('PRAGMA quick_check').fetchone()[0] != 'ok' or db.execute('PRAGMA foreign_key_check').fetchone():
            raise ValueError('Restored database integrity check failed')
        for name, expected in manifest['tables'].items():
            digest = hashlib.sha256()
            count = 0
            records = db.execute('SELECT rowid FROM article_content_search ORDER BY rowid') if expected.get('contentless') else rows(db, name, expected['virtual'])[1]
            for row in records:
                hash_row(digest, row)
                count += 1
            if count != expected['count'] or digest.hexdigest() != expected['sha256']:
                raise ValueError(f'Restored {name} differs from the snapshot')
            if expected['virtual'] and vocabulary(db, name) != expected['vocabularySha256']:
                raise ValueError(f'Restored {name} search terms differ from the snapshot')
        for name, expected in manifest.get('views', {}).items():
            digest = hashlib.sha256()
            count = 0
            for row in rows(db, name, view=True)[1]:
                hash_row(digest, row)
                count += 1
            if count != expected['count'] or digest.hexdigest() != expected['sha256']:
                raise ValueError(f'Restored {name} compatibility view differs from the snapshot')
        references = verify_references(db, manifest['objects'])
        expected_sequences = [tuple(row) for row in manifest.get('sequences', [])]
        if expected_sequences and sequence_state(db, manifest['tables']) != expected_sequences:
            raise ValueError('Restored ID allocator state differs from the snapshot')
        report = {'status': 'passed', 'tablesVerified': len(manifest['tables']), 'viewsVerified': len(manifest.get('views', {})), 'objectsVerified': len(manifest['objects']), 'referencesVerified': references, 'rowsVerified': sum(item['count'] for item in manifest['tables'].values()), 'sequencesVerified': len(expected_sequences), 'existingArticleChunkHashMismatches': manifest['tables'].get('article_content_search', {}).get('existingChunkHashMismatches', 0), 'remoteValidation': 'not performed'}
        (directory / 'rehearsal.json').write_text(json.dumps(report, indent=2) + '\n')
        return report
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', type=Path, required=True)
    parser.add_argument('--r2-metadata', type=Path, required=True)
    parser.add_argument('--r2-blobs', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--rehearse', action='store_true')
    args = parser.parse_args()
    try:
        destination = args.output.resolve()
        manifest = create_bundle(args.database, args.r2_metadata, args.r2_blobs, destination)
        print(json.dumps({'tables': len(manifest['tables']), 'objects': len(manifest['objects']), 'sqlFiles': len(manifest['data']), 'referencesVerified': manifest['referencesVerified']}), flush=True)
        if args.rehearse:
            print(json.dumps(rehearse(destination)), flush=True)
    except Exception as error:
        # Never print source rows, SQL statements, tokens, or raw source content.
        print(f'Snapshot failed ({type(error).__name__}): {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
