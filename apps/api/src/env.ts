import type { SyncJob } from '@media-tracker/contracts'
import {
  D1DatabaseClient,
  SqlBooksRepository,
  SqlCanonicalLedgerRepository,
  type CanonicalLedgerRepository,
} from '@media-tracker/db'

export interface Bindings {
  ASSETS: Fetcher
  DB: D1Database
  HARDCOVER_TOKEN?: string
  LETTERBOXD_USERNAME?: string
  RAW_BUCKET: R2Bucket
  READWISE_TOKEN?: string
  SPOTIFY_CLIENT_ID?: string
  SPOTIFY_CLIENT_SECRET?: string
  SPOTIFY_REFRESH_TOKEN?: string
  TOKEN_ENCRYPTION_KEY?: string
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

export function createBooksRepository(database: D1Database): SqlBooksRepository {
  return new SqlBooksRepository(new D1DatabaseClient(database))
}
