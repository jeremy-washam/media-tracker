import { readHostedZip, HostedZipError } from './hosted-zip'
import {
  inspectYoutubeTakeoutBytes,
  youtubeChannelId,
  type YoutubePlaylistEntry,
  type YoutubeSubscriptionEntry,
  type YoutubeTakeout,
  type YoutubeWatchEntry,
  type YoutubeWatchLaterEntry,
} from '@media-tracker/connector-youtube'
import type {
  ArchiveEntryWrite,
  CanonicalLedgerRepository,
  YoutubeComponentProjection,
  YoutubeSnapshotMembership,
  YoutubeSnapshotSubscription,
  YoutubeWatchProjection,
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
  type SourceRecordDisposition,
  type SyncCursor,
  type SyncRun,
} from '@media-tracker/domain'

import type { Bindings } from './env'
import { createLedgerRepository, createVideosRepository } from './env'

const parserVersion = 'youtube-takeout@5'
const parserId = 'v5'
const defaultChunkSize = 100
const maximumChunkSize = 100

export interface YoutubeTakeoutImportOptions {
  /** Stable, non-secret key identifying the Google account or channel lineage. */
  connectionKey?: string
  connectionId?: string
  /** Non-secret label displayed for this import lineage. */
  connectionLabel?: string
  /** Intended for tests and controlled callers. D1-safe values are capped at 100. */
  chunkSize?: number
}

export interface YoutubeTakeoutImportResult {
  syncRunId: string
  importId: string
  alreadyImported: boolean
  completed: boolean
  nextOffset: number | null
  totalRecords: number
  activityCards: number
  videos: number
  archiveEntries: number
  sourceRecords: number
  unresolvedRecords: number
  ignoredRecords: number
  watchLaterRecords: number
  queueEntries: number
  subscriptionRecords: number
  channels: number
  components: readonly {
    kind: string
    status: string
    records: number
  }[]
}

interface YoutubeCheckpoint {
  archiveSha256: string
  completed: boolean
  nextOffset: number
  totalRecords: number
}

interface ImportContext {
  archiveChecksum: string
  connectionHash: string
  cursorName: string
  connection: SourceConnection
  rawObject: RawObject
  repository: CanonicalLedgerRepository
  videosRepository: ReturnType<typeof createVideosRepository>
  runningRun: SyncRun
}

type OrderedTakeoutRecord =
  | { index: number; kind: 'watch'; value: YoutubeWatchEntry }
  | { index: number; kind: 'watch_later'; value: YoutubeWatchLaterEntry }
  | { index: number; kind: 'subscription'; value: YoutubeSubscriptionEntry }
  | { index: number; kind: 'playlist'; value: YoutubePlaylistEntry }

export class YoutubeTakeoutImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'YoutubeTakeoutImportError'
  }
}

function instantNow(): ReturnType<typeof utcInstant> {
  return utcInstant(new Date().toISOString())
}

function safeErrorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError'
}

async function checksum(bytes: Uint8Array): Promise<{ digest: ArrayBuffer; hex: string }> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer)
  return {
    digest,
    hex: [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join(''),
  }
}

async function stableHash(value: string): Promise<string> {
  return (await checksum(new TextEncoder().encode(value))).hex
}

function normalizedConnectionOption(value: string | undefined, fallback: string): string {
  const normalized = value?.trim() ?? fallback
  if (normalized.length === 0 || normalized.length > 200) {
    throw new YoutubeTakeoutImportError('The YouTube connection name is invalid')
  }
  return normalized
}

function normalizedChunkSize(value: number | undefined): number {
  if (value === undefined) return defaultChunkSize
  if (!Number.isInteger(value) || value < 1) {
    throw new YoutubeTakeoutImportError('The YouTube import chunk size is invalid')
  }
  return Math.min(value, maximumChunkSize)
}

async function connectionForImport(
  repository: CanonicalLedgerRepository,
  now: ReturnType<typeof utcInstant>,
  options: YoutubeTakeoutImportOptions,
): Promise<SourceConnection> {
  if (options.connectionId !== undefined) {
    const existing = (await repository.listConnections()).find(
      (c) => c.id === options.connectionId && c.source === 'youtube',
    )
    if (existing === undefined) throw new YoutubeTakeoutImportError('Unknown YouTube connection')
    return { ...existing, status: 'connected', updatedAt: now }
  }
  const key = normalizedConnectionOption(options.connectionKey, 'default')
  const label = normalizedConnectionOption(options.connectionLabel, 'YouTube Takeout')
  const keyHash = await stableHash(`youtube-connection:${key}`)
  const id = connectionId(`youtube_${keyHash}`)
  const existing = (await repository.listConnections()).find((connection) => connection.id === id)
  const sameExisting = existing?.id === id ? existing : null
  return {
    id,
    source: 'youtube',
    label,
    status: 'connected',
    coverage: 'complete',
    createdAt: sameExisting?.createdAt ?? now,
    updatedAt: now,
  }
}

function dispositionForWatch(entry: YoutubeWatchEntry): {
  disposition: SourceRecordDisposition
  errorCode: string | null
} {
  if (entry.action !== 'Watched') return { disposition: 'ignored', errorCode: null }
  if (entry.videoId === null) {
    return { disposition: 'unresolved', errorCode: 'missing_video_identity' }
  }
  if (entry.occurredAt === null) {
    return { disposition: 'unresolved', errorCode: 'invalid_or_missing_timestamp' }
  }
  return { disposition: 'normalized', errorCode: null }
}

function sourceKeyForWatch(entry: YoutubeWatchEntry): string | null {
  if (entry.action !== 'Watched' || entry.videoId === null) return null
  const sourceTime = entry.occurredAt ?? entry.occurredAtRaw
  return sourceTime === null ? `watch:${entry.videoId}` : `watch:${entry.videoId}:${sourceTime}`
}

function canonicalWatchUrl(videoId: string): string {
  const url = new URL('https://www.youtube.com/watch')
  url.searchParams.set('v', videoId)
  return url.toString()
}

function orderedRecords(takeout: YoutubeTakeout): OrderedTakeoutRecord[] {
  return [
    ...takeout.watchHistory.map((value, index): OrderedTakeoutRecord => ({
      index,
      kind: 'watch',
      value,
    })),
    ...takeout.watchLater.map((value, index): OrderedTakeoutRecord => ({
      index,
      kind: 'watch_later',
      value,
    })),
    ...takeout.subscriptions.map((value, index): OrderedTakeoutRecord => ({
      index,
      kind: 'subscription',
      value,
    })),
    ...takeout.playlists.map((value, index): OrderedTakeoutRecord => ({
      index,
      kind: 'playlist',
      value,
    })),
  ]
}

function checkpointValue(value: unknown): YoutubeCheckpoint | null {
  if (typeof value !== 'object' || value === null) return null
  const checkpoint = value as Partial<YoutubeCheckpoint>
  return typeof checkpoint.archiveSha256 === 'string' &&
    typeof checkpoint.completed === 'boolean' &&
    typeof checkpoint.nextOffset === 'number' &&
    typeof checkpoint.totalRecords === 'number'
    ? (checkpoint as YoutubeCheckpoint)
    : null
}

async function importContext(
  bindings: Bindings,
  archive: Uint8Array,
  options: YoutubeTakeoutImportOptions,
): Promise<{
  context: ImportContext
  checkpoint: YoutubeCheckpoint | null
  archiveDigest: ArrayBuffer
  rawAlreadyExists: boolean
}> {
  const repository = createLedgerRepository(bindings.DB, bindings.DATABASE_USAGE_OBSERVER)
  const videosRepository = createVideosRepository(bindings.DB, bindings.DATABASE_USAGE_OBSERVER)
  const startedAt = instantNow()
  const connection = await connectionForImport(repository, startedAt, options)
  const archiveHash = await checksum(archive)
  const connectionHash = await stableHash(connection.id)
  const rawId = rawObjectId(`youtube_raw_${connectionHash}_${archiveHash.hex}`)
  const acquisitionKey = `youtube:takeout:sha256:${archiveHash.hex}`
  const cursorName = `${acquisitionKey}:${parserVersion}`
  const storageKey = `raw/youtube/sha256/${archiveHash.hex.slice(0, 2)}/${archiveHash.hex}.zip`

  await repository.saveConnection(connection)
  const rawAlreadyExists =
    (await repository.findRawObjectId(connection.id, acquisitionKey)) !== null
  const cursor = await repository.findSyncCursor(connection.id, cursorName)
  const checkpoint = checkpointValue(cursor?.checkpoint)
  const runId = syncRunId(
    `youtube_run_${parserId}_${connectionHash}_${archiveHash.hex}_offset_${checkpoint?.nextOffset ?? 0}`,
  )
  const runningRun: SyncRun = {
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
  const rawObject: RawObject = {
    id: rawId,
    connectionId: connection.id,
    syncRunId: runId,
    kind: 'export',
    acquisitionKey,
    storageKey,
    sha256: archiveHash.hex,
    contentType: 'application/zip',
    byteLength: archive.byteLength,
    acquiredAt: startedAt,
    processingStatus: 'pending',
    lastParserVersion: null,
    processingError: null,
  }

  if (checkpoint?.completed !== true) await repository.saveSyncRun(runningRun)

  return {
    context: {
      archiveChecksum: archiveHash.hex,
      connectionHash,
      cursorName,
      connection,
      rawObject,
      repository,
      videosRepository,
      runningRun,
    },
    checkpoint,
    archiveDigest: archiveHash.digest,
    rawAlreadyExists,
  }
}

function emptyResult(
  context: ImportContext,
  takeout: YoutubeTakeout,
  totalRecords: number,
): YoutubeTakeoutImportResult {
  return {
    syncRunId: context.runningRun.id,
    importId: context.archiveChecksum,
    alreadyImported: true,
    completed: true,
    nextOffset: null,
    totalRecords,
    activityCards: takeout.watchHistory.length,
    videos: 0,
    archiveEntries: 0,
    sourceRecords: 0,
    unresolvedRecords: 0,
    ignoredRecords: 0,
    watchLaterRecords: takeout.watchLater.length,
    queueEntries: 0,
    subscriptionRecords: takeout.subscriptions.length,
    channels: 0,
    components: takeout.components.map((component) => ({
      kind: component.kind,
      status: component.status,
      records: component.recordCount,
    })),
  }
}

async function normalizeChunk(
  context: ImportContext,
  takeout: YoutubeTakeout,
  offset: number,
  chunkSize: number,
): Promise<YoutubeTakeoutImportResult> {
  const records = orderedRecords(takeout)
  if (!Number.isInteger(offset) || offset < 0 || offset > records.length) {
    throw new YoutubeTakeoutImportError('The YouTube import continuation is invalid')
  }
  const chunk = records.slice(offset, offset + chunkSize)
  const observedAt = instantNow()
  const sourceRecords: SourceRecord[] = []
  const mediaItems = new Map<string, MediaItem>()
  const identities = new Map<string, ExternalIdentity>()
  const archiveEntries: ArchiveEntryWrite[] = []
  const watchProjections: YoutubeWatchProjection[] = []
  let unresolvedRecords = 0
  let ignoredRecords = 0
  let watchLaterRecords = 0
  let subscriptionRecords = 0
  const projectedChannels = new Set<string>()

  async function ensureVideo(
    videoId: string,
    sourceRecordIdValue: ReturnType<typeof sourceRecordId>,
    title: string | null,
    channelTitle: string | null,
    candidateUrl: string | null,
  ) {
    const videoHash = await stableHash(`youtube-video:${videoId}`)
    const itemId = mediaItemId(`youtube_media_${videoHash}`)
    const identityId = externalIdentityId(`youtube_identity_${videoHash}`)
    const url = candidateUrl ?? canonicalWatchUrl(videoId)
    if (!mediaItems.has(videoId)) {
      mediaItems.set(videoId, {
        id: itemId,
        type: 'video',
        title,
        subtitle: null,
        primaryCreatorName: channelTitle,
        description: null,
        canonicalUrl: url,
        imageUrl: null,
        publishedAt: null,
        durationMs: null,
        createdAt: observedAt,
        updatedAt: observedAt,
      })
    }
    const earlierIdentity = identities.get(videoId)
    identities.set(videoId, {
      id: identityId,
      mediaItemId: itemId,
      namespace: 'youtube',
      externalType: 'video_id',
      externalId: videoId,
      scope: { kind: 'global' },
      canonicalUrl: url,
      firstObservedSourceRecordId:
        earlierIdentity?.firstObservedSourceRecordId ?? sourceRecordIdValue,
      lastObservedSourceRecordId: sourceRecordIdValue,
      retiredAt: null,
    })
    return { itemId, identityId, url }
  }

  const ordinals = new Map<string, number>()
  const occurrenceRanks = new Map<number, number>()
  for (const ordered of records) {
    if (ordered.kind !== 'watch' || dispositionForWatch(ordered.value).disposition !== 'normalized')
      continue
    const key = `${ordered.value.videoId}:${ordered.value.occurredAt}`
    const rank = ordinals.get(key) ?? 0
    occurrenceRanks.set(ordered.index, rank)
    ordinals.set(key, rank + 1)
  }
  for (const ordered of chunk) {
    if (ordered.kind === 'watch_later') {
      const entry = ordered.value
      watchLaterRecords += 1
      const recordId = sourceRecordId(
        `youtube_sr_${parserId}_${context.connectionHash}_${context.archiveChecksum}_watch_later_${ordered.index + 2}`,
      )
      const parsedAddedAt =
        entry.addedAt === null || Number.isNaN(Date.parse(entry.addedAt))
          ? null
          : new Date(entry.addedAt).toISOString()
      const usable = entry.videoId !== null
      if (!usable) unresolvedRecords += 1
      sourceRecords.push({
        id: recordId,
        rawObjectId: context.rawObject.id,
        connectionId: context.connection.id,
        recordType: 'watch_later',
        recordPath: `playlists/Watch later-videos.csv#row=${ordered.index + 2}`,
        sourceRecordKey: entry.videoId === null ? null : `watch_later:${entry.videoId}`,
        sourceRecordedAt: parsedAddedAt === null ? null : temporalInstant(parsedAddedAt),
        observedAt,
        parserVersion,
        contentSha256: null,
        disposition: usable ? 'normalized' : 'unresolved',
        upstreamState: 'active',
        errorCode: usable ? null : 'missing_video_identity',
      })
      if (entry.videoId !== null) await ensureVideo(entry.videoId, recordId, null, null, null)
      continue
    }

    if (ordered.kind === 'subscription') {
      const entry = ordered.value
      subscriptionRecords += 1
      const recordId = sourceRecordId(
        `youtube_sr_${parserId}_${context.connectionHash}_${context.archiveChecksum}_subscription_${ordered.index + 2}`,
      )
      const channelId = entry.channelId?.trim() || youtubeChannelId(entry.channelUrl) || null
      if (channelId === null) unresolvedRecords += 1
      else projectedChannels.add(channelId)
      sourceRecords.push({
        id: recordId,
        rawObjectId: context.rawObject.id,
        connectionId: context.connection.id,
        recordType: 'channel_subscription',
        recordPath: `subscriptions/subscriptions.csv#row=${ordered.index + 2}`,
        sourceRecordKey: channelId === null ? null : `subscription:${channelId}`,
        sourceRecordedAt: null,
        observedAt,
        parserVersion,
        contentSha256: null,
        disposition: channelId === null ? 'unresolved' : 'normalized',
        upstreamState: 'active',
        errorCode: channelId === null ? 'missing_channel_identity' : null,
      })
      continue
    }

    if (ordered.kind === 'playlist') {
      const entry = ordered.value
      sourceRecords.push({
        id: sourceRecordId(
          `youtube_sr_${parserId}_${context.connectionHash}_${context.archiveChecksum}_playlist_${ordered.index + 2}`,
        ),
        rawObjectId: context.rawObject.id,
        connectionId: context.connection.id,
        recordType: 'playlist_metadata',
        recordPath: `playlists/playlists.csv#row=${ordered.index + 2}`,
        sourceRecordKey: entry.playlistId === null ? null : `playlist:${entry.playlistId}`,
        sourceRecordedAt:
          entry.updatedAt === null || Number.isNaN(Date.parse(entry.updatedAt))
            ? null
            : temporalInstant(new Date(entry.updatedAt).toISOString()),
        observedAt,
        parserVersion,
        contentSha256: null,
        disposition: entry.playlistId === null ? 'unresolved' : 'normalized',
        upstreamState: 'active',
        errorCode: entry.playlistId === null ? 'missing_playlist_identity' : null,
      })
      continue
    }

    const entry = ordered.value
    const classification = dispositionForWatch(entry)
    if (classification.disposition === 'unresolved') unresolvedRecords += 1
    if (classification.disposition === 'ignored') ignoredRecords += 1
    const recordId = sourceRecordId(
      `youtube_sr_${parserId}_${context.connectionHash}_${context.archiveChecksum}_watch_${ordered.index + 1}`,
    )
    const sourceRecord: SourceRecord = {
      id: recordId,
      rawObjectId: context.rawObject.id,
      connectionId: context.connection.id,
      recordType: 'watch_activity',
      recordPath: `history/watch-history.html#card=${ordered.index + 1}`,
      sourceRecordKey: sourceKeyForWatch(entry),
      sourceRecordedAt: entry.occurredAt === null ? null : temporalInstant(entry.occurredAt),
      observedAt,
      parserVersion,
      contentSha256: null,
      disposition: classification.disposition,
      upstreamState: 'active',
      errorCode: classification.errorCode,
    }
    sourceRecords.push(sourceRecord)

    if (
      classification.disposition !== 'normalized' ||
      entry.videoId === null ||
      entry.occurredAt === null
    ) {
      continue
    }

    const { itemId, identityId, url } = await ensureVideo(
      entry.videoId,
      recordId,
      entry.title,
      entry.channelTitle,
      entry.titleUrl,
    )

    const rank = occurrenceRanks.get(ordered.index)!
    const matches = await context.repository.findOccurrencesAt(
      context.connection.id,
      itemId,
      entry.occurredAt,
    )
    const known = matches[rank]
    const occurrenceKey =
      known?.sourceOccurrenceKey ?? `watch:${entry.videoId}:${entry.occurredAt}:${rank}`
    const entryId =
      known?.id ??
      archiveEntryId(`youtube_archive_${context.connectionHash}_${await stableHash(occurrenceKey)}`)
    archiveEntries.push({
      entry: {
        id: entryId,
        mediaItemId: itemId,
        connectionId: context.connection.id,
        consumedIdentityId: identityId,
        sourceOccurrenceKey: occurrenceKey,
        admissionReason: 'youtube_watched_activity',
        consumedAt: temporalInstant(entry.occurredAt),
        sourceRecordedAt: temporalInstant(entry.occurredAt),
        sourceRating: null,
        reviewText: null,
        upstreamState: 'active',
        createdAt: observedAt,
        updatedAt: observedAt,
      },
      evidence: ['admission', 'occurrence_time', 'metadata'].map((role) => ({
        id: archiveEntryEvidenceId(
          `youtube_evidence_${parserId}_${context.connectionHash}_${context.archiveChecksum}_watch_${ordered.index + 1}_${role}`,
        ),
        archiveEntryId: entryId,
        sourceRecordId: recordId,
        role: role as 'admission' | 'metadata' | 'occurrence_time',
        linkedAt: observedAt,
      })),
    })
    const channelId = youtubeChannelId(entry.channelUrl)
    if (channelId !== null) projectedChannels.add(channelId)
    watchProjections.push({
      sourceRecordId: recordId,
      archiveEntryId: entryId,
      connectionId: context.connection.id,
      mediaItemId: itemId,
      videoId: entry.videoId,
      historicalTitle: entry.title,
      sourceVideoUrl: url,
      historicalChannelTitle: entry.channelTitle,
      sourceChannelUrl: entry.channelUrl,
      channelId,
      product: entry.product,
      fromGoogleAds: entry.fromGoogleAds,
      occurredAt: entry.occurredAt,
      occurredAtRaw: entry.occurredAtRaw,
      occurrenceRank: rank,
      parserVersion,
      observedAt,
    })
  }

  const nextOffsetValue = offset + chunk.length
  const completed = nextOffsetValue >= records.length
  const componentProjections: YoutubeComponentProjection[] = takeout.components.map(
    (component) => ({
      kind: component.kind,
      memberName: component.memberName,
      status: component.status,
      recordCount: component.recordCount,
      errorCode: component.errorCode,
      snapshotSourceRecordId: null,
    }),
  )
  if (completed) {
    for (const component of componentProjections) {
      const markerId = sourceRecordId(
        `youtube_sr_${parserId}_${context.connectionHash}_${context.archiveChecksum}_component_${component.kind}`,
      )
      sourceRecords.push({
        id: markerId,
        rawObjectId: context.rawObject.id,
        connectionId: context.connection.id,
        recordType: 'takeout_component_snapshot',
        recordPath: `components/${component.kind}`,
        sourceRecordKey: `component:${component.kind}:${context.archiveChecksum}`,
        sourceRecordedAt: null,
        observedAt,
        parserVersion,
        contentSha256: null,
        disposition:
          component.status === 'complete'
            ? 'normalized'
            : component.status === 'invalid'
              ? 'invalid'
              : 'ignored',
        upstreamState: 'active',
        errorCode: component.errorCode,
      })
      component.snapshotSourceRecordId = markerId
    }
  }
  const existingCursor = await context.repository.findSyncCursor(
    context.connection.id,
    context.cursorName,
  )
  const cursor: SyncCursor = {
    id:
      existingCursor?.id ??
      syncCursorId(
        `youtube_cursor_${await stableHash(`${parserId}:${context.connection.id}:${context.archiveChecksum}`)}`,
      ),
    connectionId: context.connection.id,
    name: context.cursorName,
    checkpoint: {
      archiveSha256: context.archiveChecksum,
      completed,
      nextOffset: nextOffsetValue,
      totalRecords: records.length,
    },
    committedAt: observedAt,
    syncRunId: context.runningRun.id,
  }
  const syncRun: SyncRun = {
    ...context.runningRun,
    status: 'succeeded',
    finishedAt: observedAt,
    counts: {
      rawObjects: 1,
      sourceRecords: sourceRecords.length,
      normalizedRecords: archiveEntries.length,
      failedRecords: 0,
    },
  }

  await context.repository.commit({
    rawObjects: [
      {
        ...context.rawObject,
        processingStatus: 'processing',
        lastParserVersion: parserVersion,
      },
    ],
    sourceRecords,
    mediaItems: [...mediaItems.values()],
    externalIdentities: [...identities.values()],
    archiveEntries,
  })
  await context.videosRepository.projectWatches(watchProjections)
  if (completed) {
    const watchLater: YoutubeSnapshotMembership[] = []
    for (const [index, entry] of takeout.watchLater.entries()) {
      if (entry.videoId === null) continue
      const mediaHash = await stableHash(`youtube-video:${entry.videoId}`)
      const membershipHash = await stableHash(
        `${context.connection.id}:watch-later:${entry.videoId}`,
      )
      const addedAt =
        entry.addedAt === null || Number.isNaN(Date.parse(entry.addedAt))
          ? null
          : new Date(entry.addedAt).toISOString()
      watchLater.push({
        sourceRecordId: sourceRecordId(
          `youtube_sr_${parserId}_${context.connectionHash}_${context.archiveChecksum}_watch_later_${index + 2}`,
        ),
        mediaItemId: mediaItemId(`youtube_media_${mediaHash}`),
        videoId: entry.videoId,
        queueEntryId: `youtube_queue_${membershipHash}`,
        membershipEvidenceId: `youtube_queue_evidence_${parserId}_${membershipHash}_membership_${context.archiveChecksum}`,
        addedEvidenceId:
          addedAt === null
            ? null
            : `youtube_queue_evidence_${parserId}_${membershipHash}_added_${context.archiveChecksum}`,
        addedAt,
      })
    }
    const subscriptions: YoutubeSnapshotSubscription[] = takeout.subscriptions.flatMap(
      (entry, index) => {
        const channelId = entry.channelId?.trim() || youtubeChannelId(entry.channelUrl) || null
        return channelId === null
          ? []
          : [
              {
                sourceRecordId: sourceRecordId(
                  `youtube_sr_${parserId}_${context.connectionHash}_${context.archiveChecksum}_subscription_${index + 2}`,
                ),
                channelId,
                channelTitle: entry.channelTitle,
                channelUrl: entry.channelUrl,
              },
            ]
      },
    )
    await context.videosRepository.finalizeTakeout({
      rawObjectId: context.rawObject.id,
      connectionId: context.connection.id,
      syncRunId: context.runningRun.id,
      parserVersion,
      observedAt,
      components: componentProjections,
      watchLater,
      subscriptions,
    })
  }
  await context.repository.commit({
    syncRun,
    rawObjects: [
      {
        ...context.rawObject,
        processingStatus: completed ? 'processed' : 'processing',
        lastParserVersion: parserVersion,
      },
    ],
    cursor,
  })
  if (completed) {
    await context.repository.saveConnection({ ...context.connection, updatedAt: observedAt })
  }

  return {
    syncRunId: context.runningRun.id,
    importId: context.archiveChecksum,
    alreadyImported: false,
    completed,
    nextOffset: completed ? null : nextOffsetValue,
    totalRecords: records.length,
    activityCards: takeout.watchHistory.length,
    videos: mediaItems.size,
    archiveEntries: archiveEntries.length,
    sourceRecords: sourceRecords.length,
    unresolvedRecords,
    ignoredRecords,
    watchLaterRecords,
    queueEntries: completed
      ? takeout.watchLater.filter((entry) => entry.videoId !== null).length
      : 0,
    subscriptionRecords,
    channels: projectedChannels.size,
    components: takeout.components.map((component) => ({
      kind: component.kind,
      status: component.status,
      records: component.recordCount,
    })),
  }
}

async function markFailed(context: ImportContext, error: unknown): Promise<void> {
  const finishedAt = instantNow()
  await context.repository.commit({
    syncRun: {
      ...context.runningRun,
      status: 'failed',
      finishedAt,
      counts: { rawObjects: 1, sourceRecords: 0, normalizedRecords: 0, failedRecords: 1 },
      errorCode: safeErrorName(error),
      errorMessage: 'YouTube Takeout import failed',
    },
    rawObjects: [
      {
        ...context.rawObject,
        processingStatus: 'failed',
        lastParserVersion: parserVersion,
        processingError: safeErrorName(error),
      },
    ],
  })
  await context.repository.saveConnection({
    ...context.connection,
    status: 'degraded',
    updatedAt: finishedAt,
  })
}

/**
 * Stores a Takeout and commits at most one bounded normalization chunk. Call
 * again with the same bytes and options until `completed` is true. The durable
 * checkpoint resumes at the first uncommitted source record.
 */
export async function importYoutubeTakeout(
  bindings: Bindings,
  archive: Uint8Array,
  options: YoutubeTakeoutImportOptions = {},
): Promise<YoutubeTakeoutImportResult> {
  if (archive.byteLength === 0) {
    throw new YoutubeTakeoutImportError('The Google Takeout export is empty')
  }
  const chunkSize = normalizedChunkSize(options.chunkSize)
  const prepared = await importContext(bindings, archive, options)

  if (!prepared.rawAlreadyExists) {
    await bindings.RAW_BUCKET.put(prepared.context.rawObject.storageKey, archive, {
      httpMetadata: { contentType: 'application/zip' },
      customMetadata: { sha256: prepared.context.archiveChecksum },
      sha256: prepared.archiveDigest,
    })
    await prepared.context.repository.commit({ rawObjects: [prepared.context.rawObject] })
  }

  try {
    const takeout = inspectYoutubeTakeoutBytes(archive, 'Google Takeout')
    const records = orderedRecords(takeout)
    if (prepared.checkpoint?.completed === true) {
      return emptyResult(prepared.context, takeout, records.length)
    }
    const offset = prepared.checkpoint?.nextOffset ?? 0
    return await normalizeChunk(prepared.context, takeout, offset, chunkSize)
  } catch (error) {
    await markFailed(prepared.context, error)
    throw error instanceof YoutubeTakeoutImportError
      ? error
      : new YoutubeTakeoutImportError(
          error instanceof Error ? error.message : 'YouTube Takeout import failed',
        )
  }
}

/** Resume an existing import without asking the client or queue message to carry the ZIP again. */
export async function continueYoutubeTakeoutImport(
  bindings: Bindings,
  importId: string,
  options: YoutubeTakeoutImportOptions = {},
): Promise<YoutubeTakeoutImportResult> {
  if (!/^[a-f0-9]{64}$/.test(importId)) {
    throw new YoutubeTakeoutImportError('The YouTube import continuation is invalid')
  }
  const storageKey = `raw/youtube/sha256/${importId.slice(0, 2)}/${importId}.zip`
  const stored = await bindings.RAW_BUCKET.get(storageKey)
  if (stored === null) {
    throw new YoutubeTakeoutImportError('The YouTube import source is unavailable')
  }
  const archive =
    bindings.AUTH_MODE === 'access'
      ? await readHostedZip(stored).catch((error: unknown) => {
          if (error instanceof HostedZipError) throw new YoutubeTakeoutImportError(error.message)
          throw error
        })
      : new Uint8Array(await stored.arrayBuffer())
  if ((await checksum(archive)).hex !== importId) {
    throw new YoutubeTakeoutImportError('The YouTube import source failed verification')
  }
  return importYoutubeTakeout(bindings, archive, options)
}
