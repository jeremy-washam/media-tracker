import {
  fetchLetterboxdRss,
  parseLetterboxdRssResponse,
  type LetterboxdRssEntry,
} from '@media-tracker/connector-letterboxd'
import type { LetterboxdRssSyncResponse } from '@media-tracker/contracts'
import type {
  ArchiveEntryWrite,
  ArchiveOccurrenceReference,
  CanonicalLedgerRepository,
} from '@media-tracker/db'
import {
  archiveEntryEvidenceId,
  archiveEntryId,
  calendarDate,
  connectionId,
  externalIdentityId,
  mediaItemId,
  rawObjectId,
  sourceRating,
  sourceRecordId,
  syncCursorId,
  syncRunId,
  temporalDay,
  temporalInstant,
  temporalYear,
  utcInstant,
  type ArchiveEntryEvidence,
  type ExternalIdentity,
  type ExternalIdentityId,
  type MediaItem,
  type MediaItemId,
  type RawObject,
  type SourceConnection,
  type SourceRecord,
  type SourceRecordDisposition,
  type SyncRun,
} from '@media-tracker/domain'
import { ulid } from 'ulid'

import type { Bindings } from './env'
import { createLedgerRepository } from './env'

const parserVersion = 'letterboxd-rss@1'

export class LetterboxdRssConfigurationError extends Error {
  constructor() {
    super('Letterboxd RSS is not configured')
    this.name = 'LetterboxdRssConfigurationError'
  }
}

function instantNow(): ReturnType<typeof utcInstant> {
  return utcInstant(new Date().toISOString())
}

function safeErrorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError'
}

function publishedTemporal(entry: LetterboxdRssEntry) {
  if (entry.publishedAt === null) return null
  const milliseconds = Date.parse(entry.publishedAt)
  return Number.isNaN(milliseconds) ? null : temporalInstant(new Date(milliseconds).toISOString())
}

function validYear(value: string | null): value is string {
  return value !== null && /^\d{4}$/.test(value)
}

function validRating(value: number | null): value is number {
  return (
    value !== null &&
    Number.isFinite(value) &&
    value >= 0.5 &&
    value <= 5 &&
    value * 2 === Math.round(value * 2)
  )
}

function validCalendarDate(value: string | null): value is string {
  if (value === null) return false
  try {
    calendarDate(value)
    return true
  } catch {
    return false
  }
}

async function connectionForSync(
  repository: CanonicalLedgerRepository,
  now: ReturnType<typeof utcInstant>,
): Promise<SourceConnection> {
  const existing = await repository.findConnectionBySource('letterboxd')
  return {
    id: existing?.id ?? connectionId(ulid()),
    source: 'letterboxd',
    label: existing?.label ?? 'Letterboxd RSS',
    status: 'connected',
    coverage: existing?.coverage ?? 'best_effort',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
}

async function findMedia(
  repository: CanonicalLedgerRepository,
  connection: SourceConnection,
  entry: LetterboxdRssEntry,
  pendingTmdb: ReadonlyMap<string, { id: ExternalIdentityId; itemId: MediaItemId }>,
): Promise<{
  itemId: MediaItemId | null
  diaryIdentityId: ExternalIdentityId | null
  tmdbIdentityId: ExternalIdentityId | null
}> {
  if (entry.tmdbMovieId !== null) {
    const pending = pendingTmdb.get(entry.tmdbMovieId)
    if (pending !== undefined) {
      return { itemId: pending.itemId, diaryIdentityId: null, tmdbIdentityId: pending.id }
    }
    const tmdb = await repository.findExternalIdentity({
      namespace: 'tmdb',
      externalType: 'movie_id',
      externalId: entry.tmdbMovieId,
      connectionId: null,
    })
    if (tmdb !== null) {
      return { itemId: tmdb.mediaItemId, diaryIdentityId: null, tmdbIdentityId: tmdb.id }
    }
  }

  if (entry.entryUrl !== null) {
    const diary = await repository.findExternalIdentity({
      namespace: 'letterboxd',
      externalType: 'diary_uri',
      externalId: entry.entryUrl,
      connectionId: connection.id,
    })
    if (diary !== null) {
      return { itemId: diary.mediaItemId, diaryIdentityId: diary.id, tmdbIdentityId: null }
    }
  }

  if (entry.filmTitle !== null && validYear(entry.filmYear)) {
    const matches = await repository.findMediaByExactTitleAndYear(
      'movie',
      entry.filmTitle,
      entry.filmYear,
    )
    if (matches.length === 1) {
      return { itemId: matches[0]!, diaryIdentityId: null, tmdbIdentityId: null }
    }
    if (matches.length > 1) {
      return { itemId: null, diaryIdentityId: null, tmdbIdentityId: null }
    }
  }

  return { itemId: null, diaryIdentityId: null, tmdbIdentityId: null }
}

async function findOccurrence(
  repository: CanonicalLedgerRepository,
  connection: SourceConnection,
  itemId: MediaItemId,
  diaryIdentityId: ExternalIdentityId | null,
  watchedOn: string,
): Promise<ArchiveOccurrenceReference | null | 'ambiguous'> {
  if (diaryIdentityId !== null) {
    const identityMatches = await repository.findArchiveEntriesByConsumedIdentity(
      connection.id,
      diaryIdentityId,
    )
    if (identityMatches.length === 1) return identityMatches[0]!
    if (identityMatches.length > 1) return 'ambiguous'
  }

  const dateMatches = await repository.findArchiveEntriesByMediaAndConsumedDay(
    connection.id,
    itemId,
    calendarDate(watchedOn),
  )
  if (dateMatches.length === 1) return dateMatches[0]!
  return dateMatches.length > 1 ? 'ambiguous' : null
}

export async function syncLetterboxdRss(bindings: Bindings): Promise<LetterboxdRssSyncResponse> {
  const username = bindings.LETTERBOXD_USERNAME?.trim()
  if (username === undefined || username.length === 0) {
    throw new LetterboxdRssConfigurationError()
  }

  const repository = createLedgerRepository(bindings.DB)
  const startedAt = instantNow()
  const connection = await connectionForSync(repository, startedAt)
  const runId = syncRunId(ulid())
  const runningRun: SyncRun = {
    id: runId,
    connectionId: connection.id,
    kind: 'reconcile',
    status: 'running',
    startedAt,
    finishedAt: null,
    counts: { rawObjects: 0, sourceRecords: 0, normalizedRecords: 0, failedRecords: 0 },
    errorCode: null,
    errorMessage: null,
  }
  let pendingRawObject: RawObject | null = null

  await repository.saveConnection(connection)
  await repository.saveSyncRun(runningRun)

  try {
    const response = await fetchLetterboxdRss(username)
    const storageKey = `raw/letterboxd/sha256/${response.responseHash.slice(0, 2)}/${response.responseHash}.xml`
    await bindings.RAW_BUCKET.put(storageKey, response.bytes, {
      httpMetadata: { contentType: response.contentType },
      customMetadata: { sha256: response.responseHash },
    })
    pendingRawObject = {
      id: rawObjectId(ulid()),
      connectionId: connection.id,
      syncRunId: runId,
      kind: 'rss',
      acquisitionKey: `letterboxd:rss:${runId}`,
      storageKey,
      sha256: response.responseHash,
      contentType: response.contentType,
      byteLength: response.bytes.byteLength,
      acquiredAt: utcInstant(response.fetchedAt),
      processingStatus: 'pending',
      lastParserVersion: null,
      processingError: null,
    }
    await repository.commit({ rawObjects: [pendingRawObject] })

    const previousCursor = await repository.findSyncCursor(connection.id, 'letterboxd-rss')
    const unchanged = previousCursor?.checkpoint.responseHash === response.responseHash
    const finishedAt = instantNow()

    if (unchanged) {
      const checkpointGuids = previousCursor.checkpoint.currentGuids
      const currentGuids = Array.isArray(checkpointGuids)
        ? checkpointGuids.filter((value): value is string => typeof value === 'string')
        : []
      const succeededRun: SyncRun = {
        ...runningRun,
        status: 'succeeded',
        finishedAt,
        counts: { rawObjects: 1, sourceRecords: 0, normalizedRecords: 0, failedRecords: 0 },
      }
      await repository.commit({
        syncRun: succeededRun,
        rawObjects: [
          {
            ...pendingRawObject,
            processingStatus: 'processed',
            lastParserVersion: parserVersion,
          },
        ],
        cursor: {
          id: previousCursor?.id ?? syncCursorId(ulid()),
          connectionId: connection.id,
          name: 'letterboxd-rss',
          checkpoint: {
            ...previousCursor.checkpoint,
            responseHash: response.responseHash,
            fetchedAt: response.fetchedAt,
          },
          committedAt: finishedAt,
          syncRunId: runId,
        },
      })
      await repository.saveConnection({ ...connection, updatedAt: finishedAt })
      return {
        syncRunId: runId,
        unchanged: true,
        feedEntries: currentGuids.length,
        archiveEntries: 0,
        sourceRecords: 0,
        unresolvedRecords: 0,
      }
    }

    const snapshot = await parseLetterboxdRssResponse(response)

    const sourceRecords: SourceRecord[] = []
    const mediaItems: MediaItem[] = []
    const externalIdentities: ExternalIdentity[] = []
    const pendingTmdb = new Map<string, { id: ExternalIdentityId; itemId: MediaItemId }>()
    const archiveEntries: ArchiveEntryWrite[] = []
    let unresolvedRecords = 0

    for (const [index, entry] of snapshot.entries.entries()) {
      const recordId = sourceRecordId(ulid())
      const record = (disposition: SourceRecordDisposition): SourceRecord => ({
        id: recordId,
        rawObjectId: pendingRawObject!.id,
        connectionId: connection.id,
        recordType:
          entry.kind === 'watch' || entry.kind === 'review'
            ? 'rss_movie_entry'
            : `rss_${entry.kind}_entry`,
        recordPath: `$.rss.channel.item[${index}]`,
        sourceRecordKey: entry.guid,
        sourceRecordedAt: publishedTemporal(entry),
        observedAt: utcInstant(response.fetchedAt),
        parserVersion,
        contentSha256: entry.entryHash,
        disposition,
        upstreamState: 'active',
        errorCode: null,
      })

      if (entry.kind !== 'watch' && entry.kind !== 'review') {
        sourceRecords.push(record('ignored'))
        continue
      }
      if (
        entry.filmTitle === null ||
        !validYear(entry.filmYear) ||
        !validCalendarDate(entry.watchedOn) ||
        (entry.rating !== null && !validRating(entry.rating))
      ) {
        sourceRecords.push(record('unresolved'))
        unresolvedRecords += 1
        continue
      }

      const match = await findMedia(repository, connection, entry, pendingTmdb)
      let itemId = match.itemId
      if (itemId === null && entry.tmdbMovieId !== null) itemId = mediaItemId(ulid())
      if (itemId === null) {
        sourceRecords.push(record('unresolved'))
        unresolvedRecords += 1
        continue
      }

      const sourceRecord = record('normalized')
      sourceRecords.push(sourceRecord)
      mediaItems.push({
        id: itemId,
        type: 'movie',
        title: entry.filmTitle,
        subtitle: null,
        primaryCreatorName: null,
        description: null,
        canonicalUrl: null,
        imageUrl: null,
        publishedAt: temporalYear(entry.filmYear),
        durationMs: null,
        createdAt: startedAt,
        updatedAt: startedAt,
      })

      let tmdbIdentityId = match.tmdbIdentityId
      if (entry.tmdbMovieId !== null) {
        const knownTmdb = await repository.findExternalIdentity({
          namespace: 'tmdb',
          externalType: 'movie_id',
          externalId: entry.tmdbMovieId,
          connectionId: null,
        })
        tmdbIdentityId = knownTmdb?.id ?? tmdbIdentityId ?? externalIdentityId(ulid())
        externalIdentities.push({
          id: tmdbIdentityId,
          mediaItemId: itemId,
          namespace: 'tmdb',
          externalType: 'movie_id',
          externalId: entry.tmdbMovieId,
          scope: { kind: 'global' },
          canonicalUrl: null,
          firstObservedSourceRecordId: sourceRecord.id,
          lastObservedSourceRecordId: sourceRecord.id,
          retiredAt: null,
        })
        pendingTmdb.set(entry.tmdbMovieId, { id: tmdbIdentityId, itemId })
      }

      const existingOccurrence = await findOccurrence(
        repository,
        connection,
        itemId,
        match.diaryIdentityId,
        entry.watchedOn,
      )
      if (existingOccurrence === 'ambiguous') {
        sourceRecords[sourceRecords.length - 1] = { ...sourceRecord, disposition: 'unresolved' }
        unresolvedRecords += 1
        continue
      }

      const entryId = existingOccurrence?.id ?? archiveEntryId(ulid())
      const evidence: ArchiveEntryEvidence[] = [
        {
          id: archiveEntryEvidenceId(ulid()),
          archiveEntryId: entryId,
          sourceRecordId: sourceRecord.id,
          role: 'admission',
          linkedAt: startedAt,
        },
        {
          id: archiveEntryEvidenceId(ulid()),
          archiveEntryId: entryId,
          sourceRecordId: sourceRecord.id,
          role: 'occurrence_time',
          linkedAt: startedAt,
        },
      ]
      if (entry.rating !== null) {
        evidence.push({
          id: archiveEntryEvidenceId(ulid()),
          archiveEntryId: entryId,
          sourceRecordId: sourceRecord.id,
          role: 'rating',
          linkedAt: startedAt,
        })
      }
      archiveEntries.push({
        entry: {
          id: entryId,
          mediaItemId: itemId,
          connectionId: connection.id,
          consumedIdentityId:
            existingOccurrence?.consumedIdentityId ?? match.diaryIdentityId ?? tmdbIdentityId,
          sourceOccurrenceKey: existingOccurrence?.sourceOccurrenceKey ?? `rss:${entry.guid}`,
          admissionReason: 'letterboxd_diary_entry',
          consumedAt: temporalDay(entry.watchedOn),
          sourceRecordedAt: publishedTemporal(entry),
          sourceRating: entry.rating === null ? null : sourceRating(entry.rating, 0.5, 5),
          reviewText: null,
          upstreamState: 'active',
          createdAt: startedAt,
          updatedAt: startedAt,
        },
        evidence,
      })
    }

    const succeededRun: SyncRun = {
      ...runningRun,
      status: 'succeeded',
      finishedAt,
      counts: {
        rawObjects: 1,
        sourceRecords: sourceRecords.length,
        normalizedRecords: archiveEntries.length,
        failedRecords: 0,
      },
    }
    const publishedInstants = snapshot.entries
      .map((entry) => publishedTemporal(entry)?.value ?? null)
      .filter((value): value is ReturnType<typeof utcInstant> => value !== null)
      .sort()
    await repository.commit({
      syncRun: succeededRun,
      rawObjects: [
        {
          ...pendingRawObject,
          processingStatus: 'processed',
          lastParserVersion: parserVersion,
        },
      ],
      sourceRecords,
      mediaItems,
      externalIdentities,
      archiveEntries,
      cursor: {
        id: previousCursor?.id ?? syncCursorId(ulid()),
        connectionId: connection.id,
        name: 'letterboxd-rss',
        checkpoint: {
          responseHash: response.responseHash,
          fetchedAt: response.fetchedAt,
          newestPublishedAt: publishedInstants.at(-1) ?? null,
          oldestPublishedAt: publishedInstants[0] ?? null,
          currentGuids: snapshot.entries.map((entry) => entry.guid),
        },
        committedAt: finishedAt,
        syncRunId: runId,
      },
    })
    await repository.saveConnection({ ...connection, updatedAt: finishedAt })
    return {
      syncRunId: runId,
      unchanged: false,
      feedEntries: snapshot.entries.length,
      archiveEntries: archiveEntries.length,
      sourceRecords: sourceRecords.length,
      unresolvedRecords,
    }
  } catch (error) {
    const finishedAt = instantNow()
    const rawObjects =
      pendingRawObject === null
        ? []
        : [
            {
              ...pendingRawObject,
              processingStatus: 'failed' as const,
              lastParserVersion: parserVersion,
              processingError: safeErrorName(error),
            },
          ]
    await repository.commit({
      syncRun: {
        ...runningRun,
        status: 'failed',
        finishedAt,
        counts: {
          rawObjects: pendingRawObject === null ? 0 : 1,
          sourceRecords: 0,
          normalizedRecords: 0,
          failedRecords: 1,
        },
        errorCode: safeErrorName(error),
        errorMessage: 'Letterboxd RSS sync failed',
      },
      rawObjects,
    })
    await repository.saveConnection({ ...connection, status: 'degraded', updatedAt: finishedAt })
    throw error
  }
}
