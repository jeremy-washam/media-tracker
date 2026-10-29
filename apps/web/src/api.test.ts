import { afterEach, describe, expect, it, vi } from 'vitest'

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
  resumeImport,
} from './api'

afterEach(() => vi.unstubAllGlobals())

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
      queueEntries: 1,
      subscriptionRecords: 2,
      channels: 2,
      components: [],
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
      queueEntries: 0,
      subscriptionRecords: 0,
      channels: 0,
      components: [],
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

function chunk(
  source: 'spotify' | 'youtube',
  completed: boolean,
  nextOffset: number | null,
  count = 1,
) {
  const common = {
    syncRunId: 'synthetic-run',
    importId: 'synthetic-import',
    alreadyImported: false,
    completed,
    nextOffset,
    sourceRecords: count,
  }
  return source === 'spotify'
    ? {
        ...common,
        totalPodcastSegments: 20,
        totalArchiveEpisodes: 6,
        archiveEpisodes: count,
        totalSongSegments: 20,
        totalArchiveTracks: 6,
        songObservations: count,
        unresolvedPodcastSegments: 0,
      }
    : {
        ...common,
        totalRecords: 20,
        activityCards: 20,
        videos: count,
        archiveEntries: count,
        unresolvedRecords: 0,
        ignoredRecords: 0,
        watchLaterRecords: count,
        queueEntries: count,
        subscriptionRecords: count,
        channels: count,
        components: [],
      }
}

describe('Chunked import recovery boundaries', () => {
  for (const source of ['spotify', 'youtube'] as const) {
    const archive = new File(['synthetic'], `${source}.zip`, { type: 'application/zip' })
    const importArchive = (fetcher: typeof fetch) =>
      source === 'youtube'
        ? importYoutube(archive, fetcher, { connectionId: 'account /?&' })
        : importSpotify(archive, fetcher)

    it(`${source} aggregates three chunks and keeps the exact continuation account`, async () => {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(Response.json(chunk(source, false, 5, 2)))
        .mockResolvedValueOnce(Response.json(chunk(source, false, 10, 3)))
        .mockResolvedValueOnce(Response.json(chunk(source, true, null, 1)))
      const result = await importArchive(fetcher)
      expect(result).toMatchObject({
        completed: true,
        sourceRecords: 6,
        ...(source === 'spotify'
          ? { archiveEpisodes: 6, songObservations: 6 }
          : { archiveEntries: 6, videos: 6, queueEntries: 6, channels: 6 }),
      })
      expect(fetcher).toHaveBeenCalledTimes(3)
      for (const call of fetcher.mock.calls.slice(1)) {
        const url = new URL(call[0] as string, 'http://localhost')
        expect(url.pathname).toBe(`/api/connections/${source}/import/synthetic-import/continue`)
        expect(url.searchParams.get('connectionId')).toBe(
          source === 'youtube' ? 'account /?&' : null,
        )
        expect(call[1]).toMatchObject({ method: 'POST' })
      }
    })

    it.each([5, 4, null])(
      `${source} rejects an incomplete continuation with offset %s`,
      async (offset) => {
        const fetcher = vi
          .fn()
          .mockResolvedValueOnce(Response.json(chunk(source, false, 5)))
          .mockResolvedValueOnce(Response.json(chunk(source, false, offset)))
        await expect(importArchive(fetcher)).rejects.toThrow('did not make progress')
        expect(fetcher).toHaveBeenCalledTimes(2)
      },
    )

    it(`${source} stops on initial, continuation, and malformed response failures`, async () => {
      for (const responses of [
        [Response.json({}, { status: 413 })],
        [Response.json({ completed: true })],
        [Response.json(chunk(source, false, 5)), Response.json({}, { status: 500 })],
        [Response.json(chunk(source, false, 5)), Response.json({ completed: true })],
      ]) {
        const fetcher = vi.fn()
        for (const response of responses) fetcher.mockResolvedValueOnce(response)
        await expect(importArchive(fetcher)).rejects.toThrow()
        expect(fetcher).toHaveBeenCalledTimes(responses.length)
      }
    })

    it(`${source} returns an already imported archive without continuing it`, async () => {
      const fetcher = vi.fn(async () =>
        Response.json({ ...chunk(source, true, null, 0), alreadyImported: true }),
      )
      await expect(importArchive(fetcher)).resolves.toMatchObject({
        alreadyImported: true,
        completed: true,
      })
      expect(fetcher).toHaveBeenCalledTimes(1)
    })

    it(`${source} resumes multiple chunks with encoded import/account identities`, async () => {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(Response.json(chunk(source, false, 5)))
        .mockResolvedValueOnce(Response.json(chunk(source, false, 10)))
        .mockResolvedValueOnce(Response.json(chunk(source, true, null)))
      vi.stubGlobal('fetch', fetcher)
      await expect(resumeImport(source, 'import /?&', 'account /?&')).resolves.toBeUndefined()
      expect(fetcher).toHaveBeenCalledTimes(3)
      for (const call of fetcher.mock.calls) {
        expect(call[0]).toBe(
          `/api/connections/${source}/import/import%20%2F%3F%26/continue?connectionId=account%20%2F%3F%26`,
        )
        expect(call[1]).toMatchObject({ method: 'POST' })
      }
    })

    it.each([5, 4, null])(
      `${source} refuses a resumed import that stalls or retreats to %s`,
      async (offset) => {
        const fetcher = vi
          .fn()
          .mockResolvedValueOnce(Response.json(chunk(source, false, 5)))
          .mockResolvedValueOnce(Response.json(chunk(source, false, offset)))
        vi.stubGlobal('fetch', fetcher)
        await expect(resumeImport(source, 'one', 'account')).rejects.toThrow(
          'did not make progress',
        )
        expect(fetcher).toHaveBeenCalledTimes(2)
      },
    )

    it(`${source} fails a resume immediately on HTTP or schema errors`, async () => {
      for (const response of [
        Response.json({}, { status: 500 }),
        Response.json({ completed: true }),
        Response.json(chunk(source, false, null)),
      ]) {
        const fetcher = vi.fn(async () => response)
        vi.stubGlobal('fetch', fetcher)
        await expect(resumeImport(source, 'one', 'account')).rejects.toThrow()
        expect(fetcher).toHaveBeenCalledTimes(1)
      }
    })
  }
})
