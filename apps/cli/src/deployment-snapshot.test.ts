import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it('restores deployment bundles and rejects corrupt evidence, exports and paths', () => {
  const result = spawnSync(
    'python3',
    ['-m', 'unittest', 'discover', '-s', 'scripts/deployment', '-p', 'test_*.py'],
    {
      cwd: fileURLToPath(new URL('../../../', import.meta.url)),
      encoding: 'utf8',
    },
  )
  expect(result.error).toBeUndefined()
  expect(result.status, result.stderr).toBe(0)
}, 30_000)
