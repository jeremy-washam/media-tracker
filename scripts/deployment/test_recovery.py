from pathlib import Path
import sqlite3
import unittest

import recovery
import test_snapshot
from snapshot import rehearse


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        # Reuse the existing deliberately synthetic provenance/contentless-FTS
        # fixture. This never opens a real account export or private database.
        self.fixture = test_snapshot.SnapshotTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.tearDown)
        self.fixture.bundle()

    def test_backup_and_independent_restore_are_separate_claims(self):
        first = recovery.verify(self.fixture.output)
        self.assertEqual(first['status'], 'passed')
        self.assertFalse(first['independentRestoreVerified'])
        self.assertFalse(first['offsiteCopyVerified'])
        self.assertFalse(first['remoteFreshnessVerified'])
        with self.assertRaisesRegex(ValueError, 'Independent restored'):
            recovery.verify(self.fixture.output, True)
        rehearse(self.fixture.output)
        second = recovery.verify(self.fixture.output, True)
        self.assertTrue(second['independentRestoreVerified'])
        self.assertEqual(first['manifestSha256'], second['manifestSha256'])

    def test_detects_modified_restored_contentless_search(self):
        rehearse(self.fixture.output)
        db = sqlite3.connect(self.fixture.output / 'restored.sqlite')
        db.execute("INSERT INTO article_content_search(article_content_search) VALUES('delete-all')")
        db.execute("INSERT INTO article_content_search(rowid,manifest_id,chunk_ordinal,content) VALUES(7,'manifest',0,'different tokens')")
        db.commit()
        db.close()
        with self.assertRaisesRegex(ValueError, 'vocabulary'):
            recovery.verify(self.fixture.output, True)

    def test_detects_corrupt_raw_object_without_copy_or_restore(self):
        manifest = self.fixture.output / 'manifest.json'
        import json
        data = json.loads(manifest.read_text())
        blob = self.fixture.output / next(iter(data['objects'].values()))['path']
        blob.write_bytes(b'corrupt')
        with self.assertRaisesRegex(ValueError, 'checksum'):
            recovery.verify(self.fixture.output)
        self.assertFalse((self.fixture.output / 'restored.sqlite').exists())

    def test_refuses_broad_permissions_and_symlinks(self):
        manifest = self.fixture.output / 'manifest.json'
        manifest.chmod(0o644)
        with self.assertRaisesRegex(ValueError, 'permissions'):
            recovery.verify(self.fixture.output)
        manifest.chmod(0o600)
        link = self.fixture.output / 'unexpected-link'
        link.symlink_to(Path('/tmp'))
        with self.assertRaisesRegex(ValueError, 'links'):
            recovery.verify(self.fixture.output)

    def test_detects_unexpected_restored_schema(self):
        rehearse(self.fixture.output)
        db = sqlite3.connect(self.fixture.output / 'restored.sqlite')
        db.execute('CREATE TABLE unreviewed(value TEXT)')
        db.close()
        with self.assertRaisesRegex(ValueError, 'table inventory'):
            recovery.verify(self.fixture.output, True)


if __name__ == '__main__':
    unittest.main()
