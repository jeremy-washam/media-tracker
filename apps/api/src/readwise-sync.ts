import {
  fetchReaderDocumentPage,
  normalizeReaderDocument,
  parseReaderPage,
} from '@media-tracker/connector-readwise'
import type { ReadwiseSyncResponse } from '@media-tracker/contracts'
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
  utcInstant,
  type ExternalIdentity,
  type MediaItem,
  type RawObject,
  type SourceConnection,
  type SourceRecord,
  type SyncRun,
} from '@media-tracker/domain'
import { ulid } from 'ulid'

import type { Bindings } from './env'
import { createLedgerRepository } from './env'

const parserVersion = 'readwise-documents@2'
const cursorName = 'reader-archive'
const overlapMilliseconds = 5 * 60 * 1000

export class ReadwiseTokenMissingError extends Error {
  constructor() {
    super('Readwise is not configured')
    this.name = 'ReadwiseTokenMissingError'
  }
}

function instantNow(): ReturnType<typeof utcInstant> {
  return utcInstant(new Date().toISOString())
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError'
}

function overlappedUpdatedAfter(checkpoint: unknown): string | undefined {
  if (typeof checkpoint !== 'object' || checkpoint === null) return undefined
  const updatedAfter = Reflect.get(checkpoint, 'updatedAfter')
  if (typeof updatedAfter !== 'string') return undefined
  const milliseconds = Date.parse(updatedAfter)
  if (!Number.isFinite(milliseconds)) return undefined
  return new Date(milliseconds - overlapMilliseconds).toISOString()
}

async function findAdmissionEvidenceSourceRecordId(
  database: D1Database,
  archiveId: ReturnType<typeof archiveEntryId>,
): Promise<ReturnType<typeof sourceRecordId> | null> {
  const row = await database
    .prepare(
      `SELECT source_record_id
       FROM archive_entry_evidence
       WHERE archive_entry_id = ? AND role = 'admission'
       ORDER BY linked_at, id
       LIMIT 1`,
    )
    .bind(archiveId)
    .first<{ source_record_id: string }>()
  return row === null ? null : sourceRecordId(row.source_record_id)
}

async function sha256(bytes: Uint8Array): Promise<{ digest: ArrayBuffer; hex: string }> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const hex = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
  return { digest, hex }
}

async function storeRawPage(
  bucket: R2Bucket,
  bytes: Uint8Array,
  contentType: string,
): Promise<{ byteLength: number; sha256: string; storageKey: string }> {
  const checksum = await sha256(bytes)
  const storageKey = `raw/readwise/sha256/${checksum.hex.slice(0, 2)}/${checksum.hex}.json`
  await bucket.put(storageKey, bytes, {
    httpMetadata: { contentType },
    customMetadata: { sha256: checksum.hex },
    sha256: checksum.digest,
  })
  return { byteLength: bytes.byteLength, sha256: checksum.hex, storageKey }
}

async function connectionForSync(
  repository: CanonicalLedgerRepository,
  now: ReturnType<typeof utcInstant>,
): Promise<SourceConnection> {
  const existing = await repository.findConnectionBySource('readwise')
  return {
    id: existing?.id ?? connectionId(ulid()),
    source: 'readwise',
    label: existing?.label ?? 'Readwise Reader',
    status: 'connected',
    coverage: 'partial',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
}

export async function syncReadwiseArchive(bindings: Bindings): Promise<ReadwiseSyncResponse> {
  const token = bindings.READWISE_TOKEN
  if (token === undefined || token.length === 0) throw new ReadwiseTokenMissingError()

  const repository = createLedgerRepository(bindings.DB)
  const startedAt = instantNow()
  const connection = await connectionForSync(repository, startedAt)
  const previousCursor = await repository.findSyncCursor(connection.id, cursorName)
  const updatedAfter = overlappedUpdatedAfter(previousCursor?.checkpoint)
  const runId = syncRunId(ulid())
  let pages = 0
  let rawObjectCount = 0
  let sourceRecordCount = 0
  let archiveItemCount = 0

  const runningRun: SyncRun = {
    id: runId,
    connectionId: connection.id,
    kind: previousCursor === null ? 'backfill' : 'reconcile',
    status: 'running',
    startedAt,
    finishedAt: null,
    counts: { rawObjects: 0, sourceRecords: 0, normalizedRecords: 0, failedRecords: 0 },
    errorCode: null,
    errorMessage: null,
  }

  await repository.saveConnection(connection)
  await repository.saveSyncRun(runningRun)

  try {
    let pageCursor: string | undefined
    const seenCursors = new Set<string>()

    do {
      const acquiredAt = instantNow()
      const response = await fetchReaderDocumentPage({
        token,
        ...(previousCursor === null ? { location: 'archive' as const } : {}),
        ...(updatedAfter === undefined ? {} : { updatedAfter }),
        ...(pageCursor === undefined ? {} : { pageCursor }),
      })
      const stored = await storeRawPage(bindings.RAW_BUCKET, response.bytes, response.contentType)
      const rawId = rawObjectId(ulid())
      const pendingRawObject: RawObject = {
        id: rawId,
        connectionId: connection.id,
        syncRunId: runId,
        kind: 'api_page',
        acquisitionKey: `readwise:${runId}:page:${pages + 1}`,
        storageKey: stored.storageKey,
        sha256: stored.sha256,
        contentType: response.contentType,
        byteLength: stored.byteLength,
        acquiredAt,
        processingStatus: 'pending',
        lastParserVersion: null,
        processingError: null,
      }
      await repository.commit({ rawObjects: [pendingRawObject] })
      rawObjectCount += 1

      try {
        const page = parseReaderPage(response.body)
        const sourceRecords: SourceRecord[] = []
        const mediaItems: MediaItem[] = []
        const externalIdentities: ExternalIdentity[] = []
        const archiveEntries: ArchiveEntryWrite[] = []

        for (const [index, readerDocument] of page.results.entries()) {
          const normalized = normalizeReaderDocument(readerDocument)
          const recordId = sourceRecordId(ulid())
          const identityLookup = {
            namespace: 'readwise',
            externalType: 'document_id',
            externalId: normalized.documentId,
            connectionId: connection.id,
          } as const
          const knownIdentity = await repository.findExternalIdentity(identityLookup)
          const knownArchiveEntryId = await repository.findArchiveEntryId(
            connection.id,
            `reader-document:${normalized.documentId}`,
          )
          const removesKnownArchiveEntry =
            normalized.archive === null && knownIdentity !== null && knownArchiveEntryId !== null
          const record: SourceRecord = {
            id: recordId,
            rawObjectId: rawId,
            connectionId: connection.id,
            recordType: 'reader_document',
            recordPath: `$.results[${index}]`,
            sourceRecordKey: normalized.sourceRecordKey,
            sourceRecordedAt: normalized.sourceRecordedAt,
            observedAt: acquiredAt,
            parserVersion,
            contentSha256: null,
            disposition:
              normalized.archive === null && !removesKnownArchiveEntry ? 'ignored' : 'normalized',
            upstreamState: removesKnownArchiveEntry ? 'removed' : 'active',
            errorCode: null,
          }
          sourceRecords.push(record)

          if (normalized.archive === null) {
            if (knownIdentity === null || knownArchiveEntryId === null) continue
            const admissionSourceRecordId = await findAdmissionEvidenceSourceRecordId(
              bindings.DB,
              knownArchiveEntryId,
            )
            if (admissionSourceRecordId === null) {
              throw new Error('Readwise Archive entry is missing its admission evidence')
            }
            archiveEntries.push({
              entry: {
                id: knownArchiveEntryId,
                mediaItemId: knownIdentity.mediaItemId,
                connectionId: connection.id,
                consumedIdentityId: knownIdentity.id,
                sourceOccurrenceKey: `reader-document:${normalized.documentId}`,
                admissionReason: 'readwise_archive_state',
                consumedAt: null,
                sourceRecordedAt: normalized.sourceRecordedAt,
                sourceRating: null,
                reviewText: null,
                upstreamState: 'removed',
                createdAt: acquiredAt,
                updatedAt: acquiredAt,
              },
              evidence: [
                {
                  id: archiveEntryEvidenceId(ulid()),
                  archiveEntryId: knownArchiveEntryId,
                  sourceRecordId: admissionSourceRecordId,
                  role: 'admission',
                  linkedAt: acquiredAt,
                },
                {
                  id: archiveEntryEvidenceId(ulid()),
                  archiveEntryId: knownArchiveEntryId,
                  sourceRecordId: recordId,
                  role: 'removal',
                  linkedAt: acquiredAt,
                },
              ],
            })
            continue
          }

          const itemId = knownIdentity?.mediaItemId ?? mediaItemId(ulid())
          const identityId = knownIdentity?.id ?? externalIdentityId(ulid())
          const entryId = knownArchiveEntryId ?? archiveEntryId(ulid())

          mediaItems.push({
            id: itemId,
            type: normalized.archive.mediaType,
            title: normalized.archive.title,
            subtitle: null,
            primaryCreatorName: normalized.archive.primaryCreatorName,
            description: normalized.archive.description,
            canonicalUrl: normalized.archive.canonicalUrl,
            imageUrl: normalized.archive.imageUrl,
            publishedAt: normalized.archive.publishedAt,
            durationMs: null,
            createdAt: acquiredAt,
            updatedAt: acquiredAt,
          })
          externalIdentities.push({
            id: identityId,
            mediaItemId: itemId,
            namespace: 'readwise',
            externalType: 'document_id',
            externalId: normalized.documentId,
            scope: { kind: 'connection', connectionId: connection.id },
            canonicalUrl: normalized.archive.canonicalUrl,
            firstObservedSourceRecordId: recordId,
            lastObservedSourceRecordId: recordId,
            retiredAt: null,
          })
          archiveEntries.push({
            entry: {
              id: entryId,
              mediaItemId: itemId,
              connectionId: connection.id,
              consumedIdentityId: identityId,
              sourceOccurrenceKey: normalized.archive.sourceOccurrenceKey,
              admissionReason: 'readwise_archive_state',
              consumedAt: normalized.archive.consumedAt,
              sourceRecordedAt: normalized.sourceRecordedAt,
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
                sourceRecordId: recordId,
                role: 'admission',
                linkedAt: acquiredAt,
              },
            ],
          })
        }

        const processedRawObject: RawObject = {
          ...pendingRawObject,
          processingStatus: 'processed',
          lastParserVersion: parserVersion,
        }
        await repository.commit({
          rawObjects: [processedRawObject],
          sourceRecords,
          mediaItems,
          externalIdentities,
          archiveEntries,
        })

        pages += 1
        sourceRecordCount += sourceRecords.length
        archiveItemCount += archiveEntries.length

        const nextCursor = page.nextPageCursor ?? undefined
        if (nextCursor !== undefined) {
          if (seenCursors.has(nextCursor))
            throw new Error('Readwise returned a repeated page cursor')
          seenCursors.add(nextCursor)
        }
        pageCursor = nextCursor
      } catch (error) {
        await repository.commit({
          rawObjects: [
            {
              ...pendingRawObject,
              processingStatus: 'failed',
              lastParserVersion: parserVersion,
              processingError: errorName(error),
            },
          ],
        })
        throw error
      }
    } while (pageCursor !== undefined)

    const finishedAt = instantNow()
    const succeededRun: SyncRun = {
      ...runningRun,
      status: 'succeeded',
      finishedAt,
      counts: {
        rawObjects: rawObjectCount,
        sourceRecords: sourceRecordCount,
        normalizedRecords: archiveItemCount,
        failedRecords: 0,
      },
    }
    await repository.commit({
      syncRun: succeededRun,
      cursor: {
        id: previousCursor?.id ?? syncCursorId(ulid()),
        connectionId: connection.id,
        name: cursorName,
        checkpoint: { updatedAfter: startedAt },
        committedAt: finishedAt,
        syncRunId: runId,
      },
    })
    await repository.saveConnection({ ...connection, updatedAt: finishedAt })

    return {
      syncRunId: runId,
      pages,
      sourceRecords: sourceRecordCount,
      archiveItems: archiveItemCount,
    }
  } catch (error) {
    const finishedAt = instantNow()
    await repository.saveSyncRun({
      ...runningRun,
      status: 'failed',
      finishedAt,
      counts: {
        rawObjects: rawObjectCount,
        sourceRecords: sourceRecordCount,
        normalizedRecords: archiveItemCount,
        failedRecords: 1,
      },
      errorCode: errorName(error),
      errorMessage: 'Readwise Archive sync failed',
    })
    await repository.saveConnection({
      ...connection,
      status: 'degraded',
      updatedAt: finishedAt,
    })
    throw error
  }
}
