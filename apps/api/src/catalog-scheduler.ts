import type { Bindings } from './env'
import {
  createArticlesRepository,
  createLedgerRepository,
  createCatalogJobsRepository,
  createMoviesRepository,
  createVideosRepository,
  createSpotifyLibraryRepository,
  createSpotifyCatalogJobsRepository,
} from './env'
import { startTmdbCatalogRefresh } from './tmdb-catalog'
import { startYoutubeCatalogRefresh } from './youtube-catalog'
import { startSpotifyCatalogBackfill } from './spotify-catalog'
import {
  articleTargetsPerHour,
  catalogRefreshBefore,
  spotifyStaleBefore,
  tmdbMatcherVersion,
} from './catalog-policy'

/** The caller checks the shared emergency-stop gate before entering. These
 * tasks enqueue durable bounded work; neither browsing nor maintenance does. */
export async function scheduleCatalogWork(
  env: Bindings,
  at = new Date().toISOString(),
): Promise<void> {
  if (env.SYNC_ENABLED === 'false') return
  const tasks: Array<[string, () => Promise<unknown>]> = []
  if (env.CATALOG_AUTO_REFRESH === 'true' && env.TMDB_API_READ_TOKEN)
    tasks.push([
      'tmdb',
      async () => {
        const jobs = createCatalogJobsRepository(env.DB, env.DATABASE_USAGE_OBSERVER)
        const movies = createMoviesRepository(env.DB, env.DATABASE_USAGE_OBSERVER)
        if (
          (await jobs.findActive('tmdb')) ||
          (await movies.needsTmdbConfigurationRefresh(catalogRefreshBefore(at))) ||
          (
            await movies.listTmdbEnrichmentCandidates({
              at,
              refreshBefore: catalogRefreshBefore(at),
              retryBefore: new Date(Date.parse(at) - 90 * 86_400_000).toISOString(),
              matcherVersion: tmdbMatcherVersion,
              limit: 1,
            })
          ).length > 0
        )
          await startTmdbCatalogRefresh(env, at)
      },
    ])
  if (env.CATALOG_AUTO_REFRESH === 'true' && env.YOUTUBE_API_KEY)
    tasks.push([
      'youtube',
      async () => {
        const jobs = createCatalogJobsRepository(env.DB, env.DATABASE_USAGE_OBSERVER)
        if (
          (await jobs.findActive('youtube')) ||
          (
            await createVideosRepository(
              env.DB,
              env.DATABASE_USAGE_OBSERVER,
            ).listYoutubeCatalogCandidates({
              at,
              refreshBefore: catalogRefreshBefore(at),
              limit: 1,
            })
          ).length > 0
        )
          await startYoutubeCatalogRefresh(env, at)
      },
    ])
  if (
    env.SPOTIFY_CATALOG_ENABLED === 'true' &&
    env.SPOTIFY_CLIENT_ID &&
    env.SPOTIFY_REFRESH_TOKEN &&
    env.TOKEN_ENCRYPTION_KEY
  )
    tasks.push([
      'spotify',
      async () => {
        if (
          await createSpotifyCatalogJobsRepository(env.DB, env.DATABASE_USAGE_OBSERVER).findActive()
        ) {
          await startSpotifyCatalogBackfill(env, at)
          return
        }
        const backlog = await createSpotifyLibraryRepository(
          env.DB,
          env.DATABASE_USAGE_OBSERVER,
        ).catalogBacklogCounts(spotifyStaleBefore(at))
        if (backlog.tracks > 0 || backlog.episodes > 0) await startSpotifyCatalogBackfill(env, at)
      },
    ])
  if (env.ARTICLE_CONTENT_ENABLED === 'true' && env.READWISE_TOKEN)
    tasks.push(['article_content', () => scheduleArticleContent(env, at)])
  // One provider's outage must not starve unrelated scheduled work. Requests
  // themselves run in queue deliveries, under the shared circuit breaker.
  for (const [provider, task] of tasks) {
    try {
      await task()
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'catalog.schedule_failed',
          provider,
          errorName: error instanceof Error ? error.name : 'UnknownError',
        }),
      )
    }
  }
}

export async function scheduleArticleContent(
  env: Bindings,
  at = new Date().toISOString(),
): Promise<void> {
  const connection = await createLedgerRepository(
    env.DB,
    env.DATABASE_USAGE_OBSERVER,
  ).findConnectionBySource('readwise')
  if (connection === null) return
  const reservationId = `article-content:${at.slice(0, 13)}`
  const targets = await createArticlesRepository(
    env.DB,
    env.DATABASE_USAGE_OBSERVER,
  ).reserveContentTargets(connection.id, reservationId, at, articleTargetsPerHour)
  for (let index = 0; index < targets.length; index++) {
    const target = targets[index]!
    await env.SYNC_QUEUE.send(
      {
        idempotencyKey: `readwise-content:${target.connectionId}:${target.documentId}:${target.sourceUpdatedAt ?? 'unknown'}:a1:e1`,
        source: 'readwise',
        operation: 'acquire_article_content',
        connectionId: target.connectionId,
        documentId: target.documentId,
      },
      { delaySeconds: index * 6 },
    )
  }
}
