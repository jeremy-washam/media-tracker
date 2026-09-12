import {
  parseLetterboxdExportBytes,
  type LetterboxdRecordReference,
} from '@media-tracker/connector-letterboxd'
import type { LetterboxdImportResponse } from '@media-tracker/contracts'
import type { ArchiveEntryWrite, CanonicalLedgerRepository } from '@media-tracker/db'
import {
  archiveEntryEvidenceId,
  archiveEntryId,
  connectionId,
  externalIdentityId,
  mediaItemId,
  rawObjectId,
  sourceRating,
  sourceRecordId,
  syncRunId,
  temporalDay,
  temporalYear,
  utcInstant,
  type ArchiveEvidenceRole,
  type ArchiveEntryEvidence,
  type ExternalIdentity,
  type MediaItem,
  type RawObject,
  type SourceConnection,
  type SourceRecord,
  type SourceRecordDisposition,
  type SyncRun,
} from '@media-tracker/domain'
import { ulid } from 'ulid'

import type { Bindings } from './env'
import { createLedgerRepository } from './env'

const parserVersion = 'letterboxd-export@1'

export class LetterboxdImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LetterboxdImportError'
  }
}

function instantNow(): ReturnType<typeof utcInstant> {
  return utcInstant(new Date().toISOString())
}

function safeErrorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError'
}

async function checksum(bytes: Uint8Array): Promise<{ digest: ArrayBuffer; hex: string }> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return {
    digest,
    hex: [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join(''),
  }
}

async function connectionForImport(
  repository: CanonicalLedgerRepository,
  now: ReturnType<typeof utcInstant>,
): Promise<SourceConnection> {
  const existing = await repository.findConnectionBySource('letterboxd')
  return {
    id: existing?.id ?? connectionId(ulid()),
    source: 'letterboxd',
    label: existing?.label ?? 'Letterboxd export',
    status: 'connected',
    coverage: 'complete',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
}

function sourceRecordedAt(reference: LetterboxdRecordReference) {
  return reference.sourceRecordedOn === null ? null : temporalDay(reference.sourceRecordedOn)
}

export async function importLetterboxdExport(
  bindings: Bindings,
  archive: Uint8Array,
): Promise<LetterboxdImportResponse> {
  if (archive.byteLength === 0) throw new LetterboxdImportError('The Letterboxd export is empty')

  const repository = createLedgerRepository(bindings.DB)
  const startedAt = instantNow()
  const connection = await connectionForImport(repository, startedAt)
  const runId = syncRunId(ulid())
  const archiveChecksum = await checksum(archive)
  const acquisitionKey = `letterboxd:export:sha256:${archiveChecksum.hex}`
  const runningRun: SyncRun = {
    id: runId,
    connectionId: connection.id,
    kind: 'import',
    status: 'running',
    startedAt,
    finishedAt: null,
    counts: { rawObjects: 0, sourceRecords: 0, normalizedRecords: 0, failedRecords: 0 },
    errorCode: null,
    errorMessage: null,
  }

  await repository.saveConnection(connection)
  await repository.saveSyncRun(runningRun)

  const previouslyImported = await repository.findRawObjectId(connection.id, acquisitionKey)
  if (previouslyImported !== null) {
    const finishedAt = instantNow()
    await repository.saveSyncRun({ ...runningRun, status: 'succeeded', finishedAt })
    await repository.saveConnection({ ...connection, updatedAt: finishedAt })
    return {
      syncRunId: runId,
      alreadyImported: true,
      films: 0,
      archiveEntries: 0,
      sourceRecords: 0,
      unresolvedRecords: 0,
    }
  }

  const rawId = rawObjectId(ulid())
  const storageKey = `raw/letterboxd/sha256/${archiveChecksum.hex.slice(0, 2)}/${archiveChecksum.hex}.zip`
  const pendingRawObject: RawObject = {
    id: rawId,
    connectionId: connection.id,
    syncRunId: runId,
    kind: 'export',
    acquisitionKey,
    storageKey,
    sha256: archiveChecksum.hex,
    contentType: 'application/zip',
    byteLength: archive.byteLength,
    acquiredAt: startedAt,
    processingStatus: 'pending',
    lastParserVersion: null,
    processingError: null,
  }

  await bindings.RAW_BUCKET.put(storageKey, archive, {
    httpMetadata: { contentType: 'application/zip' },
    customMetadata: { sha256: archiveChecksum.hex },
    sha256: archiveChecksum.digest,
  })
  await repository.commit({ rawObjects: [pendingRawObject] })

  try {
    const projection = parseLetterboxdExportBytes(archive)
    const sourceRecords: SourceRecord[] = []
    const sourceRecordByPath = new Map<string, SourceRecord>()
    const mediaItems: MediaItem[] = []
    const externalIdentities: ExternalIdentity[] = []
    const archiveEntries: ArchiveEntryWrite[] = []

    const addSourceRecord = (
      reference: LetterboxdRecordReference,
      recordType: string,
      disposition: SourceRecordDisposition,
    ): SourceRecord => {
      const existing = sourceRecordByPath.get(reference.recordPath)
      if (existing !== undefined) return existing
      const record: SourceRecord = {
        id: sourceRecordId(ulid()),
        rawObjectId: rawId,
        connectionId: connection.id,
        recordType,
        recordPath: reference.recordPath,
        sourceRecordKey: reference.sourceRecordKey,
        sourceRecordedAt: sourceRecordedAt(reference),
        observedAt: startedAt,
        parserVersion,
        contentSha256: null,
        disposition,
        upstreamState: 'active',
        errorCode: null,
      }
      sourceRecords.push(record)
      sourceRecordByPath.set(reference.recordPath, record)
      return record
    }

    for (const film of projection.films) {
      const watchedRecord = addSourceRecord(film.watchedRecord, 'watched_film', 'normalized')
      const knownFilmIdentity = await repository.findExternalIdentity({
        namespace: 'letterboxd',
        externalType: 'film_uri',
        externalId: film.filmUri,
        connectionId: null,
      })
      const itemId = knownFilmIdentity?.mediaItemId ?? mediaItemId(ulid())
      const filmIdentityId = knownFilmIdentity?.id ?? externalIdentityId(ulid())

      mediaItems.push({
        id: itemId,
        type: 'movie',
        title: film.title,
        subtitle: null,
        primaryCreatorName: null,
        description: null,
        canonicalUrl: film.filmUri,
        imageUrl: null,
        publishedAt: temporalYear(film.releaseYear),
        durationMs: null,
        createdAt: startedAt,
        updatedAt: startedAt,
      })
      externalIdentities.push({
        id: filmIdentityId,
        mediaItemId: itemId,
        namespace: 'letterboxd',
        externalType: 'film_uri',
        externalId: film.filmUri,
        scope: { kind: 'global' },
        canonicalUrl: film.filmUri,
        firstObservedSourceRecordId: watchedRecord.id,
        lastObservedSourceRecordId: watchedRecord.id,
        retiredAt: null,
      })

      if (film.diaryOccurrences.length === 0) {
        const occurrenceKey = `watched:${film.filmUri}`
        const knownEntryId = await repository.findArchiveEntryId(connection.id, occurrenceKey)
        const entryId = knownEntryId ?? archiveEntryId(ulid())
        const evidence: ArchiveEntryEvidence[] = [
          {
            id: archiveEntryEvidenceId(ulid()),
            archiveEntryId: entryId,
            sourceRecordId: watchedRecord.id,
            role: 'admission' as const,
            linkedAt: startedAt,
          },
        ]
        if (film.ratingRecord !== null) {
          const ratingRecord = addSourceRecord(film.ratingRecord, 'film_rating', 'normalized')
          evidence.push({
            id: archiveEntryEvidenceId(ulid()),
            archiveEntryId: entryId,
            sourceRecordId: ratingRecord.id,
            role: 'rating',
            linkedAt: startedAt,
          })
        }
        archiveEntries.push({
          entry: {
            id: entryId,
            mediaItemId: itemId,
            connectionId: connection.id,
            consumedIdentityId: filmIdentityId,
            sourceOccurrenceKey: occurrenceKey,
            admissionReason: 'letterboxd_watched_state',
            consumedAt: null,
            sourceRecordedAt: sourceRecordedAt(film.watchedRecord),
            sourceRating:
              film.currentRating === null ? null : sourceRating(film.currentRating, 0.5, 5),
            reviewText: null,
            upstreamState: 'active',
            createdAt: startedAt,
            updatedAt: startedAt,
          },
          evidence,
        })
        continue
      }

      if (film.ratingRecord !== null) {
        addSourceRecord(film.ratingRecord, 'film_rating', 'ignored')
      }
      for (const occurrence of film.diaryOccurrences) {
        const diaryRecord = addSourceRecord(occurrence, 'diary_entry', 'normalized')
        const knownDiaryIdentity = await repository.findExternalIdentity({
          namespace: 'letterboxd',
          externalType: 'diary_uri',
          externalId: occurrence.diaryUri,
          connectionId: connection.id,
        })
        const diaryIdentityId = knownDiaryIdentity?.id ?? externalIdentityId(ulid())
        externalIdentities.push({
          id: diaryIdentityId,
          mediaItemId: itemId,
          namespace: 'letterboxd',
          externalType: 'diary_uri',
          externalId: occurrence.diaryUri,
          scope: { kind: 'connection', connectionId: connection.id },
          canonicalUrl: occurrence.diaryUri,
          firstObservedSourceRecordId: diaryRecord.id,
          lastObservedSourceRecordId: diaryRecord.id,
          retiredAt: null,
        })

        const occurrenceKey = `diary:${occurrence.diaryUri}`
        const knownEntryId = await repository.findArchiveEntryId(connection.id, occurrenceKey)
        const entryId = knownEntryId ?? archiveEntryId(ulid())
        const evidenceRoles: ArchiveEvidenceRole[] = ['admission', 'occurrence_time']
        if (occurrence.rating !== null) evidenceRoles.push('rating')
        const evidence = evidenceRoles.map((role) => ({
          id: archiveEntryEvidenceId(ulid()),
          archiveEntryId: entryId,
          sourceRecordId: diaryRecord.id,
          role,
          linkedAt: startedAt,
        }))
        if (occurrence.reviewRecord !== null) {
          const reviewRecord = addSourceRecord(occurrence.reviewRecord, 'review', 'normalized')
          evidence.push({
            id: archiveEntryEvidenceId(ulid()),
            archiveEntryId: entryId,
            sourceRecordId: reviewRecord.id,
            role: 'review',
            linkedAt: startedAt,
          })
        }
        archiveEntries.push({
          entry: {
            id: entryId,
            mediaItemId: itemId,
            connectionId: connection.id,
            consumedIdentityId: diaryIdentityId,
            sourceOccurrenceKey: occurrenceKey,
            admissionReason: 'letterboxd_diary_entry',
            consumedAt: temporalDay(occurrence.consumedOn),
            sourceRecordedAt: sourceRecordedAt(occurrence),
            sourceRating:
              occurrence.rating === null ? null : sourceRating(occurrence.rating, 0.5, 5),
            reviewText: occurrence.reviewText,
            upstreamState: 'active',
            createdAt: startedAt,
            updatedAt: startedAt,
          },
          evidence,
        })
      }
    }

    for (const unresolved of projection.unresolvedDiaryRecords) {
      addSourceRecord(unresolved, 'diary_entry', 'unresolved')
    }

    const finishedAt = instantNow()
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
    })
    await repository.saveConnection({ ...connection, updatedAt: finishedAt })

    return {
      syncRunId: runId,
      alreadyImported: false,
      films: projection.films.length,
      archiveEntries: archiveEntries.length,
      sourceRecords: sourceRecords.length,
      unresolvedRecords: projection.unresolvedDiaryRecords.length,
    }
  } catch (error) {
    const finishedAt = instantNow()
    await repository.commit({
      syncRun: {
        ...runningRun,
        status: 'failed',
        finishedAt,
        counts: { rawObjects: 1, sourceRecords: 0, normalizedRecords: 0, failedRecords: 1 },
        errorCode: safeErrorName(error),
        errorMessage: 'Letterboxd export import failed',
      },
      rawObjects: [
        {
          ...pendingRawObject,
          processingStatus: 'failed',
          lastParserVersion: parserVersion,
          processingError: safeErrorName(error),
        },
      ],
    })
    await repository.saveConnection({ ...connection, status: 'degraded', updatedAt: finishedAt })
    throw error instanceof LetterboxdImportError
      ? error
      : new LetterboxdImportError(
          error instanceof Error ? error.message : 'Letterboxd export import failed',
        )
  }
}
