import {
  isSpotifyHistoryMember,
  parseSpotifyHistoryMember,
  type SpotifyPodcastSegment,
  type SpotifySongSegment,
} from '@media-tracker/connector-spotify'
import type {
  ArchiveEntryWrite,
  CanonicalLedgerRepository,
  SpotifyPodcastObservationProjection,
  SpotifySongObservationProjection,
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
  temporalInstant,
  utcInstant,
  type ExternalIdentity,
  type MediaItem,
  type RawObject,
  type SourceConnection,
  type SourceRecord,
  type SyncCursor,
  type SyncRun,
} from '@media-tracker/domain'
import { Unzip, UnzipInflate } from 'fflate'

import type { Bindings } from './env'
import { createLedgerRepository, createSpotifyLibraryRepository } from './env'

const parserVersion = 'spotify-extended-history@4'
const parserId = 'v4'
const defaultChunkSize = 100
const maximumChunkSize = 100

export interface SpotifyImportOptions {
  readonly chunkSize?: number
}
export interface SpotifyImportResponse {
  readonly alreadyImported: boolean
  readonly archiveEpisodes: number
  readonly songObservations: number
  readonly completed: boolean
  readonly importId: string
  readonly nextOffset: number | null
  readonly sourceRecords: number
  readonly syncRunId: string
  readonly totalArchiveEpisodes: number
  readonly totalArchiveTracks: number
  readonly totalPodcastSegments: number
  readonly totalSongSegments: number
  readonly unresolvedPodcastSegments: number
}
interface Checkpoint {
  archiveSha256: string
  completed: boolean
  nextOffset: number
  totalRecords: number
}
interface Context {
  archiveHash: string
  connection: SourceConnection
  connectionHash: string
  cursorName: string
  raw: RawObject
  repository: CanonicalLedgerRepository
  spotifyRepository: ReturnType<typeof createSpotifyLibraryRepository>
  run: SyncRun
}

type SpotifyHistoryRecord =
  | { readonly kind: 'podcast'; readonly value: SpotifyPodcastSegment }
  | { readonly kind: 'song'; readonly value: SpotifySongSegment }

export class SpotifyImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SpotifyImportError'
  }
}
const instantNow = () => utcInstant(new Date().toISOString())
const safeErrorName = (error: unknown) => (error instanceof Error ? error.name : 'UnknownError')
async function checksum(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer)
  return {
    digest,
    hex: [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, '0')).join(''),
  }
}
async function stableHash(value: string) {
  return (await checksum(new TextEncoder().encode(value))).hex
}
function chunkSize(value: number | undefined) {
  if (value === undefined) return defaultChunkSize
  if (!Number.isInteger(value) || value < 1)
    throw new SpotifyImportError('The Spotify import chunk size is invalid')
  return Math.min(value, maximumChunkSize)
}
function checkpointValue(value: unknown): Checkpoint | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Partial<Checkpoint>
  return typeof v.archiveSha256 === 'string' &&
    typeof v.completed === 'boolean' &&
    typeof v.nextOffset === 'number' &&
    typeof v.totalRecords === 'number'
    ? (v as Checkpoint)
    : null
}
async function spotifyConnection(
  repository: CanonicalLedgerRepository,
  at: ReturnType<typeof utcInstant>,
) {
  const existing = await repository.findConnectionBySource('spotify')
  const defaultHash = await stableHash('spotify-connection:default')
  const id = existing?.id ?? connectionId(`spotify_${defaultHash}`)
  const hash = await stableHash(id)
  return {
    hash,
    connection: {
      id,
      source: 'spotify' as const,
      label: existing?.label ?? 'Spotify',
      status: 'connected' as const,
      coverage: 'partial' as const,
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
    },
  }
}
function parseArchive(archive: Uint8Array): Promise<SpotifyHistoryRecord[]> {
  return new Promise((resolve, reject) => {
    const members: { name: string; records: readonly SpotifyHistoryRecord[] }[] = []
    let pending = 0
    let pushed = false
    let settled = false
    const finish = () => {
      if (settled || !pushed || pending !== 0) return
      settled = true
      if (members.length === 0)
        return reject(new SpotifyImportError('No Extended Streaming History JSON files were found'))
      resolve(members.sort((a, b) => a.name.localeCompare(b.name)).flatMap((v) => v.records))
    }
    const fail = (error: unknown) => {
      if (!settled) {
        settled = true
        reject(error)
      }
    }
    const unzip = new Unzip((file) => {
      if (!isSpotifyHistoryMember(file.name)) return
      pending += 1
      const chunks: Uint8Array[] = []
      let length = 0
      file.ondata = (error, chunk, final) => {
        if (error !== null) return fail(error)
        chunks.push(chunk)
        length += chunk.byteLength
        if (!final) return
        try {
          const bytes = new Uint8Array(length)
          let offset = 0
          for (const value of chunks) {
            bytes.set(value, offset)
            offset += value.byteLength
          }
          const projection = parseSpotifyHistoryMember(file.name, bytes)
          members.push({
            name: file.name,
            records: [
              ...projection.podcastSegments.map((value) => ({ kind: 'podcast' as const, value })),
              ...projection.songSegments.map((value) => ({ kind: 'song' as const, value })),
            ].sort((a, b) => a.value.rowIndex - b.value.rowIndex),
          })
          pending -= 1
          finish()
        } catch (error) {
          fail(error)
        }
      }
      file.start()
    })
    unzip.register(UnzipInflate)
    try {
      unzip.push(archive, true)
      pushed = true
      finish()
    } catch (error) {
      fail(error)
    }
  })
}
function latestSegments(records: readonly SpotifyHistoryRecord[]) {
  const latest = new Map<string, SpotifyPodcastSegment>()
  for (const record of records) {
    if (record.kind !== 'podcast') continue
    const segment = record.value
    if (
      segment.episodeId === null ||
      segment.episodeUri === null ||
      segment.millisecondsPlayed <= 0
    )
      continue
    const previous = latest.get(segment.episodeUri)
    if (
      previous === undefined ||
      (segment.occurredAt !== null &&
        (previous.occurredAt === null || segment.occurredAt > previous.occurredAt))
    ) {
      latest.set(segment.episodeUri, segment)
    }
  }
  return latest
}
function parseManifest(
  value: unknown,
  importId: string,
): { archiveByteLength: number; records: SpotifyHistoryRecord[] } {
  if (typeof value !== 'object' || value === null)
    throw new SpotifyImportError('The Spotify import manifest is invalid')
  const manifest = value as {
    archiveSha256?: unknown
    archiveByteLength?: unknown
    records?: unknown
  }
  if (
    manifest.archiveSha256 !== importId ||
    !Number.isInteger(manifest.archiveByteLength) ||
    (manifest.archiveByteLength as number) < 1 ||
    !Array.isArray(manifest.records)
  ) {
    throw new SpotifyImportError('The Spotify import manifest is invalid')
  }
  for (const record of manifest.records) {
    if (
      typeof record !== 'object' ||
      record === null ||
      !['podcast', 'song'].includes(String(Reflect.get(record, 'kind'))) ||
      typeof Reflect.get(record, 'value') !== 'object' ||
      typeof Reflect.get(Reflect.get(record, 'value')!, 'memberName') !== 'string' ||
      typeof Reflect.get(Reflect.get(record, 'value')!, 'rowIndex') !== 'number' ||
      typeof Reflect.get(Reflect.get(record, 'value')!, 'recordPath') !== 'string' ||
      typeof Reflect.get(Reflect.get(record, 'value')!, 'millisecondsPlayed') !== 'number'
    ) {
      throw new SpotifyImportError('The Spotify import manifest is invalid')
    }
  }
  return {
    archiveByteLength: manifest.archiveByteLength as number,
    records: manifest.records as SpotifyHistoryRecord[],
  }
}
function manifestKey(importId: string) {
  return `derived/spotify/${importId}.classified-${parserVersion}.json`
}
async function prepare(bindings: Bindings, archiveHash: string, archiveByteLength: number) {
  const repository = createLedgerRepository(bindings.DB, bindings.DATABASE_USAGE_OBSERVER)
  const spotifyRepository = createSpotifyLibraryRepository(
    bindings.DB,
    bindings.DATABASE_USAGE_OBSERVER,
  )
  const startedAt = instantNow()
  const { connection, hash: connectionHash } = await spotifyConnection(repository, startedAt)
  const acquisitionKey = `spotify:extended-history:sha256:${archiveHash}`
  const cursorName = `${acquisitionKey}:${parserVersion}`
  await repository.saveConnection(connection)
  const rawExists = (await repository.findRawObjectId(connection.id, acquisitionKey)) !== null
  const priorCursor = await repository.findSyncCursor(connection.id, cursorName)
  const checkpoint = checkpointValue(priorCursor?.checkpoint)
  const runId = syncRunId(
    `spotify_run_${connectionHash}_${archiveHash}_offset_${checkpoint?.nextOffset ?? 0}`,
  )
  const run: SyncRun = {
    id: runId,
    connectionId: connection.id,
    kind: 'import',
    status: checkpoint?.completed === true ? 'succeeded' : 'running',
    startedAt,
    finishedAt: checkpoint?.completed === true ? startedAt : null,
    counts: { rawObjects: 1, sourceRecords: 0, normalizedRecords: 0, failedRecords: 0 },
    errorCode: null,
    errorMessage: null,
  }
  const raw: RawObject = {
    id: rawObjectId(`spotify_raw_${connectionHash}_${archiveHash}`),
    connectionId: connection.id,
    syncRunId: runId,
    kind: 'export',
    acquisitionKey,
    storageKey: `raw/spotify/sha256/${archiveHash.slice(0, 2)}/${archiveHash}.zip`,
    sha256: archiveHash,
    contentType: 'application/zip',
    byteLength: archiveByteLength,
    acquiredAt: startedAt,
    processingStatus: 'pending',
    lastParserVersion: null,
    processingError: null,
  }
  if (checkpoint?.completed !== true) await repository.saveSyncRun(run)
  return {
    checkpoint,
    context: {
      archiveHash,
      connection,
      connectionHash,
      cursorName,
      raw,
      repository,
      spotifyRepository,
      run,
    } satisfies Context,
    rawExists,
  }
}
function temporal(value: string | null) {
  return value === null ? null : temporalInstant(value)
}
async function normalizeChunk(
  context: Context,
  records: readonly SpotifyHistoryRecord[],
  offset: number,
  size: number,
): Promise<SpotifyImportResponse> {
  if (!Number.isInteger(offset) || offset < 0 || offset > records.length)
    throw new SpotifyImportError('The Spotify import continuation is invalid')
  const chunk = records.slice(offset, offset + size)
  const at = instantNow()
  const sourceRecords: SourceRecord[] = []
  const mediaItems: MediaItem[] = []
  const identities: ExternalIdentity[] = []
  const archiveEntries: ArchiveEntryWrite[] = []
  const podcasts: SpotifyPodcastObservationProjection[] = []
  const songs: SpotifySongObservationProjection[] = []
  let unresolved = 0
  for (const record of chunk) {
    const segment = record.value
    const segmentHash = await stableHash(
      `${context.archiveHash}:${segment.memberName}:${segment.rowIndex}`,
    )
    const recordId = sourceRecordId(`spotify_sr_${parserId}_${segmentHash}`)
    const identified =
      record.kind === 'song' ||
      (record.value.episodeId !== null && record.value.episodeUri !== null)
    const positive = segment.millisecondsPlayed > 0
    if (record.kind === 'podcast' && positive && !identified) unresolved += 1
    sourceRecords.push({
      id: recordId,
      rawObjectId: context.raw.id,
      connectionId: context.connection.id,
      recordType: record.kind === 'podcast' ? 'podcast_playback_segment' : 'song_playback_segment',
      recordPath: segment.recordPath,
      sourceRecordKey: `${segment.memberName}:${segment.rowIndex}`,
      sourceRecordedAt: temporal(segment.occurredAt),
      observedAt: at,
      parserVersion,
      contentSha256: null,
      disposition: identified ? 'normalized' : 'unresolved',
      upstreamState: 'active',
      errorCode: !identified ? 'missing_episode_identity' : null,
    })
    if (record.kind === 'podcast') {
      const podcast = record.value
      let itemId: ReturnType<typeof mediaItemId> | null = null
      if (podcast.episodeId !== null && podcast.episodeUri !== null) {
        const episodeHash = await stableHash(`spotify-episode:${podcast.episodeUri}`)
        const knownIdentity = await context.repository.findExternalIdentity({
          namespace: 'spotify',
          externalType: 'episode_uri',
          externalId: podcast.episodeUri,
          connectionId: null,
        })
        itemId = knownIdentity?.mediaItemId ?? mediaItemId(`spotify_media_${episodeHash}`)
        const identityId =
          knownIdentity?.id ?? externalIdentityId(`spotify_identity_${episodeHash}`)
        const entryId =
          (await context.repository.findArchiveEntryId(
            context.connection.id,
            `episode:${podcast.episodeUri}`,
          )) ?? archiveEntryId(`spotify_archive_${context.connectionHash}_${episodeHash}`)
        const url = `https://open.spotify.com/episode/${podcast.episodeId}`
        mediaItems.push({
          id: itemId,
          type: 'podcast_episode',
          title: podcast.episodeName,
          subtitle: podcast.showName,
          primaryCreatorName: podcast.showName,
          description: null,
          canonicalUrl: url,
          imageUrl: null,
          publishedAt: null,
          durationMs: null,
          createdAt: at,
          updatedAt: at,
        })
        identities.push({
          id: identityId,
          mediaItemId: itemId,
          namespace: 'spotify',
          externalType: 'episode_uri',
          externalId: podcast.episodeUri,
          scope: { kind: 'global' },
          canonicalUrl: url,
          firstObservedSourceRecordId: recordId,
          lastObservedSourceRecordId: recordId,
          retiredAt: null,
        })
        if (positive) {
          archiveEntries.push({
            latestConsumedAt: true,
            entry: {
              id: entryId,
              mediaItemId: itemId,
              connectionId: context.connection.id,
              consumedIdentityId: identityId,
              sourceOccurrenceKey: `episode:${podcast.episodeUri}`,
              admissionReason: 'spotify_positive_playback',
              consumedAt: temporal(podcast.occurredAt),
              sourceRecordedAt: temporal(podcast.occurredAt),
              sourceRating: null,
              reviewText: null,
              upstreamState: 'active',
              createdAt: at,
              updatedAt: at,
            },
            evidence: [
              {
                id: archiveEntryEvidenceId(`spotify_evidence_${parserId}_${segmentHash}_admission`),
                archiveEntryId: entryId,
                sourceRecordId: recordId,
                role: 'admission',
                linkedAt: at,
              },
              ...(podcast.occurredAt === null
                ? []
                : [
                    {
                      id: archiveEntryEvidenceId(
                        `spotify_evidence_${parserId}_${segmentHash}_occurrence_time`,
                      ),
                      archiveEntryId: entryId,
                      sourceRecordId: recordId,
                      role: 'occurrence_time' as const,
                      linkedAt: at,
                    },
                  ]),
            ],
          })
        }
      }
      podcasts.push({
        id: `spotify_podcast_observation_${segmentHash}`,
        sourceRecordId: recordId,
        connectionId: context.connection.id,
        mediaItemId: itemId,
        episodeUri: podcast.episodeUri,
        episodeId: podcast.episodeId,
        occurredAt: podcast.occurredAt,
        millisecondsPlayed: podcast.millisecondsPlayed,
        episodeTitle: podcast.episodeName,
        showName: podcast.showName,
        reasonStart: podcast.reasonStart,
        reasonEnd: podcast.reasonEnd,
        skipped: podcast.skipped,
        parserVersion,
        updatedAt: at,
      })
    } else {
      const song = record.value
      const trackHash = await stableHash(`spotify-track:${song.trackUri}`)
      const knownIdentity = await context.repository.findExternalIdentity({
        namespace: 'spotify',
        externalType: 'track_uri',
        externalId: song.trackUri,
        connectionId: null,
      })
      const itemId = knownIdentity?.mediaItemId ?? mediaItemId(`spotify_song_${trackHash}`)
      const identityId =
        knownIdentity?.id ?? externalIdentityId(`spotify_track_identity_${trackHash}`)
      const entryId =
        (await context.repository.findArchiveEntryId(
          context.connection.id,
          `track:${song.trackUri}`,
        )) ?? archiveEntryId(`spotify_song_archive_${context.connectionHash}_${trackHash}`)
      const url = `https://open.spotify.com/track/${song.trackId}`
      mediaItems.push({
        id: itemId,
        type: 'song',
        title: song.trackName,
        subtitle: song.artistName,
        primaryCreatorName: song.artistName,
        description: null,
        canonicalUrl: url,
        imageUrl: null,
        publishedAt: null,
        durationMs: null,
        createdAt: at,
        updatedAt: at,
      })
      identities.push({
        id: identityId,
        mediaItemId: itemId,
        namespace: 'spotify',
        externalType: 'track_uri',
        externalId: song.trackUri,
        scope: { kind: 'global' },
        canonicalUrl: url,
        firstObservedSourceRecordId: recordId,
        lastObservedSourceRecordId: recordId,
        retiredAt: null,
      })
      archiveEntries.push({
        latestConsumedAt: true,
        entry: {
          id: entryId,
          mediaItemId: itemId,
          connectionId: context.connection.id,
          consumedIdentityId: identityId,
          sourceOccurrenceKey: `track:${song.trackUri}`,
          admissionReason: 'spotify_positive_playback',
          consumedAt: temporal(song.occurredAt),
          sourceRecordedAt: temporal(song.occurredAt),
          sourceRating: null,
          reviewText: null,
          upstreamState: 'active',
          createdAt: at,
          updatedAt: at,
        },
        evidence: [
          {
            id: archiveEntryEvidenceId(
              `spotify_song_evidence_${parserId}_${segmentHash}_admission`,
            ),
            archiveEntryId: entryId,
            sourceRecordId: recordId,
            role: 'admission',
            linkedAt: at,
          },
          ...(song.occurredAt === null
            ? []
            : [
                {
                  id: archiveEntryEvidenceId(
                    `spotify_song_evidence_${parserId}_${segmentHash}_occurrence_time`,
                  ),
                  archiveEntryId: entryId,
                  sourceRecordId: recordId,
                  role: 'occurrence_time' as const,
                  linkedAt: at,
                },
              ]),
        ],
      })
      songs.push({
        id: `spotify_song_observation_${segmentHash}`,
        sourceRecordId: recordId,
        connectionId: context.connection.id,
        mediaItemId: itemId,
        trackUri: song.trackUri,
        trackId: song.trackId,
        occurredAt: song.occurredAt,
        millisecondsPlayed: song.millisecondsPlayed,
        sourceKind: 'export',
        skipped: song.skipped,
        trackName: song.trackName,
        artistName: song.artistName,
        albumName: song.albumName,
        reasonStart: song.reasonStart,
        reasonEnd: song.reasonEnd,
        parserVersion,
        updatedAt: at,
      })
    }
  }
  const next = offset + chunk.length
  const completed = next >= records.length
  const currentCursor = await context.repository.findSyncCursor(
    context.connection.id,
    context.cursorName,
  )
  const cursor: SyncCursor = {
    id:
      currentCursor?.id ??
      syncCursorId(
        `spotify_cursor_${await stableHash(`${context.connection.id}:${context.archiveHash}:${parserVersion}`)}`,
      ),
    connectionId: context.connection.id,
    name: context.cursorName,
    checkpoint: {
      archiveSha256: context.archiveHash,
      completed,
      nextOffset: next,
      totalRecords: records.length,
    },
    committedAt: at,
    syncRunId: context.run.id,
  }
  await context.repository.commit({
    rawObjects: [
      {
        ...context.raw,
        processingStatus: 'processing',
        lastParserVersion: parserVersion,
      },
    ],
    sourceRecords,
    mediaItems,
    externalIdentities: identities,
    archiveEntries,
  })
  await context.spotifyRepository.projectHistory({ podcasts, songs, rebuild: completed })
  await context.repository.commit({
    syncRun: {
      ...context.run,
      status: 'succeeded',
      finishedAt: at,
      counts: {
        rawObjects: 1,
        sourceRecords: sourceRecords.length,
        normalizedRecords: archiveEntries.length,
        failedRecords: 0,
      },
    },
    rawObjects: [
      {
        ...context.raw,
        processingStatus: completed ? 'processed' : 'processing',
        lastParserVersion: parserVersion,
      },
    ],
    cursor,
  })
  if (completed) await context.repository.saveConnection({ ...context.connection, updatedAt: at })
  return {
    alreadyImported: false,
    archiveEpisodes: new Set(
      podcasts
        .filter((value) => value.millisecondsPlayed > 0 && value.episodeUri !== null)
        .map((value) => value.episodeUri),
    ).size,
    songObservations: songs.length,
    completed,
    importId: context.archiveHash,
    nextOffset: completed ? null : next,
    sourceRecords: sourceRecords.length,
    syncRunId: context.run.id,
    totalArchiveEpisodes: new Set(
      records
        .filter(
          (value): value is Extract<SpotifyHistoryRecord, { kind: 'podcast' }> =>
            value.kind === 'podcast' &&
            value.value.millisecondsPlayed > 0 &&
            value.value.episodeUri !== null,
        )
        .map((value) => value.value.episodeUri),
    ).size,
    totalPodcastSegments: records.filter((value) => value.kind === 'podcast').length,
    totalSongSegments: records.filter((value) => value.kind === 'song').length,
    totalArchiveTracks: new Set(
      records
        .filter(
          (value): value is Extract<SpotifyHistoryRecord, { kind: 'song' }> =>
            value.kind === 'song',
        )
        .map((value) => value.value.trackUri),
    ).size,
    unresolvedPodcastSegments: unresolved,
  }
}
async function markFailed(context: Context, error: unknown) {
  const at = instantNow()
  await context.repository.commit({
    syncRun: {
      ...context.run,
      status: 'failed',
      finishedAt: at,
      counts: { rawObjects: 1, sourceRecords: 0, normalizedRecords: 0, failedRecords: 1 },
      errorCode: safeErrorName(error),
      errorMessage: 'Spotify Extended Streaming History import failed',
    },
    rawObjects: [
      {
        ...context.raw,
        processingStatus: 'failed',
        lastParserVersion: parserVersion,
        processingError: safeErrorName(error),
      },
    ],
  })
  await context.repository.saveConnection({
    ...context.connection,
    status: 'degraded',
    updatedAt: at,
  })
}
async function processPrepared(
  prepared: Awaited<ReturnType<typeof prepare>>,
  records: readonly SpotifyHistoryRecord[],
  size: number,
): Promise<SpotifyImportResponse> {
  try {
    const latest = latestSegments(records)
    if (prepared.checkpoint?.completed === true)
      return {
        alreadyImported: true,
        archiveEpisodes: 0,
        songObservations: 0,
        completed: true,
        importId: prepared.context.archiveHash,
        nextOffset: null,
        sourceRecords: 0,
        syncRunId: prepared.context.run.id,
        totalArchiveEpisodes: latest.size,
        totalPodcastSegments: records.filter((value) => value.kind === 'podcast').length,
        totalSongSegments: records.filter((value) => value.kind === 'song').length,
        totalArchiveTracks: new Set(
          records
            .filter(
              (value): value is Extract<SpotifyHistoryRecord, { kind: 'song' }> =>
                value.kind === 'song',
            )
            .map((value) => value.value.trackUri),
        ).size,
        unresolvedPodcastSegments: 0,
      }
    if (
      prepared.checkpoint !== null &&
      (prepared.checkpoint.archiveSha256 !== prepared.context.archiveHash ||
        prepared.checkpoint.totalRecords !== records.length)
    ) {
      throw new SpotifyImportError('The Spotify import checkpoint does not match its source')
    }
    return await normalizeChunk(
      prepared.context,
      records,
      prepared.checkpoint?.nextOffset ?? 0,
      size,
    )
  } catch (error) {
    await markFailed(prepared.context, error)
    throw error instanceof SpotifyImportError
      ? error
      : new SpotifyImportError(error instanceof Error ? error.message : 'Spotify import failed')
  }
}
export async function importSpotifyExtendedHistory(
  bindings: Bindings,
  archive: Uint8Array,
  options: SpotifyImportOptions = {},
): Promise<SpotifyImportResponse> {
  if (archive.byteLength === 0) throw new SpotifyImportError('The Spotify export is empty')
  const size = chunkSize(options.chunkSize)
  const sum = await checksum(archive)
  const prepared = await prepare(bindings, sum.hex, archive.byteLength)
  if (prepared.rawExists) {
    const manifestObject = await bindings.RAW_BUCKET.get(manifestKey(sum.hex))
    if (manifestObject !== null) {
      const manifestBytes = new Uint8Array(await manifestObject.arrayBuffer())
      const manifest = parseManifest(JSON.parse(new TextDecoder().decode(manifestBytes)), sum.hex)
      return processPrepared(prepared, manifest.records, size)
    }
  }
  if (!prepared.rawExists) {
    await bindings.RAW_BUCKET.put(prepared.context.raw.storageKey, archive, {
      httpMetadata: { contentType: 'application/zip' },
      customMetadata: { sha256: prepared.context.archiveHash },
      sha256: sum.digest,
    })
    await prepared.context.repository.commit({ rawObjects: [prepared.context.raw] })
  }
  let records: SpotifyHistoryRecord[]
  try {
    records = await parseArchive(archive)
    await bindings.RAW_BUCKET.put(
      manifestKey(sum.hex),
      JSON.stringify({ archiveSha256: sum.hex, archiveByteLength: archive.byteLength, records }),
      { httpMetadata: { contentType: 'application/json' } },
    )
  } catch (error) {
    await markFailed(prepared.context, error)
    throw error instanceof SpotifyImportError
      ? error
      : new SpotifyImportError(error instanceof Error ? error.message : 'Spotify import failed')
  }
  return processPrepared(prepared, records, size)
}
export async function continueSpotifyExtendedHistoryImport(
  bindings: Bindings,
  importId: string,
  options: SpotifyImportOptions = {},
): Promise<SpotifyImportResponse> {
  if (!/^[a-f0-9]{64}$/.test(importId))
    throw new SpotifyImportError('The Spotify import continuation is invalid')
  const manifestObject = await bindings.RAW_BUCKET.get(manifestKey(importId))
  if (manifestObject !== null) {
    const manifestBytes = new Uint8Array(await manifestObject.arrayBuffer())
    const manifest = parseManifest(JSON.parse(new TextDecoder().decode(manifestBytes)), importId)
    const prepared = await prepare(bindings, importId, manifest.archiveByteLength)
    return processPrepared(prepared, manifest.records, chunkSize(options.chunkSize))
  }
  const stored = await bindings.RAW_BUCKET.get(
    `raw/spotify/sha256/${importId.slice(0, 2)}/${importId}.zip`,
  )
  if (stored === null) throw new SpotifyImportError('The Spotify import source is unavailable')
  const archive = new Uint8Array(await stored.arrayBuffer())
  if ((await checksum(archive)).hex !== importId)
    throw new SpotifyImportError('The Spotify import source failed verification')
  return importSpotifyExtendedHistory(bindings, archive, options)
}
