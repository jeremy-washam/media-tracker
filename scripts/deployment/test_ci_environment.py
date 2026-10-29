from pathlib import Path
import tempfile
import unittest

import ci_environment


class CiEnvironmentTests(unittest.TestCase):
    def test_loopback_settings_have_no_credentials_and_disable_background_work(self):
        with tempfile.TemporaryDirectory() as directory:
            path = ci_environment.prepare(Path(directory))
            values = dict(line.split('=', 1) for line in path.read_text().splitlines())
            self.assertEqual(values.pop('AUTH_MODE'), 'local')
            self.assertTrue(all(value == 'false' for value in values.values()))
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(ValueError):
                ci_environment.prepare(Path(directory))

    def test_existing_credentials_are_never_overwritten_or_used(self):
        for name in ['.env', '.env.local', 'apps/api/.dev.vars']:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('synthetic-private-sentinel')
                with self.assertRaises(ValueError):
                    ci_environment.prepare(root)
                self.assertEqual(path.read_text(), 'synthetic-private-sentinel')


if __name__ == '__main__':
    unittest.main()
