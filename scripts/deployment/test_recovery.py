from pathlib import Path
import shutil
import sqlite3
import tempfile
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

    def external_copy(self):
        temporary = tempfile.TemporaryDirectory(dir=Path('/private/tmp') if Path('/private/tmp').is_dir() else None)
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name).resolve()
        root.chmod(0o700)
        rehearse(self.fixture.output)
        bundle = root / 'retained'
        shutil.copytree(self.fixture.output, bundle)
        return root, bundle

    def test_external_copy_requires_explicit_protected_trusted_root(self):
        root, bundle = self.external_copy()
        with self.assertRaisesRegex(ValueError, 'trusted local root'):
            recovery.verify(bundle, True)
        original = recovery.verify(self.fixture.output, True)
        external = recovery.verify(bundle, True, trusted_local_root=root)
        self.assertEqual(external['manifestSha256'], original['manifestSha256'])
        self.assertTrue(external['independentRestoreVerified'])
        self.assertFalse(external['offsiteCopyVerified'])

    def test_trusted_root_cannot_be_broad_or_symlinked(self):
        root, bundle = self.external_copy()
        root.chmod(0o755)
        with self.assertRaisesRegex(ValueError, 'protected directory'):
            recovery.verify(bundle, True, trusted_local_root=root)
        root.chmod(0o700)
        link = self.fixture.root / 'external-root-link'
        link.symlink_to(root, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'without links'):
            recovery.verify(link / 'retained', True, trusted_local_root=link)

    def test_bundle_cannot_escape_trusted_root_or_follow_nested_directory_links(self):
        root, bundle = self.external_copy()
        unrelated = root / 'other'
        unrelated.mkdir(mode=0o700)
        with self.assertRaisesRegex(ValueError, 'trusted local root'):
            recovery.verify(bundle, True, trusted_local_root=unrelated)
        link = root / 'linked-bundle'
        link.symlink_to(bundle, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'links'):
            recovery.verify(link, True, trusted_local_root=root)
        link.unlink()
        intermediate = root / 'nested'
        intermediate.mkdir(mode=0o755)
        intermediate.chmod(0o755)
        nested_bundle = intermediate / 'retained'
        shutil.copytree(bundle, nested_bundle)
        with self.assertRaisesRegex(ValueError, 'permissions'):
            recovery.verify(nested_bundle, True, trusted_local_root=root)

    def test_external_copy_still_checks_checksums_and_independent_restore(self):
        root, bundle = self.external_copy()
        (bundle / 'restored.sqlite').unlink()
        with self.assertRaisesRegex(ValueError, 'Independent restored'):
            recovery.verify(bundle, True, trusted_local_root=root)
        import json
        manifest = json.loads((bundle / 'manifest.json').read_text())
        (bundle / next(iter(manifest['objects'].values()))['path']).write_bytes(b'corrupt')
        with self.assertRaisesRegex(ValueError, 'checksum'):
            recovery.verify(bundle, trusted_local_root=root)


if __name__ == '__main__':
    unittest.main()
