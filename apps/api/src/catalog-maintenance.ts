import { createVideosRepository } from './env'
import type { Bindings } from './env'
import { jobUsage } from './usage-metrics'

export const MAINTENANCE_CRON = '*/5 * * * *'
export const MAINTENANCE_ROW_LIMIT = 1000

/** Local cache cleanup is independent of provider sync and never fetches providers. */
export async function maintainCatalog(env: Bindings): Promise<void> {
  const usage = jobUsage(env, 'catalog_maintenance')
  try {
    const result = await createVideosRepository(
      usage.env.DB,
      usage.env.DATABASE_USAGE_OBSERVER,
    ).maintainYoutubeCatalog(new Date().toISOString(), MAINTENANCE_ROW_LIMIT)
    console.info(
      JSON.stringify({
        level: 'info',
        event: 'catalog.maintenance_completed',
        ...result,
        rowLimit: MAINTENANCE_ROW_LIMIT,
      }),
    )
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'catalog.maintenance_failed',
        errorName: error instanceof Error ? error.name : 'UnknownError',
      }),
    )
  } finally {
    usage.report()
  }
}
