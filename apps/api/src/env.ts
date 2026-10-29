import type { SyncJob } from '@media-tracker/contracts'
import type { SyncBudget } from './sync-budget'
import {
  D1DatabaseClient,
  fenceCatalogDatabase,
  type CatalogLease,
  SqlArticlesRepository,
  SqlBooksRepository,
  SqlCanonicalLedgerRepository,
  SqlCatalogJobsRepository,
  SqlMoviesRepository,
  SqlSpotifyLibraryRepository,
  SqlSpotifyCatalogJobsRepository,
  SqlVideosRepository,
  type CanonicalLedgerRepository,
  type DatabaseUsageObserver,
} from '@media-tracker/db'

export interface Bindings extends Pick<WorkerBindings, 'ASSETS' | 'DB' | 'RAW_BUCKET'> {
  API_RATE_LIMITER?: WorkerBindings['API_RATE_LIMITER']
  WRITE_RATE_LIMITER?: WorkerBindings['WRITE_RATE_LIMITER']
  AUTH_MODE?: string
  ACCESS_TEAM_DOMAIN?: string
  ACCESS_AUD?: string
  OWNER_EMAIL?: string
  SYNC_ENABLED?: string
  SYNC_SOURCES?: string
  SYNC_BUDGET_UNTIL?: string
  SYNC_RETRY_SOURCE?: string
  SYNC_BUDGET?: SyncBudget
  SYNC_FETCH?: typeof fetch
  ARTICLE_CONTENT_ENABLED?: string
  SPOTIFY_CATALOG_ENABLED?: string
  CATALOG_AUTO_REFRESH?: string
  MAINTENANCE_ENABLED?: string
  DATABASE_USAGE_OBSERVER?: DatabaseUsageObserver
  CATALOG_LEASE?: CatalogLease
  HARDCOVER_TOKEN?: string
  LETTERBOXD_USERNAME?: string
  READWISE_TOKEN?: string
  SPOTIFY_CLIENT_ID?: string
  SPOTIFY_CLIENT_SECRET?: string
  SPOTIFY_REFRESH_TOKEN?: string
  TMDB_API_READ_TOKEN?: string
  TOKEN_ENCRYPTION_KEY?: string
  YOUTUBE_API_KEY?: string
  SYNC_QUEUE: Queue<SyncJob>
}

export interface AppEnv {
  Bindings: Bindings
  Variables: {
    requestId: string
    databaseUsageObserver: DatabaseUsageObserver
    databaseUsage: {
      statements: number
      measuredStatements: number
      rowsRead: number
      rowsWritten: number
      elapsedMs: number
      failedOperations: number
    }
  }
}

export function createLedgerRepository(
  database: D1Database,
  observer?: DatabaseUsageObserver,
  lease?: CatalogLease,
): CanonicalLedgerRepository {
  const client = new D1DatabaseClient(database, observer)
  return new SqlCanonicalLedgerRepository(lease ? fenceCatalogDatabase(client, lease) : client)
}

export function createArticlesRepository(
  database: D1Database,
  observer?: DatabaseUsageObserver,
): SqlArticlesRepository {
  return new SqlArticlesRepository(new D1DatabaseClient(database, observer))
}

export function createBooksRepository(
  database: D1Database,
  observer?: DatabaseUsageObserver,
): SqlBooksRepository {
  return new SqlBooksRepository(new D1DatabaseClient(database, observer))
}

export function createMoviesRepository(
  database: D1Database,
  observer?: DatabaseUsageObserver,
  lease?: CatalogLease,
): SqlMoviesRepository {
  const client = new D1DatabaseClient(database, observer)
  return new SqlMoviesRepository(lease ? fenceCatalogDatabase(client, lease) : client)
}

export function createSpotifyLibraryRepository(
  database: D1Database,
  observer?: DatabaseUsageObserver,
  lease?: CatalogLease,
): SqlSpotifyLibraryRepository {
  const client = new D1DatabaseClient(database, observer)
  return new SqlSpotifyLibraryRepository(lease ? fenceCatalogDatabase(client, lease) : client)
}

export function createSpotifyCatalogJobsRepository(
  database: D1Database,
  observer?: DatabaseUsageObserver,
): SqlSpotifyCatalogJobsRepository {
  return new SqlSpotifyCatalogJobsRepository(new D1DatabaseClient(database, observer))
}

export function createVideosRepository(
  database: D1Database,
  observer?: DatabaseUsageObserver,
  lease?: CatalogLease,
): SqlVideosRepository {
  const client = new D1DatabaseClient(database, observer)
  return new SqlVideosRepository(lease ? fenceCatalogDatabase(client, lease) : client)
}

export function createCatalogJobsRepository(
  database: D1Database,
  observer?: DatabaseUsageObserver,
): SqlCatalogJobsRepository {
  return new SqlCatalogJobsRepository(new D1DatabaseClient(database, observer))
}
