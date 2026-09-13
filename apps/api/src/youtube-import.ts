import {
  inspectYoutubeTakeoutBytes,
  type YoutubeTakeout,
  type YoutubeWatchEntry,
  type YoutubeWatchLaterEntry,
} from '@media-tracker/connector-youtube'
import type { ArchiveEntryWrite, CanonicalLedgerRepository } from '@media-tracker/db'
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
import { createLedgerRepository } from './env'

const parserVersion = 'youtube-takeout@2'
const parserId = 'v2'
const defaultChunkSize = 100
const maximumChunkSize = 100

export interface YoutubeTakeoutImportOptions {
  /** Stable, non-secret key identifying the Google account or channel lineage. */
  connectionKey?: string
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
  runningRun: SyncRun
}

type OrderedTakeoutRecord =
  | { index: number; kind: 'watch'; value: YoutubeWatchEntry }
  | { index: number; kind: 'watch_later'; value: YoutubeWatchLaterEntry }

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
  const key = normalizedConnectionOption(options.connectionKey, 'default')
  const label = normalizedConnectionOption(options.connectionLabel, 'YouTube Takeout')
  const keyHash = await stableHash(`youtube-connection:${key}`)
  const id = connectionId(`youtube_${keyHash}`)
  const existing = await repository.findConnectionBySource('youtube')
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
  const repository = createLedgerRepository(bindings.DB)
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
    `youtube_run_${connectionHash}_${archiveHash.hex}_offset_${checkpoint?.nextOffset ?? 0}`,
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
  let unresolvedRecords = 0
  let ignoredRecords = 0
  let watchLaterRecords = 0

  for (const ordered of chunk) {
    if (ordered.kind === 'watch_later') {
      const entry = ordered.value
      ignoredRecords += 1
      watchLaterRecords += 1
      sourceRecords.push({
        id: sourceRecordId(
          `youtube_sr_${parserId}_${context.connectionHash}_${context.archiveChecksum}_watch_later_${ordered.index + 2}`,
        ),
        rawObjectId: context.rawObject.id,
        connectionId: context.connection.id,
        recordType: 'watch_later',
        recordPath: `playlists/Watch later-videos.csv#row=${ordered.index + 2}`,
        sourceRecordKey: entry.videoId === null ? null : `watch_later:${entry.videoId}`,
        sourceRecordedAt:
          entry.addedAt === null || Number.isNaN(Date.parse(entry.addedAt))
            ? null
            : temporalInstant(new Date(entry.addedAt).toISOString()),
        observedAt,
        parserVersion,
        contentSha256: null,
        disposition: 'ignored',
        upstreamState: 'active',
        errorCode: null,
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

    const videoHash = await stableHash(`youtube-video:${entry.videoId}`)
    const itemId = mediaItemId(`youtube_media_${videoHash}`)
    const identityId = externalIdentityId(`youtube_identity_${videoHash}`)
    const url = entry.titleUrl ?? canonicalWatchUrl(entry.videoId)

    if (!mediaItems.has(entry.videoId)) {
      mediaItems.set(entry.videoId, {
        id: itemId,
        type: 'video',
        title: entry.title,
        subtitle: null,
        primaryCreatorName: entry.channelTitle,
        description: null,
        canonicalUrl: url,
        imageUrl: null,
        publishedAt: null,
        durationMs: null,
        createdAt: observedAt,
        updatedAt: observedAt,
      })
    }
    const earlierIdentity = identities.get(entry.videoId)
    identities.set(entry.videoId, {
      id: identityId,
      mediaItemId: itemId,
      namespace: 'youtube',
      externalType: 'video_id',
      externalId: entry.videoId,
      scope: { kind: 'global' },
      canonicalUrl: url,
      firstObservedSourceRecordId: earlierIdentity?.firstObservedSourceRecordId ?? recordId,
      lastObservedSourceRecordId: recordId,
      retiredAt: null,
    })

    const occurrenceKey = `takeout:${context.archiveChecksum}:watch:${ordered.index + 1}`
    const entryId = archiveEntryId(
      `youtube_archive_${context.connectionHash}_${context.archiveChecksum}_watch_${ordered.index + 1}`,
    )
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
  }

  const nextOffsetValue = offset + chunk.length
  const completed = nextOffsetValue >= records.length
  const existingCursor = await context.repository.findSyncCursor(
    context.connection.id,
    context.cursorName,
  )
  const cursor: SyncCursor = {
    id:
      existingCursor?.id ??
      syncCursorId(
        `youtube_cursor_${await stableHash(`${context.connection.id}:${context.archiveChecksum}`)}`,
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
    syncRun,
    rawObjects: [
      {
        ...context.rawObject,
        processingStatus: completed ? 'processed' : 'processing',
        lastParserVersion: parserVersion,
      },
    ],
    sourceRecords,
    mediaItems: [...mediaItems.values()],
    externalIdentities: [...identities.values()],
    archiveEntries,
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
  const archive = new Uint8Array(await stored.arrayBuffer())
  if ((await checksum(archive)).hex !== importId) {
    throw new YoutubeTakeoutImportError('The YouTube import source failed verification')
  }
  return importYoutubeTakeout(bindings, archive, options)
}
