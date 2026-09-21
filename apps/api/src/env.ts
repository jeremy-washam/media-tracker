import type { SyncJob } from '@media-tracker/contracts'
import {
  D1DatabaseClient,
  SqlArticlesRepository,
  SqlBooksRepository,
  SqlCanonicalLedgerRepository,
  SqlCatalogJobsRepository,
  SqlMoviesRepository,
  SqlSpotifyLibraryRepository,
  SqlVideosRepository,
  type CanonicalLedgerRepository,
} from '@media-tracker/db'

export interface Bindings {
  ASSETS: Fetcher
  CATALOG_AUTO_REFRESH?: string
  DB: D1Database
  HARDCOVER_TOKEN?: string
  LETTERBOXD_USERNAME?: string
  RAW_BUCKET: R2Bucket
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
  }
}

export function createLedgerRepository(database: D1Database): CanonicalLedgerRepository {
  return new SqlCanonicalLedgerRepository(new D1DatabaseClient(database))
}

export function createArticlesRepository(database: D1Database): SqlArticlesRepository {
  return new SqlArticlesRepository(new D1DatabaseClient(database))
}

export function createBooksRepository(database: D1Database): SqlBooksRepository {
  return new SqlBooksRepository(new D1DatabaseClient(database))
}

export function createMoviesRepository(database: D1Database): SqlMoviesRepository {
  return new SqlMoviesRepository(new D1DatabaseClient(database))
}

export function createSpotifyLibraryRepository(database: D1Database): SqlSpotifyLibraryRepository {
  return new SqlSpotifyLibraryRepository(new D1DatabaseClient(database))
}

export function createVideosRepository(database: D1Database): SqlVideosRepository {
  return new SqlVideosRepository(new D1DatabaseClient(database))
}

export function createCatalogJobsRepository(database: D1Database): SqlCatalogJobsRepository {
  return new SqlCatalogJobsRepository(new D1DatabaseClient(database))
}
