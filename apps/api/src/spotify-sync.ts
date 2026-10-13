import {
  classifySavedEpisode,
  fetchSpotifyPlayer,
  fetchSpotifyRecentlyPlayed,
  fetchSpotifySavedEpisodesResponse,
  fetchSpotifySavedShowsPage,
  fetchSpotifyTracks,
  parseSpotifySavedEpisodesPage,
  type SpotifySavedEpisodeObservation,
  type SpotifyTrackObservation,
  type SpotifySavedEpisodesPage,
} from '@media-tracker/connector-spotify'
import type {
  ArchiveEntryWrite,
  CanonicalLedgerRepository,
  TrackMetadataProjection,
} from '@media-tracker/db'
import {
  archiveEntryEvidenceId,
  archiveEntryId,
  connectionId,
  externalIdentityId,
  mediaItemId,
  rawObjectId,
  sourceRecordId,
  syncCursorId,
  syncRunId,
  temporalDay,
  temporalInstant,
  temporalMonth,
  temporalYear,
  utcInstant,
  type ExternalIdentity,
  type MediaItem,
  type JsonObject,
  type RawObject,
  type SourceConnection,
  type SourceRecord,
  type SyncRun,
  type TemporalValue,
} from '@media-tracker/domain'
import { ulid } from 'ulid'

import type { Bindings } from './env'
import {
  createLedgerRepository,
  createSpotifyCatalogJobsRepository,
  createSpotifyLibraryRepository,
} from './env'
import { refreshStoredSpotifyToken } from './spotify-credentials'

const parserVersion = 'spotify-saved-episodes@2'
const savedShowsParserVersion = 'spotify-saved-shows@1'
const playerParserVersion = 'spotify-player@1'
const recentTracksParserVersion = 'spotify-recent-tracks@1'
const trackCatalogParserVersion = 'spotify-track-catalog@1'

export interface SpotifyBindings extends Bindings {
  SPOTIFY_CLIENT_ID?: string
  SPOTIFY_CLIENT_SECRET?: string
  SPOTIFY_REFRESH_TOKEN?: string
}

export interface SpotifySyncResponse {
  readonly archiveEpisodes: number
  readonly mode: 'backfill' | 'reconcile'
  readonly pages: number
  readonly queueCandidates: number
  readonly refreshTokenRotated: boolean
  readonly sourceRecords: number
  readonly syncRunId: string
  readonly unresolvedEpisodes: number
  readonly savedShows: number
  readonly playerObserved: boolean
  readonly recentTracks: number
  readonly catalogTracks: number
  readonly partialFailures: readonly string[]
}

export class SpotifyCredentialsMissingError extends Error {
  constructor() {
    super('Spotify is not configured')
    this.name = 'SpotifyCredentialsMissingError'
  }
}

function now() {
  return utcInstant(new Date().toISOString())
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError'
}

async function sha256(bytes: Uint8Array): Promise<{ digest: ArrayBuffer; hex: string }> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer)
  return {
    digest,
    hex: [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join(''),
  }
}

async function stableHash(value: string): Promise<string> {
  return (await sha256(new TextEncoder().encode(value))).hex
}

function sourceInstant(value: string): TemporalValue | null {
  try {
    return temporalInstant(value)
  } catch {
    return null
  }
}

function publishedAt(episode: SpotifySavedEpisodeObservation): TemporalValue | null {
  if (episode.releaseDate === null || episode.releaseDatePrecision === null) return null
  try {
    switch (episode.releaseDatePrecision) {
      case 'day':
        return temporalDay(episode.releaseDate)
      case 'month':
        return temporalMonth(episode.releaseDate)
      case 'year':
        return temporalYear(episode.releaseDate)
    }
    return null
  } catch {
    return null
  }
}

async function connectionForSync(
  repository: CanonicalLedgerRepository,
  observedAt: ReturnType<typeof utcInstant>,
): Promise<SourceConnection> {
  const hash = await stableHash('spotify-connection:default')
  const existing = await repository.findConnectionBySource('spotify')
  return {
    id: existing?.id ?? connectionId(`spotify_${hash}`),
    source: 'spotify',
    label: existing?.label ?? 'Spotify',
    status: 'connected',
    coverage: 'partial',
    createdAt: existing?.createdAt ?? observedAt,
    updatedAt: observedAt,
  }
}

async function persistApiPage(input: {
  bindings: SpotifyBindings
  repository: CanonicalLedgerRepository
  connection: SourceConnection
  runId: ReturnType<typeof syncRunId>
  rawObjects: RawObject[]
  operation: string
  page: string
  bytes: Uint8Array
  contentType: string
  acquiredAt: ReturnType<typeof utcInstant>
}): Promise<RawObject> {
  const sum = await sha256(input.bytes)
  const storageKey = `raw/spotify/sha256/${sum.hex.slice(0, 2)}/${sum.hex}.json`
  await input.bindings.RAW_BUCKET.put(storageKey, input.bytes, {
    httpMetadata: { contentType: input.contentType },
    customMetadata: { sha256: sum.hex },
    sha256: sum.digest,
  })
  const raw: RawObject = {
    id: rawObjectId(ulid()),
    connectionId: input.connection.id,
    syncRunId: input.runId,
    kind: 'api_page',
    acquisitionKey: `spotify:${input.runId}:${input.operation}:${input.page}`,
    storageKey,
    sha256: sum.hex,
    contentType: input.contentType,
    byteLength: input.bytes.byteLength,
    acquiredAt: input.acquiredAt,
    processingStatus: 'pending',
    lastParserVersion: null,
    processingError: null,
  }
  input.rawObjects.push(raw)
  await input.repository.commit({ rawObjects: [raw] })
  return raw
}

function trackIdentity(value: SpotifyTrackObservation): value is SpotifyTrackObservation & {
  id: string
  uri: string
} {
  return value.id !== null && value.uri !== null && /^spotify:track:[A-Za-z0-9]+$/.test(value.uri)
}

function podcastShowProjectionId(showId: string | null): string | null {
  return showId === null ? null : `spotify_show_${showId}`
}

export function trackMetadata(
  value: SpotifyTrackObservation & { id: string; uri: string },
  mediaItemId: string,
  observedAt: string,
): TrackMetadataProjection {
  return {
    mediaItemId,
    trackUri: value.uri,
    trackId: value.id,
    title: value.name,
    artists: value.artists
      .filter(
        (artist): artist is typeof artist & { id: string; uri: string } =>
          artist.id !== null && artist.uri !== null,
      )
      .map((artist) => ({ id: artist.id, uri: artist.uri, name: artist.name })),
    album:
      value.album?.id && value.album.uri
        ? {
            id: value.album.id,
            uri: value.album.uri,
            name: value.album.name,
            albumType: value.album.albumType,
            releaseDate: value.album.releaseDate,
            releaseDatePrecision: value.album.releaseDatePrecision,
            imageUrl: value.album.imageUrl,
            artists: value.album.artists
              .filter(
                (artist): artist is typeof artist & { id: string; uri: string } =>
                  artist.id !== null && artist.uri !== null,
              )
              .map((artist) => ({ id: artist.id, uri: artist.uri, name: artist.name })),
          }
        : null,
    canonicalUrl: value.canonicalUrl ?? `https://open.spotify.com/track/${value.id}`,
    durationMs: value.durationMs,
    explicit: value.explicit,
    isrc: value.isrc,
    observedAt,
  }
}

async function syncTrackCatalog(input: {
  bindings: SpotifyBindings
  repository: CanonicalLedgerRepository
  spotifyRepository: ReturnType<typeof createSpotifyLibraryRepository>
  connection: SourceConnection
  runId: ReturnType<typeof syncRunId>
  accessToken: string
  rawObjects: RawObject[]
}): Promise<number> {
  const backlog = await input.spotifyRepository.listTracksNeedingMetadata(50)
  if (backlog.length === 0) return 0
  const acquiredAt = now()
  const response = await fetchSpotifyTracks({
    accessToken: input.accessToken,
    ids: backlog.map((item) => item.trackId),
  })
  const raw = await persistApiPage({
    ...input,
    operation: 'track-catalog',
    page: String(acquiredAt),
    bytes: response.bytes,
    contentType: response.contentType,
    acquiredAt,
  })
  try {
    const byTrackId = new Map(backlog.map((item) => [item.trackId, item]))
    const records: SourceRecord[] = []
    const metadata: TrackMetadataProjection[] = []
    const returned = new Set<string>()
    for (const [index, value] of response.tracks.entries()) {
      if (value === null || !trackIdentity(value)) continue
      const match = byTrackId.get(value.id)
      if (!match) continue
      returned.add(value.id)
      records.push({
        id: sourceRecordId(ulid()),
        rawObjectId: raw.id,
        connectionId: input.connection.id,
        recordType: 'track_catalog_observation',
        recordPath: `$.tracks[${index}]`,
        sourceRecordKey: value.uri,
        sourceRecordedAt: null,
        observedAt: acquiredAt,
        parserVersion: trackCatalogParserVersion,
        contentSha256: null,
        disposition: 'normalized',
        upstreamState: 'active',
        errorCode: null,
      })
      metadata.push(trackMetadata(value, match.mediaItemId, acquiredAt))
    }
    await input.repository.commit({
      sourceRecords: records,
      rawObjects: [
        { ...raw, processingStatus: 'processed', lastParserVersion: trackCatalogParserVersion },
      ],
    })
    for (const value of metadata)
      await input.spotifyRepository.applyTrackMetadata(value, { rebuildSearch: false })
    await input.spotifyRepository.markTrackMetadataUnavailable(
      backlog.filter((item) => !returned.has(item.trackId)).map((item) => item.mediaItemId),
      acquiredAt,
    )
    await input.spotifyRepository.rebuildMusicSearch()
    return metadata.length
  } catch (error) {
    await input.repository.commit({
      rawObjects: [
        {
          ...raw,
          processingStatus: 'failed',
          lastParserVersion: trackCatalogParserVersion,
          processingError: errorName(error),
        },
      ],
    })
    throw error
  }
}

async function syncAdditionalSpotifyLibrary(input: {
  bindings: SpotifyBindings
  repository: CanonicalLedgerRepository
  spotifyRepository: ReturnType<typeof createSpotifyLibraryRepository>
  connection: SourceConnection
  runId: ReturnType<typeof syncRunId>
  accessToken: string
  rawObjects: RawObject[]
}): Promise<{
  savedShows: number
  playerObserved: boolean
  recentTracks: number
  catalogTracks: number
  partialFailures: string[]
  checkpoints: { name: string; value: JsonObject; at: ReturnType<typeof now> }[]
}> {
  const partialFailures: string[] = []
  const checkpoints: { name: string; value: JsonObject; at: ReturnType<typeof now> }[] = []
  const checkpoint = (name: string, value: JsonObject, at: ReturnType<typeof now>) => {
    checkpoints.push({ name, value, at })
  }
  let savedShows = 0
  try {
    const showIds: string[] = []
    let showOffset: number | null = 0
    do {
      const acquiredAt = now()
      const page = await fetchSpotifySavedShowsPage({
        accessToken: input.accessToken,
        offset: showOffset,
      })
      const raw = await persistApiPage({
        ...input,
        operation: 'saved-shows',
        page: String(showOffset),
        bytes: page.bytes,
        contentType: page.contentType,
        acquiredAt,
      })
      const records: SourceRecord[] = []
      const projections = []
      for (const [index, show] of page.items.entries()) {
        const usable = show.showId !== null && show.showUri !== null
        const record: SourceRecord = {
          id: sourceRecordId(ulid()),
          rawObjectId: raw.id,
          connectionId: input.connection.id,
          recordType: 'saved_show_observation',
          recordPath: `$.items[${index}]`,
          sourceRecordKey: show.showUri,
          sourceRecordedAt: sourceInstant(show.addedAt),
          observedAt: acquiredAt,
          parserVersion: savedShowsParserVersion,
          contentSha256: null,
          disposition: usable ? 'normalized' : 'unresolved',
          upstreamState: 'active',
          errorCode: usable ? null : 'missing_show_identity',
        }
        records.push(record)
        if (!usable) continue
        const id = `spotify_show_${show.showId}`
        showIds.push(id)
        projections.push({
          connectionId: input.connection.id,
          sourceRecordId: record.id,
          id,
          showId: show.showId!,
          showUri: show.showUri!,
          addedAt: sourceInstant(show.addedAt)?.value ?? null,
          observedAt: acquiredAt,
          name: show.name,
          publisher: show.publisher,
          description: show.description,
          imageUrl: show.imageUrl,
          canonicalUrl: show.canonicalUrl,
          languages: show.languages,
          totalEpisodes: show.totalEpisodes,
        })
        savedShows += 1
      }
      await input.repository.commit({
        sourceRecords: records,
        rawObjects: [
          { ...raw, processingStatus: 'processed', lastParserVersion: savedShowsParserVersion },
        ],
      })
      await input.spotifyRepository.upsertSavedShows(projections)
      showOffset = page.nextOffset
    } while (showOffset !== null)
    const completedAt = now()
    await input.spotifyRepository.finalizeSavedShows(input.connection.id, showIds, completedAt)
    checkpoint(
      'saved-shows',
      { lastFullSyncAt: completedAt, showCount: showIds.length },
      completedAt,
    )
  } catch (error) {
    savedShows = 0
    partialFailures.push('saved_shows')
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'spotify.saved_shows_sync_failed',
        errorName: errorName(error),
      }),
    )
  }

  let playerObserved = false
  try {
    const playerAt = now()
    const player = await fetchSpotifyPlayer({ accessToken: input.accessToken })
    const playerRaw = await persistApiPage({
      ...input,
      operation: 'player',
      page: String(playerAt),
      bytes: player.bytes,
      contentType: player.contentType ?? 'application/json',
      acquiredAt: playerAt,
    })
    const playerRecord: SourceRecord = {
      id: sourceRecordId(ulid()),
      rawObjectId: playerRaw.id,
      connectionId: input.connection.id,
      recordType: 'player_observation',
      recordPath: '$',
      sourceRecordKey: player.itemType,
      sourceRecordedAt: sourceInstant(player.sourceTimestamp ?? ''),
      observedAt: playerAt,
      parserVersion: playerParserVersion,
      contentSha256: null,
      disposition: player.empty ? 'ignored' : 'normalized',
      upstreamState: 'active',
      errorCode: null,
    }
    let playerMediaItemId: ReturnType<typeof mediaItemId> | null = null
    let playerEpisode: Parameters<
      typeof input.spotifyRepository.recordPlayerObservation
    >[0]['episode']
    if (player.itemType === 'episode' && player.item !== null) {
      const episode = player.item as SpotifySavedEpisodeObservation
      if (episode.episodeId && episode.episodeUri) {
        const hash = await stableHash(`spotify-episode:${episode.episodeUri}`)
        playerMediaItemId = mediaItemId(`spotify_media_${hash}`)
        const identityId = externalIdentityId(`spotify_identity_${hash}`)
        const canonicalUrl =
          episode.canonicalUrl ?? `https://open.spotify.com/episode/${episode.episodeId}`
        const item: MediaItem = {
          id: playerMediaItemId,
          type: 'podcast_episode',
          title: episode.title,
          subtitle: episode.showName,
          primaryCreatorName: episode.showName,
          description: episode.description,
          canonicalUrl,
          imageUrl: episode.imageUrl,
          publishedAt: publishedAt(episode),
          durationMs: episode.durationMs,
          createdAt: playerAt,
          updatedAt: playerAt,
        }
        const identity: ExternalIdentity = {
          id: identityId,
          mediaItemId: playerMediaItemId,
          namespace: 'spotify',
          externalType: 'episode_uri',
          externalId: episode.episodeUri,
          scope: { kind: 'global' },
          canonicalUrl,
          firstObservedSourceRecordId: playerRecord.id,
          lastObservedSourceRecordId: playerRecord.id,
          retiredAt: null,
        }
        const positive = (player.progressMs ?? 0) > 0
        const archiveEntry: ArchiveEntryWrite | null = positive
          ? {
              entry: {
                id: archiveEntryId(
                  `spotify_archive_${await stableHash(input.connection.id)}_${hash}`,
                ),
                mediaItemId: playerMediaItemId,
                connectionId: input.connection.id,
                consumedIdentityId: identityId,
                sourceOccurrenceKey: `episode:${episode.episodeUri}`,
                admissionReason: 'spotify_positive_resume_position',
                consumedAt: null,
                sourceRecordedAt: null,
                sourceRating: null,
                reviewText: null,
                upstreamState: 'active',
                createdAt: playerAt,
                updatedAt: playerAt,
              },
              evidence: [
                {
                  id: archiveEntryEvidenceId(ulid()),
                  archiveEntryId: archiveEntryId(
                    `spotify_archive_${await stableHash(input.connection.id)}_${hash}`,
                  ),
                  sourceRecordId: playerRecord.id,
                  role: 'admission',
                  linkedAt: playerAt,
                },
              ],
            }
          : null
        await input.repository.commit({
          sourceRecords: [playerRecord],
          mediaItems: [item],
          externalIdentities: [identity],
          ...(archiveEntry ? { archiveEntries: [archiveEntry] } : {}),
          rawObjects: [
            { ...playerRaw, processingStatus: 'processed', lastParserVersion: playerParserVersion },
          ],
        })
        playerEpisode = {
          episodeId: episode.episodeId,
          episodeUri: episode.episodeUri,
          title: episode.title,
          showId: podcastShowProjectionId(episode.showId),
          showUri: episode.showUri,
          showName: episode.showName,
          description: episode.description,
          imageUrl: episode.imageUrl,
          canonicalUrl,
          publishedAt: publishedAt(episode)?.value ?? null,
          publishedPrecision: publishedAt(episode)?.precision ?? null,
          durationMs: episode.durationMs,
        }
      }
    }
    if (playerMediaItemId === null) {
      await input.repository.commit({
        sourceRecords: [playerRecord],
        rawObjects: [
          { ...playerRaw, processingStatus: 'processed', lastParserVersion: playerParserVersion },
        ],
      })
    }
    await input.spotifyRepository.recordPlayerObservation({
      id: ulid(),
      sourceRecordId: playerRecord.id,
      connectionId: input.connection.id,
      mediaItemId: playerMediaItemId,
      itemType: player.itemType,
      itemUri:
        player.itemType === 'episode'
          ? ((player.item as SpotifySavedEpisodeObservation | null)?.episodeUri ?? null)
          : player.itemType === 'track'
            ? ((player.item as SpotifyTrackObservation | null)?.uri ?? null)
            : null,
      progressMs: player.progressMs,
      isPlaying: player.isPlaying,
      sourceTimestamp: player.sourceTimestamp,
      observedAt: playerAt,
      empty: player.empty,
      ...(playerEpisode ? { episode: playerEpisode } : {}),
    })
    playerObserved = !player.empty
    checkpoint(
      'current-player',
      { lastPollAt: playerAt, itemType: player.itemType, empty: player.empty },
      playerAt,
    )
  } catch (error) {
    partialFailures.push('player')
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'spotify.player_sync_failed',
        errorName: errorName(error),
      }),
    )
  }

  let recentTracks = 0
  try {
    const recentAt = now()
    const previousRecent = await input.repository.findSyncCursor(
      input.connection.id,
      'recent-tracks',
    )
    const recent = await fetchSpotifyRecentlyPlayed({ accessToken: input.accessToken })
    const recentRaw = await persistApiPage({
      ...input,
      operation: 'recent-tracks',
      page: String(recentAt),
      bytes: recent.bytes,
      contentType: recent.contentType,
      acquiredAt: recentAt,
    })
    const recentRecords: SourceRecord[] = []
    const recentMedia: MediaItem[] = []
    const recentIdentities: ExternalIdentity[] = []
    const recentArchive: ArchiveEntryWrite[] = []
    const songProjections = []
    const metadata: TrackMetadataProjection[] = []
    for (const [index, recentItem] of recent.items.entries()) {
      if (!trackIdentity(recentItem.track)) continue
      const value = recentItem.track
      const recordId = sourceRecordId(ulid())
      const hash = await stableHash(`spotify-track:${value.uri}`)
      const itemId = mediaItemId(`spotify_song_${hash}`)
      const identityId = externalIdentityId(`spotify_track_identity_${hash}`)
      const entryId = archiveEntryId(
        `spotify_song_archive_${await stableHash(input.connection.id)}_${hash}`,
      )
      const canonicalUrl = value.canonicalUrl ?? `https://open.spotify.com/track/${value.id}`
      recentRecords.push({
        id: recordId,
        rawObjectId: recentRaw.id,
        connectionId: input.connection.id,
        recordType: 'recent_track_observation',
        recordPath: `$.items[${index}]`,
        sourceRecordKey: `${value.uri}:${recentItem.playedAt}`,
        sourceRecordedAt: sourceInstant(recentItem.playedAt),
        observedAt: recentAt,
        parserVersion: recentTracksParserVersion,
        contentSha256: null,
        disposition: 'normalized',
        upstreamState: 'active',
        errorCode: null,
      })
      recentMedia.push({
        id: itemId,
        type: 'song',
        title: value.name,
        subtitle:
          value.artists
            .map((artist) => artist.name)
            .filter(Boolean)
            .join(', ') || null,
        primaryCreatorName: value.artists[0]?.name ?? null,
        description: null,
        canonicalUrl,
        imageUrl: value.album?.imageUrl ?? null,
        publishedAt: null,
        durationMs: value.durationMs,
        createdAt: recentAt,
        updatedAt: recentAt,
      })
      recentIdentities.push({
        id: identityId,
        mediaItemId: itemId,
        namespace: 'spotify',
        externalType: 'track_uri',
        externalId: value.uri,
        scope: { kind: 'global' },
        canonicalUrl,
        firstObservedSourceRecordId: recordId,
        lastObservedSourceRecordId: recordId,
        retiredAt: null,
      })
      recentArchive.push({
        latestConsumedAt: true,
        entry: {
          id: entryId,
          mediaItemId: itemId,
          connectionId: input.connection.id,
          consumedIdentityId: identityId,
          sourceOccurrenceKey: `track:${value.uri}`,
          admissionReason: 'spotify_positive_playback',
          consumedAt: sourceInstant(recentItem.playedAt),
          sourceRecordedAt: sourceInstant(recentItem.playedAt),
          sourceRating: null,
          reviewText: null,
          upstreamState: 'active',
          createdAt: recentAt,
          updatedAt: recentAt,
        },
        evidence: [
          {
            id: archiveEntryEvidenceId(ulid()),
            archiveEntryId: entryId,
            sourceRecordId: recordId,
            role: 'admission',
            linkedAt: recentAt,
          },
          {
            id: archiveEntryEvidenceId(ulid()),
            archiveEntryId: entryId,
            sourceRecordId: recordId,
            role: 'occurrence_time',
            linkedAt: recentAt,
          },
        ],
      })
      songProjections.push({
        id: `spotify_recent_${hash}_${Date.parse(recentItem.playedAt)}`,
        sourceRecordId: recordId,
        connectionId: input.connection.id,
        mediaItemId: itemId,
        trackUri: value.uri,
        trackId: value.id,
        occurredAt: sourceInstant(recentItem.playedAt)?.value ?? null,
        millisecondsPlayed: null,
        sourceKind: 'recent_api' as const,
        skipped: null,
        trackName: value.name,
        artistName:
          value.artists
            .map((artist) => artist.name)
            .filter(Boolean)
            .join(', ') || null,
        albumName: value.album?.name ?? null,
        reasonStart: null,
        reasonEnd: null,
        parserVersion: recentTracksParserVersion,
        updatedAt: recentAt,
      })
      metadata.push(trackMetadata(value, itemId, recentAt))
    }
    await input.repository.commit({
      sourceRecords: recentRecords,
      mediaItems: recentMedia,
      externalIdentities: recentIdentities,
      archiveEntries: recentArchive,
      rawObjects: [
        {
          ...recentRaw,
          processingStatus: 'processed',
          lastParserVersion: recentTracksParserVersion,
        },
      ],
    })
    await input.spotifyRepository.projectHistory({ podcasts: [], songs: songProjections })
    for (const value of metadata)
      await input.spotifyRepository.applyTrackMetadata(value, { rebuildSearch: false })
    await input.spotifyRepository.rebuildMusicSearch()
    recentTracks = songProjections.length
    const observedTimes = recent.items.map((item) => item.playedAt).sort()
    const oldestAt = observedTimes[0] ?? null
    const newestAt = observedTimes.at(-1) ?? null
    const previousNewestAt =
      typeof previousRecent?.checkpoint.newestAt === 'string'
        ? previousRecent.checkpoint.newestAt
        : null
    checkpoint(
      'recent-tracks',
      {
        lastPollAt: recentAt,
        oldestAt,
        newestAt,
        previousNewestAt,
        possibleGap: Boolean(previousNewestAt && oldestAt && oldestAt > previousNewestAt),
        observedItems: recent.items.length,
      },
      recentAt,
    )
  } catch (error) {
    partialFailures.push('recent_tracks')
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'spotify.recent_tracks_sync_failed',
        errorName: errorName(error),
      }),
    )
  }
  let catalogTracks = 0
  try {
    // A durable exact-ID backfill owns the backlog while active. The older
    // opportunistic batch path remains for integrations with batch access.
    if (
      (await createSpotifyCatalogJobsRepository(
        input.bindings.DB,
        input.bindings.DATABASE_USAGE_OBSERVER,
      ).findActive()) === null
    )
      catalogTracks = await syncTrackCatalog(input)
  } catch (error) {
    partialFailures.push('track_catalog')
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'spotify.track_catalog_sync_failed',
        errorName: errorName(error),
      }),
    )
  }
  return {
    savedShows,
    playerObserved,
    recentTracks,
    catalogTracks,
    partialFailures,
    checkpoints,
  }
}

export async function syncSpotifySavedEpisodes(
  bindings: SpotifyBindings,
): Promise<SpotifySyncResponse> {
  const clientId = bindings.SPOTIFY_CLIENT_ID?.trim()
  const refreshToken = bindings.SPOTIFY_REFRESH_TOKEN?.trim()
  if (!clientId || !refreshToken) throw new SpotifyCredentialsMissingError()

  const repository = createLedgerRepository(bindings.DB, bindings.DATABASE_USAGE_OBSERVER)
  const spotifyRepository = createSpotifyLibraryRepository(
    bindings.DB,
    bindings.DATABASE_USAGE_OBSERVER,
  )
  const startedAt = now()
  const connection = await connectionForSync(repository, startedAt)
  const previousCursor = await repository.findSyncCursor(connection.id, 'saved-episodes')
  const mode = previousCursor === null ? ('backfill' as const) : ('reconcile' as const)
  const runId = syncRunId(ulid())
  const runningRun: SyncRun = {
    id: runId,
    connectionId: connection.id,
    kind: mode,
    status: 'running',
    startedAt,
    finishedAt: null,
    counts: { rawObjects: 0, sourceRecords: 0, normalizedRecords: 0, failedRecords: 0 },
    errorCode: null,
    errorMessage: null,
  }

  await repository.saveConnection(connection)
  await repository.saveSyncRun(runningRun)

  let pages = 0
  let sourceRecordCount = 0
  let archiveEpisodes = 0
  let queueCandidates = 0
  let unresolvedEpisodes = 0
  const rawObjects: RawObject[] = []
  const observedEpisodeUris: string[] = []

  try {
    const refreshed = await refreshStoredSpotifyToken(bindings, connection.id)
    let offset: number | null = 0
    do {
      const acquiredAt = now()
      const response = await fetchSpotifySavedEpisodesResponse({
        accessToken: refreshed.accessToken,
        offset,
      })
      const checksum = await sha256(response.bytes)
      const storageKey = `raw/spotify/sha256/${checksum.hex.slice(0, 2)}/${checksum.hex}.json`
      await bindings.RAW_BUCKET.put(storageKey, response.bytes, {
        httpMetadata: { contentType: response.contentType },
        customMetadata: { sha256: checksum.hex },
        sha256: checksum.digest,
      })
      const rawObject: RawObject = {
        id: rawObjectId(ulid()),
        connectionId: connection.id,
        syncRunId: runId,
        kind: 'api_page',
        acquisitionKey: `spotify:${runId}:saved-episodes:${offset}`,
        storageKey,
        sha256: checksum.hex,
        contentType: response.contentType,
        byteLength: response.bytes.byteLength,
        acquiredAt,
        processingStatus: 'pending',
        lastParserVersion: null,
        processingError: null,
      }
      rawObjects.push(rawObject)
      await repository.commit({ rawObjects: [rawObject] })

      let page: SpotifySavedEpisodesPage
      try {
        page = parseSpotifySavedEpisodesPage(response)
        for (const [index, episode] of page.items.entries()) {
          const disposition = classifySavedEpisode({
            fullyPlayed: episode.fullyPlayed,
            resumePositionMs: episode.resumePositionMs,
          })
          const hasIdentity = episode.episodeId !== null && episode.episodeUri !== null
          const isArchive = disposition.startsWith('archive_')
          if (disposition === 'queue_unplayed') queueCandidates += 1
          if (disposition === 'unresolved_playback' || !hasIdentity) unresolvedEpisodes += 1
          const record: SourceRecord = {
            id: sourceRecordId(ulid()),
            rawObjectId: rawObject.id,
            connectionId: connection.id,
            recordType: 'saved_episode_observation',
            recordPath: `$.items[${index}]`,
            sourceRecordKey: episode.episodeUri,
            sourceRecordedAt: sourceInstant(episode.addedAt),
            observedAt: acquiredAt,
            parserVersion,
            contentSha256: null,
            disposition:
              isArchive && hasIdentity
                ? 'normalized'
                : disposition === 'queue_unplayed'
                  ? 'ignored'
                  : 'unresolved',
            upstreamState: 'active',
            errorCode: null,
          }
          sourceRecordCount += 1
          if (!hasIdentity) {
            await repository.commit({ sourceRecords: [record] })
            continue
          }
          observedEpisodeUris.push(episode.episodeUri!)

          const episodeHash = await stableHash(`spotify-episode:${episode.episodeUri!}`)
          const knownIdentity = await repository.findExternalIdentity({
            namespace: 'spotify',
            externalType: 'episode_uri',
            externalId: episode.episodeUri!,
            connectionId: null,
          })
          const itemId = knownIdentity?.mediaItemId ?? mediaItemId(`spotify_media_${episodeHash}`)
          const identityId =
            knownIdentity?.id ?? externalIdentityId(`spotify_identity_${episodeHash}`)
          const canonicalUrl =
            episode.canonicalUrl ?? `https://open.spotify.com/episode/${episode.episodeId!}`
          const item: MediaItem = {
            id: itemId,
            type: 'podcast_episode',
            title: episode.title,
            subtitle: episode.showName,
            primaryCreatorName: episode.showName,
            description: episode.description,
            canonicalUrl,
            imageUrl: episode.imageUrl,
            publishedAt: publishedAt(episode),
            durationMs: episode.durationMs,
            createdAt: acquiredAt,
            updatedAt: acquiredAt,
          }
          const identity: ExternalIdentity = {
            id: identityId,
            mediaItemId: itemId,
            namespace: 'spotify',
            externalType: 'episode_uri',
            externalId: episode.episodeUri!,
            scope: { kind: 'global' },
            canonicalUrl,
            firstObservedSourceRecordId: record.id,
            lastObservedSourceRecordId: record.id,
            retiredAt: null,
          }
          const occurrenceKey = `episode:${episode.episodeUri!}`
          const knownEntryId = await repository.findArchiveEntryId(connection.id, occurrenceKey)
          const entryId =
            knownEntryId ??
            archiveEntryId(
              `spotify_archive_${await stableHash('spotify-connection:default')}_${episodeHash}`,
            )
          const archiveEntry: ArchiveEntryWrite | null = !isArchive
            ? null
            : {
                entry: {
                  id: entryId,
                  mediaItemId: itemId,
                  connectionId: connection.id,
                  consumedIdentityId: identityId,
                  sourceOccurrenceKey: occurrenceKey,
                  admissionReason:
                    disposition === 'archive_fully_played'
                      ? 'spotify_fully_played'
                      : 'spotify_positive_resume_position',
                  consumedAt: null,
                  sourceRecordedAt: null,
                  sourceRating: null,
                  reviewText: null,
                  upstreamState: 'active',
                  createdAt: acquiredAt,
                  updatedAt: acquiredAt,
                },
                evidence: [
                  {
                    id: archiveEntryEvidenceId(ulid()),
                    archiveEntryId: entryId,
                    sourceRecordId: record.id,
                    role: 'admission',
                    linkedAt: acquiredAt,
                  },
                ],
              }
          await repository.commit({
            sourceRecords: [record],
            mediaItems: [item],
            externalIdentities: [identity],
            ...(archiveEntry === null ? {} : { archiveEntries: [archiveEntry] }),
          })
          await spotifyRepository.upsertSavedEpisodes([
            {
              connectionId: connection.id,
              sourceRecordId: record.id,
              mediaItemId: itemId,
              episodeUri: episode.episodeUri!,
              episodeId: episode.episodeId!,
              addedAt: sourceInstant(episode.addedAt)?.value ?? null,
              resumePositionMs: episode.resumePositionMs,
              fullyPlayed: episode.fullyPlayed,
              observedAt: acquiredAt,
              title: episode.title,
              showId: podcastShowProjectionId(episode.showId),
              showUri: episode.showUri,
              showName: episode.showName,
              description: episode.description,
              imageUrl: episode.imageUrl,
              canonicalUrl,
              publishedAt: publishedAt(episode)?.value ?? null,
              publishedPrecision: publishedAt(episode)?.precision ?? null,
              durationMs: episode.durationMs,
            },
          ])
          if (archiveEntry !== null) archiveEpisodes += 1
        }
        await repository.commit({
          rawObjects: [
            { ...rawObject, processingStatus: 'processed', lastParserVersion: parserVersion },
          ],
        })
      } catch (error) {
        await repository.commit({
          rawObjects: [
            {
              ...rawObject,
              processingStatus: 'failed',
              lastParserVersion: parserVersion,
              processingError: errorName(error),
            },
          ],
        })
        throw error
      }
      pages += 1
      offset = page.nextOffset
    } while (offset !== null)

    const snapshotAt = now()
    await spotifyRepository.finalizeSavedEpisodes(connection.id, observedEpisodeUris, snapshotAt)
    let extended = {
      savedShows: 0,
      playerObserved: false,
      recentTracks: 0,
      catalogTracks: 0,
      partialFailures: [] as string[],
      checkpoints: [] as { name: string; value: JsonObject; at: ReturnType<typeof now> }[],
    }
    try {
      extended = await syncAdditionalSpotifyLibrary({
        bindings,
        repository,
        spotifyRepository,
        connection,
        runId,
        accessToken: refreshed.accessToken,
        rawObjects,
      })
    } catch (error) {
      extended.partialFailures.push('optional_library')
      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'spotify.optional_library_sync_failed',
          errorName: errorName(error),
        }),
      )
    }
    await spotifyRepository.finalizeSavedEpisodes(connection.id, observedEpisodeUris, now())

    const finishedAt = now()
    await repository.commit({
      syncRun: {
        ...runningRun,
        status: 'succeeded',
        finishedAt,
        counts: {
          rawObjects: rawObjects.length,
          sourceRecords: sourceRecordCount,
          normalizedRecords: archiveEpisodes,
          failedRecords: 0,
        },
      },
      cursor: {
        id: previousCursor?.id ?? syncCursorId(ulid()),
        connectionId: connection.id,
        name: 'saved-episodes',
        checkpoint: {
          lastFullSyncAt: finishedAt,
          pages,
          sourceRecords: sourceRecordCount,
          totalReported: sourceRecordCount,
        },
        committedAt: finishedAt,
        syncRunId: runId,
      },
    })
    for (const pending of extended.checkpoints) {
      try {
        const previous = await repository.findSyncCursor(connection.id, pending.name)
        await repository.commit({
          cursor: {
            id: previous?.id ?? syncCursorId(ulid()),
            connectionId: connection.id,
            name: pending.name,
            checkpoint: pending.value,
            committedAt: pending.at,
            syncRunId: runId,
          },
        })
      } catch (error) {
        extended.partialFailures.push(`${pending.name}_checkpoint`)
        console.warn(
          JSON.stringify({
            level: 'warn',
            event: 'spotify.optional_checkpoint_failed',
            name: pending.name,
            errorName: errorName(error),
          }),
        )
      }
    }
    await repository.saveConnection({ ...connection, updatedAt: finishedAt })
    return {
      archiveEpisodes,
      mode,
      pages,
      queueCandidates,
      refreshTokenRotated: refreshed.refreshToken !== null,
      sourceRecords: sourceRecordCount,
      syncRunId: runId,
      unresolvedEpisodes,
      savedShows: extended.savedShows,
      playerObserved: extended.playerObserved,
      recentTracks: extended.recentTracks,
      catalogTracks: extended.catalogTracks,
      partialFailures: extended.partialFailures,
    }
  } catch (error) {
    const finishedAt = now()
    await repository.saveSyncRun({
      ...runningRun,
      status: 'failed',
      finishedAt,
      counts: {
        rawObjects: rawObjects.length,
        sourceRecords: sourceRecordCount,
        normalizedRecords: archiveEpisodes,
        failedRecords: 1,
      },
      errorCode: errorName(error),
      errorMessage: 'Spotify saved-episode sync failed',
    })
    await repository.saveConnection({ ...connection, status: 'degraded', updatedAt: finishedAt })
    throw error
  }
}
