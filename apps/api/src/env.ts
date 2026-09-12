import type { SyncJob } from '@media-tracker/contracts'
import {
  D1DatabaseClient,
  SqlCanonicalLedgerRepository,
  type CanonicalLedgerRepository,
} from '@media-tracker/db'

export interface Bindings {
  ASSETS: Fetcher
  DB: D1Database
  RAW_BUCKET: R2Bucket
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
