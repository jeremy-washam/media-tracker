import { describe, expect, it, vi } from 'vitest'

import {
  fetchHealth,
  fetchMedia,
  importLetterboxd,
  syncHardcover,
  syncLetterboxd,
  syncReadwise,
} from './api'

const validHealthResponse = {
  status: 'ok',
  service: 'media-tracker-api',
  version: '0.0.0',
  timestamp: '2026-07-18T12:00:00.000Z',
  requestId: 'request-1',
}

describe('API client', () => {
  it('validates successful health responses', async () => {
    const fetcher = vi.fn(async () => Response.json(validHealthResponse)) as unknown as typeof fetch

    await expect(fetchHealth(fetcher)).resolves.toEqual(validHealthResponse)
  })

  it('rejects malformed health responses', async () => {
    const fetcher = vi.fn(async () => Response.json({ status: 'maybe' })) as unknown as typeof fetch

    await expect(fetchHealth(fetcher)).rejects.toThrow()
  })

  it('loads and validates media summaries', async () => {
    const response = {
      data: [{ id: 'media-1', type: 'article', title: 'A synthetic article' }],
      nextCursor: null,
    }
    const fetcher = vi.fn(async () => Response.json(response)) as unknown as typeof fetch

    await expect(fetchMedia(fetcher)).resolves.toEqual(response)
  })

  it('starts a Readwise sync with POST', async () => {
    const response = { syncRunId: 'run-1', pages: 1, sourceRecords: 7, archiveItems: 5 }
    const fetcher = vi.fn(async () => Response.json(response)) as unknown as typeof fetch

    await expect(syncReadwise(fetcher)).resolves.toEqual(response)
    expect(fetcher).toHaveBeenCalledWith(
      '/api/connections/readwise/sync',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('uploads a Letterboxd ZIP export', async () => {
    const response = {
      syncRunId: 'run-2',
      alreadyImported: false,
      films: 2,
      archiveEntries: 3,
      sourceRecords: 5,
      unresolvedRecords: 0,
    }
    const fetcher = vi.fn(async () => Response.json(response)) as unknown as typeof fetch
    const archive = new File(['synthetic'], 'letterboxd.zip', { type: 'application/zip' })

    await expect(importLetterboxd(archive, fetcher)).resolves.toEqual(response)
    expect(fetcher).toHaveBeenCalledWith(
      '/api/connections/letterboxd/import',
      expect.objectContaining({ method: 'POST', body: archive }),
    )
  })

  it('starts a Hardcover sync with POST', async () => {
    const response = {
      syncRunId: 'run-hardcover',
      mode: 'backfill',
      pages: 2,
      sourceRecords: 125,
      books: 125,
      archiveEntries: 125,
    }
    const fetcher = vi.fn(async () => Response.json(response)) as unknown as typeof fetch

    await expect(syncHardcover(fetcher)).resolves.toEqual(response)
    expect(fetcher).toHaveBeenCalledWith(
      '/api/connections/hardcover/sync',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('starts a Letterboxd RSS sync with POST', async () => {
    const response = {
      syncRunId: 'run-3',
      unchanged: false,
      feedEntries: 2,
      archiveEntries: 1,
      sourceRecords: 2,
      unresolvedRecords: 0,
    }
    const fetcher = vi.fn(async () => Response.json(response)) as unknown as typeof fetch

    await expect(syncLetterboxd(fetcher)).resolves.toEqual(response)
    expect(fetcher).toHaveBeenCalledWith(
      '/api/connections/letterboxd/sync',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})
