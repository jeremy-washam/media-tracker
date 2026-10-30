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
  SourceSyncQueuedResponseSchema,
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
  SourceSyncQueuedResponse,
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

async function postSourceSync<Result>(
  source: SourceSyncQueuedResponse['source'],
  completedSchema: { parse(value: unknown): Result },
  fetcher: typeof fetch,
): Promise<Result | SourceSyncQueuedResponse> {
  const response = await fetcher(`/api/connections/${source}/sync`, {
    method: 'POST',
    headers: { accept: 'application/json' },
  })
  if (response.status === 202) {
    const queued = SourceSyncQueuedResponseSchema.parse(await response.json())
    if (queued.source !== source) throw new Error('Sync response source does not match request.')
    return queued
  }
  if (response.status !== 200)
    throw new Error(`Sync request failed with status ${response.status}.`)
  return completedSchema.parse(await response.json())
}

export const syncReadwise = async (
  fetcher: typeof fetch = fetch,
): Promise<ReadwiseSyncResponse | SourceSyncQueuedResponse> =>
  postSourceSync('readwise', ReadwiseSyncResponseSchema, fetcher)

export const syncHardcover = async (
  fetcher: typeof fetch = fetch,
): Promise<HardcoverSyncResponse | SourceSyncQueuedResponse> =>
  postSourceSync('hardcover', HardcoverSyncResponseSchema, fetcher)

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
): Promise<LetterboxdRssSyncResponse | SourceSyncQueuedResponse> =>
  postSourceSync('letterboxd', LetterboxdRssSyncResponseSchema, fetcher)

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
    songObservations: chunk.songObservations,
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
    if (
      !chunk.completed &&
      (chunk.nextOffset === null || (previousOffset !== null && chunk.nextOffset <= previousOffset))
    ) {
      throw new Error('Spotify import did not make progress.')
    }
    totals.archiveEpisodes += chunk.archiveEpisodes
    totals.songObservations += chunk.songObservations
    totals.sourceRecords += chunk.sourceRecords
    totals.unresolvedPodcastSegments += chunk.unresolvedPodcastSegments
  }

  return { ...chunk, ...totals }
}

export const syncSpotify = async (
  fetcher: typeof fetch = fetch,
): Promise<SpotifySyncResponse | SourceSyncQueuedResponse> =>
  postSourceSync('spotify', SpotifySyncResponseSchema, fetcher)

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
    queueEntries: chunk.queueEntries,
    subscriptionRecords: chunk.subscriptionRecords,
    channels: chunk.channels,
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
    if (
      !chunk.completed &&
      (chunk.nextOffset === null || (previousOffset !== null && chunk.nextOffset <= previousOffset))
    ) {
      throw new Error('YouTube import did not make progress.')
    }
    totals.videos += chunk.videos
    totals.archiveEntries += chunk.archiveEntries
    totals.sourceRecords += chunk.sourceRecords
    totals.unresolvedRecords += chunk.unresolvedRecords
    totals.ignoredRecords += chunk.ignoredRecords
    totals.watchLaterRecords += chunk.watchLaterRecords
    totals.queueEntries += chunk.queueEntries
    totals.subscriptionRecords += chunk.subscriptionRecords
    totals.channels += chunk.channels
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
    if (result.nextOffset === null || (lastOffset !== null && result.nextOffset <= lastOffset))
      throw new Error('Import did not make progress.')
    lastOffset = result.nextOffset
  }
}
