import type { SyncJob } from '@media-tracker/contracts'

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
