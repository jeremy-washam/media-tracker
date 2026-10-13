import hashlib
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from snapshot import ROOT, create_bundle, rehearse


class SnapshotTests(unittest.TestCase):
    def setUp(self):
        directory = ROOT / '.private/deployment/tests'
        directory.mkdir(parents=True, exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(dir=directory)
        self.root = Path(self.temporary.name)
        self.database = self.root / 'source.sqlite'
        self.metadata = self.root / 'r2.sqlite'
        self.blobs = self.root / 'blobs'
        self.blobs.mkdir()
        self.output = self.root / 'bundle'
        text = 'élan apples; quoted "evidence"\nsecond paragraph'.encode()
        self.text_hash = hashlib.sha256(text).hexdigest()
        (self.blobs / 'synthetic-blob').write_bytes(text)
        meta = sqlite3.connect(self.metadata)
        meta.executescript('CREATE TABLE _mf_objects(key TEXT PRIMARY KEY,blob_id TEXT,size INTEGER,http_metadata TEXT,custom_metadata TEXT);')
        meta.execute('INSERT INTO _mf_objects VALUES(?,?,?,?,?)', ('content/text', 'synthetic-blob', len(text), '{}', '{}'))
        meta.commit()
        meta.close()
        db = sqlite3.connect(self.database)
        db.executescript('''
          CREATE TABLE records(id TEXT PRIMARY KEY,content TEXT,blob BLOB);
          CREATE TABLE raw_objects(id TEXT PRIMARY KEY,storage_key TEXT,sha256 TEXT);
          CREATE TABLE article_content_manifests(id TEXT PRIMARY KEY,extracted_object_key TEXT,extracted_sha256 TEXT);
          CREATE TABLE article_content_chunks(manifest_id TEXT REFERENCES article_content_manifests(id),ordinal INTEGER,byte_start INTEGER,byte_length INTEGER,sha256 TEXT,PRIMARY KEY(manifest_id,ordinal));
          CREATE TABLE article_content_search_map(rowid INTEGER PRIMARY KEY,manifest_id TEXT,chunk_ordinal INTEGER,FOREIGN KEY(manifest_id,chunk_ordinal) REFERENCES article_content_chunks(manifest_id,ordinal));
          CREATE VIRTUAL TABLE metadata_search USING fts5(id UNINDEXED,content);
          CREATE VIRTUAL TABLE article_content_search USING fts5(manifest_id UNINDEXED,chunk_ordinal UNINDEXED,content,content='');
          CREATE TRIGGER immutable_records BEFORE UPDATE ON records BEGIN SELECT RAISE(ABORT,'immutable'); END;
        ''')
        db.execute('INSERT INTO records VALUES(?,?,?)', ('synthetic', "quoted';\n\x00 unicode é", b'\x00\xff'))
        db.execute('INSERT INTO records VALUES(?,?,?)', ('crlf', 'first\r\nsecond\rthird', None))
        db.execute('INSERT INTO raw_objects VALUES(?,?,?)', ('raw', 'content/text', self.text_hash))
        db.execute('INSERT INTO article_content_manifests VALUES(?,?,?)', ('manifest', 'content/text', self.text_hash))
        db.execute('INSERT INTO article_content_chunks VALUES(?,?,?,?,?)', ('manifest', 0, 0, len(text), self.text_hash))
        db.execute('INSERT INTO article_content_search_map VALUES(?,?,?)', (7, 'manifest', 0))
        db.execute('INSERT INTO metadata_search(rowid,id,content) VALUES(?,?,?)', (9, 'synthetic', 'metadata phrase'))
        db.execute('INSERT INTO article_content_search(rowid,manifest_id,chunk_ordinal,content) VALUES(?,?,?,?)', (7, 'manifest', 0, text.decode()))
        db.commit()
        db.close()

    def tearDown(self):
        self.temporary.cleanup()

    def bundle(self):
        return create_bundle(self.database, self.metadata, self.blobs, self.output)

    def test_restore_preserves_records_provenance_and_contentless_search(self):
        manifest = self.bundle()
        report = rehearse(self.output)
        self.assertEqual(report['status'], 'passed')
        self.assertEqual(manifest['version'], 2)
        self.assertEqual(report['backupsVerified'], 2)
        self.assertEqual(set(manifest['backups']), {'database.sqlite', 'r2-metadata.sqlite'})
        self.assertEqual(report['referencesVerified'], 2)
        self.assertEqual(report['tablesVerified'], 7)
        db = sqlite3.connect(self.output / 'restored.sqlite')
        self.assertEqual(db.execute("SELECT rowid FROM article_content_search WHERE article_content_search MATCH 'apples'").fetchall(), [(7,)])
        self.assertEqual(db.execute("SELECT rowid FROM metadata_search WHERE metadata_search MATCH 'phrase'").fetchall(), [(9,)])
        self.assertEqual(db.execute("SELECT blob FROM records WHERE id='synthetic'").fetchone()[0], b'\x00\xff')
        self.assertEqual(db.execute("SELECT content FROM records WHERE id='crlf'").fetchone()[0], 'first\r\nsecond\rthird')
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("UPDATE records SET content='modified'")
        db.close()
        self.assertNotIn('metadata_search_data', manifest['tables'])

    def test_restores_compatibility_views_and_their_write_triggers(self):
        db = sqlite3.connect(self.database)
        db.executescript("""
          CREATE TABLE compact_links(id TEXT UNIQUE, owner_key INTEGER, role TEXT, linked_at TEXT, PRIMARY KEY(owner_key,role)) WITHOUT ROWID;
          INSERT INTO compact_links VALUES('original',7,'time','2026-10-01');
          CREATE VIEW public_links AS SELECT id,printf('owner-%d',owner_key) AS owner_id,role,linked_at FROM compact_links;
          CREATE TRIGGER public_link_insert INSTEAD OF INSERT ON public_links BEGIN
            INSERT INTO compact_links VALUES(NEW.id,CAST(substr(NEW.owner_id,7) AS INTEGER),NEW.role,NEW.linked_at);
          END;
          CREATE TRIGGER public_link_immutable INSTEAD OF UPDATE ON public_links BEGIN SELECT RAISE(ABORT,'immutable'); END;
        """)
        db.close()
        manifest = self.bundle()
        self.assertNotIn('public_links', manifest['tables'])
        self.assertEqual(manifest['views']['public_links']['count'], 1)
        self.assertEqual(rehearse(self.output)['viewsVerified'], 1)
        db = sqlite3.connect(self.output / 'restored.sqlite')
        self.assertEqual(db.execute('SELECT * FROM public_links').fetchall(), [('original','owner-7','time','2026-10-01')])
        db.execute("INSERT INTO public_links VALUES('new','owner-8','admission','2026-10-02')")
        self.assertEqual(db.execute('SELECT count(*) FROM compact_links').fetchone()[0], 2)
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'immutable'):
            db.execute("UPDATE public_links SET linked_at='2026-10-03'")
        db.close()

    def test_installs_explicit_unique_parent_indexes_before_restoring_children(self):
        db = sqlite3.connect(self.database)
        db.executescript("""
          CREATE TABLE parents(id TEXT PRIMARY KEY,storage_id INTEGER);
          CREATE UNIQUE INDEX parent_storage_key ON parents(storage_id);
          CREATE TABLE evidence(id TEXT PRIMARY KEY,parent_key INTEGER NOT NULL REFERENCES parents(storage_id));
          INSERT INTO parents VALUES('retained',7);
          INSERT INTO evidence VALUES('link',7);
        """)
        db.close()
        manifest = self.bundle()
        self.assertIn('CREATE UNIQUE INDEX parent_storage_key', (self.output / manifest['schema']['path']).read_text())
        self.assertNotIn('CREATE UNIQUE INDEX parent_storage_key', (self.output / manifest['indexes']['path']).read_text())
        self.assertEqual(rehearse(self.output)['status'], 'passed')
        db = sqlite3.connect(self.output / 'restored.sqlite')
        db.execute('PRAGMA foreign_keys=ON')
        self.assertEqual(db.execute('SELECT * FROM evidence').fetchall(), [('link',7)])
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("INSERT INTO evidence VALUES('missing',8)")
        db.close()

    def test_rejects_missing_r2_evidence(self):
        (self.blobs / 'synthetic-blob').unlink()
        with self.assertRaisesRegex(ValueError, 'missing'):
            self.bundle()

    def test_preserves_search_and_reports_existing_chunk_hash_mismatch(self):
        db = sqlite3.connect(self.database)
        db.execute("UPDATE article_content_chunks SET sha256='wrong'")
        db.commit()
        db.close()
        manifest = self.bundle()
        self.assertEqual(manifest['tables']['article_content_search']['existingChunkHashMismatches'], 1)
        self.assertEqual(rehearse(self.output)['existingArticleChunkHashMismatches'], 1)

    def test_rejects_corrupt_export_before_restore(self):
        manifest = self.bundle()
        (self.output / manifest['data'][0]['path']).write_text('SELECT 1;')
        with self.assertRaisesRegex(ValueError, 'checksum'):
            rehearse(self.output)

    def test_rejects_corrupt_retained_backups_before_restore(self):
        self.bundle()
        for name in ('database.sqlite', 'r2-metadata.sqlite'):
            with self.subTest(backup=name):
                path = self.output / name
                original = path.read_bytes()
                # Preserve length so the digest, not just the size, detects damage.
                path.write_bytes(b'corrupt!' + original[8:])
                with self.assertRaisesRegex(ValueError, 'checksum'):
                    rehearse(self.output)
                self.assertFalse((self.output / 'restored.sqlite').exists())
                self.assertFalse((self.output / 'rehearsal.json').exists())
                path.write_bytes(original)

    def test_rejects_deleted_retained_backups_before_restore(self):
        self.bundle()
        for name in ('database.sqlite', 'r2-metadata.sqlite'):
            with self.subTest(backup=name):
                path = self.output / name
                original = path.read_bytes()
                path.unlink()
                with self.assertRaisesRegex(ValueError, 'checksum'):
                    rehearse(self.output)
                self.assertFalse((self.output / 'restored.sqlite').exists())
                self.assertFalse((self.output / 'rehearsal.json').exists())
                path.write_bytes(original)

    def test_rejects_legacy_manifests_without_strict_backup_verification(self):
        manifest = self.bundle()
        manifest['version'] = 1
        del manifest['backups']
        (self.output / 'manifest.json').write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, 'version 2'):
            rehearse(self.output)
        self.assertFalse((self.output / 'restored.sqlite').exists())

    def test_requires_hashes_for_both_retained_backups(self):
        manifest = self.bundle()
        for name in ('database.sqlite', 'r2-metadata.sqlite'):
            with self.subTest(backup=name):
                digest = manifest['backups'][name].pop('sha256')
                (self.output / 'manifest.json').write_text(json.dumps(manifest))
                with self.assertRaisesRegex(ValueError, 'both retained SQLite backup hashes'):
                    rehearse(self.output)
                self.assertFalse((self.output / 'restored.sqlite').exists())
                manifest['backups'][name]['sha256'] = digest

    def test_failed_data_file_rolls_back_its_rows_and_keeps_prior_files_committed(self):
        manifest = self.bundle()
        statements = [
            f"INSERT INTO article_content_manifests VALUES('committed','content/text','{self.text_hash}');\n",
            f"INSERT INTO article_content_chunks VALUES('committed',0,0,1,'{self.text_hash}');\n"
            "INSERT INTO article_content_search_map VALUES(99,'missing',0);\n",
        ]
        manifest['data'] = []
        for index, sql in enumerate(statements):
            path = self.output / 'data' / f'{index:05d}.sql'
            contents = sql.encode()
            path.write_bytes(contents)
            manifest['data'].append({'path': str(path.relative_to(self.output)), 'sha256': hashlib.sha256(contents).hexdigest(), 'bytes': len(contents)})
        (self.output / 'manifest.json').write_text(json.dumps(manifest))
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'FOREIGN KEY'):
            rehearse(self.output)
        db = sqlite3.connect(self.output / 'restored.sqlite')
        try:
            self.assertEqual(db.execute('SELECT id FROM article_content_manifests').fetchall(), [('committed',)])
            self.assertEqual(db.execute('SELECT count(*) FROM article_content_chunks').fetchone()[0], 0)
            self.assertEqual(db.execute('SELECT count(*) FROM article_content_search_map').fetchone()[0], 0)
        finally:
            db.close()
        self.assertFalse((self.output / 'rehearsal.json').exists())
        # Resume support remains deferred; retries must never report a partial
        # destination as a successful complete restore.
        with self.assertRaisesRegex(ValueError, 'Restore target already exists'):
            rehearse(self.output)

    def test_rejects_live_journals(self):
        Path(str(self.database) + '-wal').write_bytes(b'pending')
        with self.assertRaisesRegex(ValueError, 'journal'):
            self.bundle()

    def test_refuses_to_overwrite_a_bundle(self):
        self.bundle()
        with self.assertRaisesRegex(ValueError, 'already exists'):
            self.bundle()

    def test_rejects_bundle_path_traversal(self):
        self.bundle()
        path = self.output / 'manifest.json'
        manifest = json.loads(path.read_text())
        manifest['schema']['path'] = '../source.sqlite'
        path.write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, 'path validation'):
            rehearse(self.output)

    def test_retains_deleted_row_allocator_state(self):
        db = sqlite3.connect(self.database)
        db.executescript('CREATE TABLE events(id INTEGER PRIMARY KEY AUTOINCREMENT); INSERT INTO events DEFAULT VALUES; INSERT INTO events DEFAULT VALUES; DELETE FROM events WHERE id=2;')
        db.close()
        self.bundle()
        self.assertEqual(rehearse(self.output)['sequencesVerified'], 1)
        db = sqlite3.connect(self.output / 'restored.sqlite')
        db.execute('INSERT INTO events DEFAULT VALUES')
        self.assertEqual(db.execute('SELECT max(id) FROM events').fetchone()[0], 3)
        db.close()


if __name__ == '__main__':
    unittest.main()
