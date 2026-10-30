import type { SourceSyncQueuedResponse, SyncRunsResponse } from '@media-tracker/contracts'

export const ACTIVE_POLL_INTERVAL = 5000
export const IDLE_POLL_INTERVAL = 60_000

export function activityIsRunning(page: SyncRunsResponse | undefined) {
  return (
    page?.data.some((run) =>
      run.catalogProgress
        ? ['running', 'waiting', 'awaiting_worker'].includes(run.catalogProgress.state)
        : ['pending', 'running'].includes(run.status),
    ) ?? false
  )
}

// This bounds fast polling, not server execution or queue retention.
export const QUEUED_SYNC_POLL_WINDOW = 2 * 60_000
export type PollingSource = SourceSyncQueuedResponse['source']
export interface QueuedSourceSync {
  source: PollingSource
  connectionId: string | null
  previousRunIds: readonly string[]
  latestStartedAt: string | null
  expiresAt: number
  waiting: boolean
}

export function prepareQueuedSourceSync(
  source: PollingSource,
  connectionId: string | null,
  page: SyncRunsResponse | undefined,
  now: number,
): QueuedSourceSync {
  const relevant = page?.data.filter((run) => isSourceRun(run, source, connectionId)) ?? []
  return {
    source,
    connectionId,
    previousRunIds: relevant.map((run) => run.id),
    latestStartedAt:
      relevant
        .map((run) => run.startedAt)
        .sort()
        .at(-1) ?? null,
    expiresAt: now + QUEUED_SYNC_POLL_WINDOW,
    waiting: true,
  }
}

function isSourceRun(
  run: SyncRunsResponse['data'][number],
  source: PollingSource,
  connectionId: string | null,
) {
  return (
    run.source === source &&
    (connectionId === null || run.connectionId === connectionId) &&
    !run.catalogProgress &&
    (run.kind === 'backfill' || run.kind === 'reconcile')
  )
}

export function observeSyncActivity(
  previous: SyncRunsResponse | undefined,
  current: SyncRunsResponse,
  queued: readonly QueuedSourceSync[],
) {
  const matches = (pending: QueuedSourceSync, run: SyncRunsResponse['data'][number]) =>
    isSourceRun(run, pending.source, pending.connectionId) &&
    !pending.previousRunIds.includes(run.id) &&
    (pending.latestStartedAt === null || run.startedAt >= pending.latestStartedAt)
  const terminal = (run: SyncRunsResponse['data'][number]) =>
    !activityIsRunning({ data: [run], nextCursor: null })
  return {
    queued: queued.filter((pending) => !current.data.some((run) => matches(pending, run))),
    refreshLibrary: current.data.some(
      (run) =>
        terminal(run) &&
        (previous?.data.some((old) => old.id === run.id && !terminal(old)) ||
          queued.some((pending) => matches(pending, run)) ||
          (previous !== undefined &&
            !previous.data.some((old) => old.id === run.id) &&
            previous.data
              .filter((old) => old.source === run.source && old.connectionId === run.connectionId)
              .every((old) => old.startedAt <= run.startedAt))),
    ),
  }
}
