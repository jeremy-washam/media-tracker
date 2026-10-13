import { describe, expect, it } from 'vitest'
import { productionConfiguration, validateProductionConfiguration } from './deployment'

const settings = {
  accountId: '1'.repeat(32),
  databaseId: '11111111-1111-1111-1111-111111111111',
  teamDomain: 'https://synthetic.cloudflareaccess.com',
  audience: 'synthetic-app',
  ownerEmail: 'owner@example.com',
}

describe('deployment safeguards', () => {
  it('starts with private assets, disabled previews and paused background work', () => {
    const configuration = productionConfiguration(settings)
    expect(() => validateProductionConfiguration(configuration)).not.toThrow()
    expect(configuration.vars.SYNC_ENABLED).toBe('false')
    expect(configuration.queues.consumers).toEqual([])
    expect(configuration.triggers.crons).toEqual([])
  })
  it('rejects missing identity and placeholder resources', () => {
    expect(() => productionConfiguration({ ...settings, ownerEmail: '' })).toThrow()
    expect(() =>
      productionConfiguration({ ...settings, databaseId: '00000000-0000-0000-0000-000000000000' }),
    ).toThrow()
  })
  it.each(['AUTH_MODE', 'SYNC_ENABLED'])('rejects unsafe %s', (key) => {
    const configuration = productionConfiguration(settings)
    configuration.vars[key] = 'local'
    expect(() => validateProductionConfiguration(configuration)).toThrow()
  })
  it('rejects asset bypass and consumers during the paused cutover', () => {
    const configuration = productionConfiguration(settings)
    configuration.assets.run_worker_first = false
    expect(() => validateProductionConfiguration(configuration)).toThrow()
    configuration.assets.run_worker_first = true
    configuration.queues.consumers.push({ queue: 'media-tracker-sync' })
    expect(() => validateProductionConfiguration(configuration)).toThrow()
  })
  it('rejects missing limiters, enlarged limits and shared counters', () => {
    for (const change of [
      (config: ReturnType<typeof productionConfiguration>) => (config.ratelimits = []),
      (config: ReturnType<typeof productionConfiguration>) => (config.limits.cpu_ms = 30001),
      (config: ReturnType<typeof productionConfiguration>) =>
        (config.ratelimits[0].simple.limit = 121),
      (config: ReturnType<typeof productionConfiguration>) =>
        (config.ratelimits[1].namespace_id = config.ratelimits[0].namespace_id),
    ]) {
      const configuration = productionConfiguration(settings)
      change(configuration)
      expect(() => validateProductionConfiguration(configuration)).toThrow()
    }
  })
})
