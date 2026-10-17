import { describe, expect, it } from 'vitest'
import { activityIsRunning, ACTIVE_POLL_INTERVAL, IDLE_POLL_INTERVAL } from './connections-queries'
import { SyncRunsResponseSchema } from '@media-tracker/contracts'

describe('Connections activity polling', () => {
  it('distinguishes active sync/catalog work from completed activity', () => {
    const run = {
      id: 'run',
      source: 'spotify',
      connectionId: 'connection',
      connectionLabel: 'Synthetic',
      kind: 'reconcile',
      status: 'succeeded',
      sourceRecords: 0,
      normalizedRecords: 0,
      failedRecords: 0,
      errorCode: null,
      errorMessage: null,
      startedAt: '2026-10-17T12:00:00Z',
      finishedAt: null,
    }
    const page = (status: string) =>
      SyncRunsResponseSchema.parse({ data: [{ ...run, status }], nextCursor: null })
    expect(activityIsRunning(undefined)).toBe(false)
    expect(activityIsRunning(page('running'))).toBe(true)
    expect(activityIsRunning(page('pending'))).toBe(true)
    expect(activityIsRunning(page('succeeded'))).toBe(false)
    expect(activityIsRunning(page('failed'))).toBe(false)
    const catalog = SyncRunsResponseSchema.parse({
      data: [
        {
          ...run,
          catalogProgress: {
            state: 'waiting',
            requestedCount: 1,
            returnedCount: 0,
            unavailableCount: 0,
            lastActivityAt: '2026-10-17T12:00:00Z',
            nextAttemptAt: null,
          },
        },
      ],
      nextCursor: null,
    })
    expect(activityIsRunning(catalog)).toBe(true)
    expect(ACTIVE_POLL_INTERVAL).toBe(5000)
    expect(IDLE_POLL_INTERVAL).toBe(60_000)
  })
})
