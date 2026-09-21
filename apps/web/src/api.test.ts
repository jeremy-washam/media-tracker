import { describe, expect, it, vi } from 'vitest'

import {
  fetchHealth,
  fetchMedia,
  importLetterboxd,
  importSpotify,
  importYoutube,
  syncHardcover,
  syncLetterboxd,
  syncReadwise,
  syncSpotify,
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
      totalCount: 1,
      filteredCount: 1,
      counts: { article: 1, book: 0, movie: 0, podcast_episode: 0, song: 0, video: 0 },
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
      queueBooks: 0,
      works: 125,
      editions: 125,
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

  it('uploads a Spotify history ZIP and starts a persistent sync', async () => {
    const importResponse = {
      syncRunId: 'run-spotify-import',
      importId: 'c'.repeat(64),
      alreadyImported: false,
      completed: true,
      nextOffset: null,
      totalPodcastSegments: 12,
      totalArchiveEpisodes: 4,
      archiveEpisodes: 4,
      totalSongSegments: 100,
      totalArchiveTracks: 25,
      songObservations: 100,
      sourceRecords: 12,
      unresolvedPodcastSegments: 0,
    }
    const syncResponse = {
      syncRunId: 'run-spotify-sync',
      mode: 'reconcile',
      pages: 2,
      sourceRecords: 70,
      archiveEpisodes: 20,
      queueCandidates: 30,
      unresolvedEpisodes: 20,
      refreshTokenRotated: false,
      savedShows: 0,
      playerObserved: false,
      recentTracks: 0,
      catalogTracks: 0,
      partialFailures: [],
    }
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(importResponse))
      .mockResolvedValueOnce(Response.json(syncResponse)) as unknown as typeof fetch
    const archive = new File(['synthetic'], 'spotify.zip', { type: 'application/zip' })

    await expect(importSpotify(archive, fetcher)).resolves.toEqual(importResponse)
    await expect(syncSpotify(fetcher)).resolves.toEqual(syncResponse)
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      '/api/connections/spotify/import',
      expect.objectContaining({ method: 'POST', body: archive }),
    )
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      '/api/connections/spotify/sync',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('uploads a YouTube Takeout ZIP', async () => {
    const response = {
      syncRunId: 'run-youtube',
      importId: 'a'.repeat(64),
      alreadyImported: false,
      completed: true,
      nextOffset: null,
      totalRecords: 11,
      activityCards: 10,
      videos: 8,
      archiveEntries: 9,
      sourceRecords: 11,
      unresolvedRecords: 1,
      ignoredRecords: 1,
      watchLaterRecords: 1,
    }
    const fetcher = vi.fn(async () => Response.json(response)) as unknown as typeof fetch
    const archive = new File(['synthetic'], 'takeout.zip', { type: 'application/zip' })

    await expect(importYoutube(archive, fetcher)).resolves.toEqual(response)
    expect(fetcher).toHaveBeenCalledWith(
      '/api/connections/youtube/import',
      expect.objectContaining({ method: 'POST', body: archive }),
    )
  })

  it('continues a chunked YouTube import until it completes', async () => {
    const importId = 'b'.repeat(64)
    const first = {
      syncRunId: 'run-youtube-1',
      importId,
      alreadyImported: false,
      completed: false,
      nextOffset: 100,
      totalRecords: 101,
      activityCards: 101,
      videos: 90,
      archiveEntries: 100,
      sourceRecords: 100,
      unresolvedRecords: 0,
      ignoredRecords: 0,
      watchLaterRecords: 0,
    }
    const last = {
      ...first,
      syncRunId: 'run-youtube-2',
      completed: true,
      nextOffset: null,
      videos: 1,
      archiveEntries: 1,
      sourceRecords: 1,
    }
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(first))
      .mockResolvedValueOnce(Response.json(last)) as unknown as typeof fetch
    const archive = new File(['synthetic'], 'takeout.zip', { type: 'application/zip' })

    await expect(importYoutube(archive, fetcher)).resolves.toMatchObject({
      completed: true,
      archiveEntries: 101,
      sourceRecords: 101,
    })
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      `/api/connections/youtube/import/${importId}/continue`,
      expect.objectContaining({ method: 'POST' }),
    )
  })
})
