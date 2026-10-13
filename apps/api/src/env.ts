import type { SyncJob } from '@media-tracker/contracts'
import {
  D1DatabaseClient,
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
  CATALOG_AUTO_REFRESH?: string
  MAINTENANCE_ENABLED?: string
  DATABASE_USAGE_OBSERVER?: DatabaseUsageObserver
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
): CanonicalLedgerRepository {
  return new SqlCanonicalLedgerRepository(new D1DatabaseClient(database, observer))
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
): SqlMoviesRepository {
  return new SqlMoviesRepository(new D1DatabaseClient(database, observer))
}

export function createSpotifyLibraryRepository(
  database: D1Database,
  observer?: DatabaseUsageObserver,
): SqlSpotifyLibraryRepository {
  return new SqlSpotifyLibraryRepository(new D1DatabaseClient(database, observer))
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
): SqlVideosRepository {
  return new SqlVideosRepository(new D1DatabaseClient(database, observer))
}

export function createCatalogJobsRepository(
  database: D1Database,
  observer?: DatabaseUsageObserver,
): SqlCatalogJobsRepository {
  return new SqlCatalogJobsRepository(new D1DatabaseClient(database, observer))
}
