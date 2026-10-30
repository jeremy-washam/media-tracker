import { describe, expect, it } from 'vitest'
import {
  activityIsRunning,
  ACTIVE_POLL_INTERVAL,
  IDLE_POLL_INTERVAL,
  QUEUED_SYNC_POLL_WINDOW,
  prepareQueuedSourceSync,
  observeSyncActivity,
} from './connections-queries'
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

describe('queued source activity observation', () => {
  const run = {
    id: 'old',
    source: 'spotify' as const,
    connectionId: 'primary',
    connectionLabel: 'Synthetic',
    kind: 'reconcile' as const,
    status: 'succeeded' as const,
    sourceRecords: 1,
    normalizedRecords: 1,
    failedRecords: 0,
    errorCode: null,
    errorMessage: null,
    startedAt: '2026-10-30T00:00:00Z',
    finishedAt: '2026-10-30T00:01:00Z',
  }
  const page = (...rows: unknown[]) =>
    SyncRunsResponseSchema.parse({ data: rows, nextCursor: null })
  it('keeps a queued request pending through unrelated, catalog, imported and old activity', () => {
    const before = page(run)
    const queued = prepareQueuedSourceSync('spotify', 'primary', before, 1000)
    expect(queued.expiresAt).toBe(1000 + QUEUED_SYNC_POLL_WINDOW)
    const current = page(
      run,
      { ...run, id: 'other-source', source: 'hardcover' },
      { ...run, id: 'other-account', connectionId: 'secondary' },
      { ...run, id: 'import', kind: 'import' },
      { ...run, id: 'historical', startedAt: '2026-10-29T00:00:00Z' },
      {
        ...run,
        id: 'catalog',
        catalogProgress: {
          state: 'succeeded',
          requestedCount: 1,
          returnedCount: 1,
          unavailableCount: 0,
          lastActivityAt: run.startedAt,
          nextAttemptAt: null,
        },
      },
    )
    expect(observeSyncActivity(current, current, [queued])).toEqual({
      queued: [queued],
      refreshLibrary: false,
    })
  })
  it('hands new running source activity to normal polling without claiming data completion', () => {
    const before = page(run)
    const queued = prepareQueuedSourceSync('spotify', 'primary', before, 1000)
    const current = page({ ...run, id: 'new', status: 'running', finishedAt: null })
    expect(observeSyncActivity(before, current, [queued])).toEqual({
      queued: [],
      refreshLibrary: false,
    })
    expect(activityIsRunning(current)).toBe(true)
  })
  it.each(['succeeded', 'partially_succeeded', 'failed'])(
    'refreshes once on an observed %s transition, including partial writes',
    (status) => {
      const before = page({ ...run, id: 'new', status: 'running', finishedAt: null })
      const current = page({ ...run, id: 'new', status })
      expect(observeSyncActivity(before, current, []).refreshLibrary).toBe(true)
      expect(observeSyncActivity(current, current, []).refreshLibrary).toBe(false)
      expect(observeSyncActivity(undefined, current, []).refreshLibrary).toBe(false)
    },
  )
  it('refreshes when a queued run finishes between polls, including after fast polling expires', () => {
    const before = page(run)
    const queued = {
      ...prepareQueuedSourceSync('spotify', 'primary', before, 1000),
      waiting: false,
    }
    const current = page({ ...run, id: 'completed-between-polls' })
    expect(observeSyncActivity(before, current, [queued])).toEqual({
      queued: [],
      refreshLibrary: true,
    })
  })
})

it('refreshes for newly completed background activity between polls, without treating history as new work', () => {
  const run = {
    id: 'old',
    source: 'readwise',
    connectionId: 'one',
    connectionLabel: 'Synthetic',
    kind: 'reconcile',
    status: 'succeeded',
    sourceRecords: 1,
    normalizedRecords: 1,
    failedRecords: 0,
    errorCode: null,
    errorMessage: null,
    startedAt: '2026-10-30T01:00:00Z',
    finishedAt: '2026-10-30T01:00:01Z',
  }
  const page = (rows: unknown[]) => SyncRunsResponseSchema.parse({ data: rows, nextCursor: null })
  const before = page([run])
  const current = page([{ ...run, id: 'new', startedAt: '2026-10-30T02:00:00Z' }, run])
  expect(observeSyncActivity(before, current, []).refreshLibrary).toBe(true)
  expect(observeSyncActivity(current, current, []).refreshLibrary).toBe(false)
  expect(
    observeSyncActivity(
      before,
      page([{ ...run, id: 'older', startedAt: '2026-10-29T02:00:00Z' }, run]),
      [],
    ).refreshLibrary,
  ).toBe(false)
})
