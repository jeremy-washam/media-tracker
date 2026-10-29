#!/usr/bin/env python3
"""Create credential-free loopback test settings in a fresh CI checkout."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VALUES = {
    'AUTH_MODE': 'local',
    'SYNC_ENABLED': 'false',
    'ARTICLE_CONTENT_ENABLED': 'false',
    'SPOTIFY_CATALOG_ENABLED': 'false',
    'CATALOG_AUTO_REFRESH': 'false',
    'MAINTENANCE_ENABLED': 'false',
    'OPERATING_MONITOR_ENABLED': 'false',
}


def prepare(root=ROOT):
    if any((root / path).exists() for path in ('.env.local', '.env', 'apps/api/.dev.vars')):
        raise ValueError('CI requires a fresh checkout without local credential files')
    destination = root / '.env.local'
    with open(destination, 'x', opener=lambda name, flags: os.open(name, flags, 0o600)) as stream:
        stream.write(''.join(name + '=' + value + '\n' for name, value in VALUES.items()))
    return destination


if __name__ == '__main__':
    prepare()
