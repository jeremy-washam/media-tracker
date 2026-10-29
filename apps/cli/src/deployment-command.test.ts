import { beforeEach, describe, expect, it, vi } from 'vitest'

const controls = vi.hoisted(() => ({
  files: ['index.html', 'assets', 'tmdb-logo.svg'],
  configured: true,
  built: true,
  unsafe: false,
  status: 0,
  spawn: vi.fn(),
}))
vi.mock('node:child_process', () => ({ spawnSync: controls.spawn }))
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync(path: string) {
      return path.endsWith('wrangler.production.jsonc') ? controls.configured : controls.built
    },
    readFileSync(path: string, encoding: 'utf8') {
      if (!path.endsWith('wrangler.production.jsonc')) return actual.readFileSync(path, encoding)
      const config = JSON.parse(
        actual.readFileSync(path.replace('production.jsonc', 'production.example.json'), 'utf8'),
      )
      return JSON.stringify({
        ...config,
        account_id: '1'.repeat(32),
        d1_databases: [
          { ...config.d1_databases[0], database_id: '11111111-1111-1111-1111-111111111111' },
        ],
        vars: {
          ...config.vars,
          AUTH_MODE: controls.unsafe ? 'local' : 'access',
          ACCESS_TEAM_DOMAIN: 'https://synthetic.cloudflareaccess.com',
          ACCESS_AUD: 'synthetic',
          OWNER_EMAIL: 'owner@example.com',
        },
      })
    },
    readdirSync() {
      return controls.files
    },
  }
})
import { runDeployment } from './deployment'

beforeEach(() => {
  controls.files = ['index.html', 'assets', 'tmdb-logo.svg']
  controls.configured = true
  controls.built = true
  controls.unsafe = false
  controls.status = 0
  controls.spawn.mockReset().mockReturnValue({ status: 0 })
})

describe('guarded deployment command', () => {
  it.each(['design.html', 'library-review.html', 'specimen.html', '__private__', 'export.json'])(
    'refuses unexpected production asset %s before spawning Wrangler',
    (file) => {
      controls.files.push(file)
      expect(() => runDeployment(['deploy', '--dry-run'])).toThrow('unexpected files')
      expect(controls.spawn).not.toHaveBeenCalled()
    },
  )
  it('refuses unconfigured, unbuilt and unsafe targets before invoking a subprocess', () => {
    controls.configured = false
    expect(() => runDeployment(['deploy'])).toThrow('Configure')
    controls.configured = true
    controls.built = false
    expect(() => runDeployment(['deploy'])).toThrow('Build')
    controls.built = true
    controls.unsafe = true
    expect(() => runDeployment(['deploy'])).toThrow('Unsafe')
    expect(controls.spawn).not.toHaveBeenCalled()
  })
  it('forwards only the explicit dry-run flag through the configured production guard', () => {
    runDeployment(['deploy', '--dry-run'])
    expect(controls.spawn).toHaveBeenCalledWith(
      'pnpm',
      expect.arrayContaining([
        'wrangler',
        'deploy',
        '--config',
        expect.stringMatching(/wrangler\.production\.jsonc$/),
        '--dry-run',
      ]),
      expect.objectContaining({ stdio: 'inherit' }),
    )
    controls.spawn.mockClear()
    expect(() => runDeployment(['deploy', '--env', 'other'])).toThrow('Unsupported')
    expect(controls.spawn).not.toHaveBeenCalled()
  })
  it('propagates subprocess launch and exit failures', () => {
    controls.spawn.mockReturnValue({ status: 1 })
    expect(() => runDeployment(['deploy', '--dry-run'])).toThrow('did not succeed')
    controls.spawn.mockReturnValue({ error: new Error('synthetic launch failure') })
    expect(() => runDeployment(['deploy', '--dry-run'])).toThrow('synthetic launch failure')
  })
})
