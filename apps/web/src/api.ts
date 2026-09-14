import {
  ConnectionsResponseSchema,
  SyncRunsResponseSchema,
  HardcoverSyncResponseSchema,
  HealthResponseSchema,
  LetterboxdImportResponseSchema,
  LetterboxdRssSyncResponseSchema,
  MediaListResponseSchema,
  ReadwiseSyncResponseSchema,
  SpotifyImportResponseSchema,
  SpotifySyncResponseSchema,
  YoutubeImportResponseSchema,
} from '@media-tracker/contracts'

import type {
  ConnectionsResponse,
  HardcoverSyncResponse,
  HealthResponse,
  LetterboxdImportResponse,
  LetterboxdRssSyncResponse,
  MediaListResponse,
  ReadwiseSyncResponse,
  SpotifyImportResponse,
  SpotifySyncResponse,
  YoutubeImportResponse,
} from '@media-tracker/contracts'

const getJson = async (path: string, fetcher: typeof fetch): Promise<unknown> => {
  const response = await fetcher(path, {
    headers: { accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}.`)
  }

  return response.json()
}

export const fetchHealth = async (fetcher: typeof fetch = fetch): Promise<HealthResponse> => {
  return HealthResponseSchema.parse(await getJson('/api/health', fetcher))
}

export const fetchConnections = async (
  fetcher: typeof fetch = fetch,
): Promise<ConnectionsResponse> => {
  return ConnectionsResponseSchema.parse(await getJson('/api/connections', fetcher))
}

export const fetchMedia = async (
  fetcher: typeof fetch = fetch,
  options: { type?: string; cursor?: string } = {},
): Promise<MediaListResponse> => {
  const query = new URLSearchParams(options)
  return MediaListResponseSchema.parse(
    await getJson(`/api/media${query.size ? `?${query}` : ''}`, fetcher),
  )
}
export const fetchSyncRuns = async (cursor?: string) =>
  SyncRunsResponseSchema.parse(
    await getJson(
      `/api/sync-runs?limit=20${cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`}`,
      fetch,
    ),
  )

export const syncReadwise = async (
  fetcher: typeof fetch = fetch,
): Promise<ReadwiseSyncResponse> => {
  const response = await fetcher('/api/connections/readwise/sync', {
    method: 'POST',
    headers: { accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Readwise sync failed with status ${response.status}.`)
  return ReadwiseSyncResponseSchema.parse(await response.json())
}

export const syncHardcover = async (
  fetcher: typeof fetch = fetch,
): Promise<HardcoverSyncResponse> => {
  const response = await fetcher('/api/connections/hardcover/sync', {
    method: 'POST',
    headers: { accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Hardcover sync failed with status ${response.status}.`)
  return HardcoverSyncResponseSchema.parse(await response.json())
}

export const importLetterboxd = async (
  archive: File,
  fetcher: typeof fetch = fetch,
): Promise<LetterboxdImportResponse> => {
  const response = await fetcher('/api/connections/letterboxd/import', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/zip' },
    body: archive,
  })
  if (!response.ok) throw new Error(`Letterboxd import failed with status ${response.status}.`)
  return LetterboxdImportResponseSchema.parse(await response.json())
}

export const syncLetterboxd = async (
  fetcher: typeof fetch = fetch,
): Promise<LetterboxdRssSyncResponse> => {
  const response = await fetcher('/api/connections/letterboxd/sync', {
    method: 'POST',
    headers: { accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Letterboxd sync failed with status ${response.status}.`)
  return LetterboxdRssSyncResponseSchema.parse(await response.json())
}

export const importSpotify = async (
  archive: File,
  fetcher: typeof fetch = fetch,
): Promise<SpotifyImportResponse> => {
  const response = await fetcher('/api/connections/spotify/import', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/zip' },
    body: archive,
  })
  if (!response.ok) throw new Error(`Spotify import failed with status ${response.status}.`)
  let chunk = SpotifyImportResponseSchema.parse(await response.json())
  const totals = {
    archiveEpisodes: chunk.archiveEpisodes,
    sourceRecords: chunk.sourceRecords,
    unresolvedPodcastSegments: chunk.unresolvedPodcastSegments,
  }

  while (!chunk.completed) {
    const previousOffset = chunk.nextOffset
    const continuation = await fetcher(
      `/api/connections/spotify/import/${chunk.importId}/continue`,
      { method: 'POST', headers: { accept: 'application/json' } },
    )
    if (!continuation.ok) {
      throw new Error(`Spotify import failed with status ${continuation.status}.`)
    }
    chunk = SpotifyImportResponseSchema.parse(await continuation.json())
    if (!chunk.completed && (chunk.nextOffset === null || chunk.nextOffset === previousOffset)) {
      throw new Error('Spotify import did not make progress.')
    }
    totals.archiveEpisodes += chunk.archiveEpisodes
    totals.sourceRecords += chunk.sourceRecords
    totals.unresolvedPodcastSegments += chunk.unresolvedPodcastSegments
  }

  return { ...chunk, ...totals }
}

export const syncSpotify = async (fetcher: typeof fetch = fetch): Promise<SpotifySyncResponse> => {
  const response = await fetcher('/api/connections/spotify/sync', {
    method: 'POST',
    headers: { accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Spotify sync failed with status ${response.status}.`)
  return SpotifySyncResponseSchema.parse(await response.json())
}

export const importYoutube = async (
  archive: File,
  fetcher: typeof fetch = fetch,
  options: { connectionId?: string; connectionKey?: string; connectionLabel?: string } = {},
): Promise<YoutubeImportResponse> => {
  const query = new URLSearchParams(options)
  const suffix = query.size ? `?${query}` : ''
  const response = await fetcher(`/api/connections/youtube/import${suffix}`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/zip' },
    body: archive,
  })
  if (!response.ok) throw new Error(`YouTube import failed with status ${response.status}.`)
  let chunk = YoutubeImportResponseSchema.parse(await response.json())
  const totals = {
    videos: chunk.videos,
    archiveEntries: chunk.archiveEntries,
    sourceRecords: chunk.sourceRecords,
    unresolvedRecords: chunk.unresolvedRecords,
    ignoredRecords: chunk.ignoredRecords,
    watchLaterRecords: chunk.watchLaterRecords,
  }

  while (!chunk.completed) {
    const previousOffset = chunk.nextOffset
    const continuation = await fetcher(
      `/api/connections/youtube/import/${chunk.importId}/continue${suffix}`,
      { method: 'POST', headers: { accept: 'application/json' } },
    )
    if (!continuation.ok) {
      throw new Error(`YouTube import failed with status ${continuation.status}.`)
    }
    chunk = YoutubeImportResponseSchema.parse(await continuation.json())
    if (!chunk.completed && (chunk.nextOffset === null || chunk.nextOffset === previousOffset)) {
      throw new Error('YouTube import did not make progress.')
    }
    totals.videos += chunk.videos
    totals.archiveEntries += chunk.archiveEntries
    totals.sourceRecords += chunk.sourceRecords
    totals.unresolvedRecords += chunk.unresolvedRecords
    totals.ignoredRecords += chunk.ignoredRecords
    totals.watchLaterRecords += chunk.watchLaterRecords
  }

  return { ...chunk, ...totals }
}

export async function resumeImport(
  source: 'spotify' | 'youtube',
  importId: string,
  connectionId: string,
) {
  let lastOffset: number | null = null
  while (true) {
    const response = await fetch(
      `/api/connections/${source}/import/${encodeURIComponent(importId)}/continue?connectionId=${encodeURIComponent(connectionId)}`,
      { method: 'POST', headers: { accept: 'application/json' } },
    )
    if (!response.ok) throw new Error(`Import failed with status ${response.status}.`)
    const body: unknown = await response.json()
    const result =
      source === 'youtube'
        ? YoutubeImportResponseSchema.parse(body)
        : SpotifyImportResponseSchema.parse(body)
    if (result.completed) return
    if (result.nextOffset === lastOffset) throw new Error('Import did not make progress.')
    lastOffset = result.nextOffset
  }
}
