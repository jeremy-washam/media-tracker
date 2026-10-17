import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const configurationPath = resolve(root, 'apps/api/wrangler.production.jsonc')
const templatePath = resolve(root, 'apps/api/wrangler.production.example.json')

interface ProductionSettings {
  accountId: string
  databaseId: string
  teamDomain: string
  audience: string
  ownerEmail: string
}

export function productionConfiguration(settings: ProductionSettings) {
  if (!/^[a-f\d]{32}$/i.test(settings.accountId) || /^0{32}$/.test(settings.accountId))
    throw new Error('Invalid account ID')
  if (
    !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(settings.databaseId) ||
    settings.databaseId === '00000000-0000-0000-0000-000000000000'
  )
    throw new Error('Invalid production database ID')
  if (!/^https:\/\/[a-z\d-]+\.cloudflareaccess\.com$/i.test(settings.teamDomain))
    throw new Error('Invalid Cloudflare Access team domain')
  if (!settings.audience.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.ownerEmail))
    throw new Error('Access audience and owner email are required')
  const configuration = JSON.parse(readFileSync(templatePath, 'utf8'))
  configuration.account_id = settings.accountId
  configuration.d1_databases[0].database_id = settings.databaseId
  configuration.vars.ACCESS_TEAM_DOMAIN = settings.teamDomain
  configuration.vars.ACCESS_AUD = settings.audience
  configuration.vars.OWNER_EMAIL = settings.ownerEmail
  return configuration
}

export function validateProductionConfiguration(
  configuration: ReturnType<typeof productionConfiguration>,
) {
  productionConfiguration({
    accountId: configuration.account_id ?? '',
    databaseId: configuration.d1_databases?.[0]?.database_id ?? '',
    teamDomain: configuration.vars?.ACCESS_TEAM_DOMAIN ?? '',
    audience: configuration.vars?.ACCESS_AUD ?? '',
    ownerEmail: configuration.vars?.OWNER_EMAIL ?? '',
  })
  if (
    configuration.name !== 'media-tracker' ||
    configuration.vars.AUTH_MODE !== 'access' ||
    configuration.preview_urls !== false ||
    configuration.assets.run_worker_first !== true ||
    configuration.assets.directory !== '../web/dist-production'
  )
    throw new Error('Unsafe production configuration')
  if (configuration.vars.SYNC_ENABLED !== 'true' && configuration.vars.SYNC_ENABLED !== 'false')
    throw new Error('Explicit SYNC_ENABLED configuration is required')
  if (
    !Number.isInteger(configuration.limits?.cpu_ms) ||
    configuration.limits.cpu_ms < 1 ||
    configuration.limits.cpu_ms > 30000
  )
    throw new Error('Production CPU limit must be between 1 and 30000 milliseconds')
  const namespaces = new Set<string>()
  for (const [name, maximum] of [
    ['API_RATE_LIMITER', 120],
    ['WRITE_RATE_LIMITER', 10],
  ] as const) {
    const matches = configuration.ratelimits?.filter(
      (binding: { name: string }) => binding.name === name,
    )
    const binding = matches?.[0]
    if (
      matches?.length !== 1 ||
      !/^[1-9]\d*$/.test(binding?.namespace_id ?? '') ||
      namespaces.has(binding.namespace_id) ||
      binding.simple?.period !== 60 ||
      !Number.isInteger(binding.simple.limit) ||
      binding.simple.limit < 1 ||
      binding.simple.limit > maximum
    )
      throw new Error(`Missing or unsafe ${name} configuration`)
    namespaces.add(binding.namespace_id)
  }
  if (!['true', 'false'].includes(configuration.vars.MAINTENANCE_ENABLED))
    throw new Error('Explicit MAINTENANCE_ENABLED configuration is required')
  if (configuration.vars.SYNC_ENABLED === 'true') {
    const sources = (configuration.vars.SYNC_SOURCES ?? '').split(',')
    const until = Date.parse(configuration.vars.SYNC_BUDGET_UNTIL ?? '')
    if (
      sources.length === 0 ||
      new Set(sources).size !== sources.length ||
      sources.some(
        (source: string) => !['readwise', 'hardcover', 'letterboxd', 'spotify'].includes(source),
      ) ||
      !Number.isFinite(until) ||
      until <= Date.now() ||
      until > Date.now() + 24 * 60 * 60_000
    )
      throw new Error(
        'Source rollout requires explicit sources and an included-usage grant lasting at most 24 hours',
      )
    if (
      configuration.vars.ARTICLE_CONTENT_ENABLED !== 'false' ||
      configuration.vars.SPOTIFY_CATALOG_ENABLED !== 'false' ||
      configuration.vars.CATALOG_AUTO_REFRESH !== 'false' ||
      configuration.vars.MAINTENANCE_ENABLED !== 'false' ||
      configuration.queues.consumers.length !== 1 ||
      configuration.queues.consumers[0]?.queue !== 'media-tracker-sync' ||
      configuration.queues.consumers[0]?.max_batch_size !== 1 ||
      configuration.queues.consumers[0]?.max_concurrency !== 1 ||
      configuration.queues.consumers[0]?.max_retries !== 1 ||
      configuration.triggers.crons.length > 1 ||
      configuration.triggers.crons.some((cron: string) => cron !== '0 * * * *')
    )
      throw new Error(
        'Source rollout requires one bounded source consumer; content, catalog and maintenance remain paused',
      )
    if (
      configuration.vars.SYNC_RETRY_SOURCE &&
      !sources.includes(configuration.vars.SYNC_RETRY_SOURCE)
    )
      throw new Error('Controlled retry must name an explicitly enabled source')
  }
  if (configuration.vars.SYNC_ENABLED === 'false') {
    const crons = configuration.triggers.crons
    if (
      configuration.queues.consumers.length ||
      crons.length > 1 ||
      crons.some((cron: string) => cron !== '*/5 * * * *') ||
      (crons.length && configuration.vars.MAINTENANCE_ENABLED !== 'true')
    )
      throw new Error('Paused deployment permits only explicitly enabled cache maintenance')
  }
}

export function runDeployment(args: string[]) {
  if (args[0] === 'configure') {
    if (!args[1]) throw new Error('Pass a private JSON settings file')
    if (existsSync(configurationPath))
      throw new Error('Production config already exists; edit it deliberately')
    const configuration = productionConfiguration(
      JSON.parse(readFileSync(resolve(root, args[1]), 'utf8')),
    )
    validateProductionConfiguration(configuration)
    writeFileSync(configurationPath, `${JSON.stringify(configuration, null, 2)}\n`, {
      mode: 0o600,
      flag: 'wx',
    })
    console.log('Created ignored production configuration; sync remains paused.')
    return
  }
  if (args[0] !== 'deploy')
    throw new Error('Use deployment configure <settings.json> or deployment deploy [--dry-run]')
  if (args.slice(1).some((argument) => argument !== '--dry-run'))
    throw new Error('Unsupported deployment argument')
  if (!existsSync(configurationPath)) throw new Error('Configure the production target first')
  const configuration = JSON.parse(readFileSync(configurationPath, 'utf8'))
  validateProductionConfiguration(configuration)
  const output = resolve(root, 'apps/web/dist-production')
  const allowed = new Set(['index.html', 'assets', 'tmdb-logo.svg'])
  if (
    !existsSync(resolve(output, 'index.html')) ||
    readdirSync(output).some((name) => !allowed.has(name))
  )
    throw new Error('Build the production assets first; unexpected files cannot be deployed')
  const result = spawnSync(
    'pnpm',
    [
      '--filter',
      '@media-tracker/api',
      'exec',
      'wrangler',
      'deploy',
      '--config',
      configurationPath,
      ...args.slice(1),
    ],
    { cwd: root, stdio: 'inherit' },
  )
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error('Deployment did not succeed')
}
