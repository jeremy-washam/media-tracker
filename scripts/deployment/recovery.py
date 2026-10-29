#!/usr/bin/env python3
"""Verify a retained private backup without copying records or modifying SQLite files."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sqlite3
import sys

from snapshot import ROOT, hash_row, rows, sequence_state, tables, verify_references, vocabulary
from transfer import verify_bundle
import hashlib


def verify_database(path, manifest):
    database = sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True)
    try:
        if database.execute('PRAGMA quick_check').fetchone()[0] != 'ok' or database.execute('PRAGMA foreign_key_check').fetchone():
            raise ValueError('Retained database failed integrity checks')
        ordinary, virtual = tables(database)
        if set(ordinary) | set(virtual) != set(manifest['tables']):
            raise ValueError('Retained schema table inventory differs')
        for name, expected in manifest['tables'].items():
            digest = hashlib.sha256()
            count = 0
            records = database.execute('SELECT rowid FROM article_content_search ORDER BY rowid') if expected.get('contentless') else rows(database, name, expected['virtual'])[1]
            for row in records:
                hash_row(digest, row)
                count += 1
            if count != expected['count'] or digest.hexdigest() != expected['sha256']:
                raise ValueError('Retained table differs from bundle inventory')
            if expected['virtual'] and vocabulary(database, name) != expected['vocabularySha256']:
                raise ValueError('Retained search vocabulary differs from bundle inventory')
        for name, expected in manifest.get('views', {}).items():
            digest = hashlib.sha256()
            count = 0
            for row in rows(database, name, view=True)[1]:
                hash_row(digest, row)
                count += 1
            if count != expected['count'] or digest.hexdigest() != expected['sha256']:
                raise ValueError('Retained compatibility view differs from bundle inventory')
        expected_sequences = [tuple(item) for item in manifest.get('sequences', [])]
        if expected_sequences and sequence_state(database, manifest['tables']) != expected_sequences:
            raise ValueError('Retained ID allocator differs from bundle inventory')
        verify_references(database, manifest['objects'])
    finally:
        database.close()


def protected_bundle_directory(directory, trusted_local_root=None):
    # Preserve the default boundary. An external backup is accepted only under
    # the explicit owner-selected root, never merely because it is local.
    root = Path(trusted_local_root) if trusted_local_root is not None else ROOT / '.private'
    if trusted_local_root is not None:
        if not root.is_absolute() or root.is_symlink() or not root.is_dir() or root.stat().st_mode & 0o077:
            raise ValueError('Trusted local root must be an absolute protected directory without links')
        if root.absolute() != root.resolve():
            raise ValueError('Trusted local root path must not contain symlinks')
    root = root.resolve()
    candidate = Path(directory).absolute()
    resolved = candidate.resolve()
    if root not in resolved.parents:
        raise ValueError('Recovery bundle must remain under ignored .private or the explicit trusted local root')
    try:
        relative = candidate.relative_to(root)
    except ValueError:
        raise ValueError('Recovery bundle path must remain under its protected root') from None
    current = root
    for part in relative.parts:
        current = current / part
        if (part in ('.', '..') or current.is_symlink() or not current.is_dir() or
                (trusted_local_root is not None and current.stat().st_mode & 0o077)):
            raise ValueError('Recovery bundle path has links or overly broad permissions')
    return resolved


def verify(directory, require_rehearsal=False, trusted_local_root=None):
    directory = protected_bundle_directory(directory, trusted_local_root)
    # A checksum is not authentication. Only use a bundle from a trusted,
    # protected source, never an uploaded or third-party SQL bundle.
    for item in [directory, *directory.rglob('*')]:
        if item.is_symlink() or item.stat().st_mode & 0o077:
            raise ValueError('Recovery bundle has links or overly broad permissions')
    manifest, digest, _ = verify_bundle(directory)
    verify_database(directory / 'database.sqlite', manifest)
    restored = directory / 'restored.sqlite'
    if require_rehearsal and not restored.is_file():
        raise ValueError('Independent restored database is required; run a fresh snapshot rehearsal')
    if restored.is_file():
        verify_database(restored, manifest)
    return {'status': 'passed', 'manifestSha256': digest,
            'verifiedAt': datetime.now(timezone.utc).isoformat(),
            'tablesVerified': len(manifest['tables']), 'objectsVerified': len(manifest['objects']),
            'rowsVerified': sum(item['count'] for item in manifest['tables'].values()),
            'independentRestoreVerified': restored.is_file(),
            'offsiteCopyVerified': False,
            'remoteFreshnessVerified': False,
            'keyEscrowVerified': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bundle', type=Path, required=True)
    parser.add_argument('--require-rehearsal', action='store_true')
    parser.add_argument('--trusted-local-root', type=Path,
                        help='Explicit protected owner-controlled backup root outside the repository')
    args = parser.parse_args()
    try:
        report = verify(args.bundle, args.require_rehearsal, args.trusted_local_root)
        # Summary contains no titles, source keys, owner identifiers, or secrets.
        print(json.dumps(report, indent=2))
    except Exception as error:
        # SQLite errors can include private identifiers; report only the class.
        print('Recovery verification failed (' + type(error).__name__ + ')', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    os.umask(0o077)
    sys.exit(main())
