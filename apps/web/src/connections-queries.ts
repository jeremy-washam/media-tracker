import type { SyncRunsResponse } from '@media-tracker/contracts'

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
