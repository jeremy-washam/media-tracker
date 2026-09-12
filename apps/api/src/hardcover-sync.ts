import {
  fetchHardcoverReadBooksPage,
  fetchHardcoverUserId,
  type HardcoverReadBook,
} from '@media-tracker/connector-hardcover'
import type { HardcoverSyncResponse } from '@media-tracker/contracts'
import type { ArchiveEntryWrite, CanonicalLedgerRepository } from '@media-tracker/db'
import {
  archiveEntryEvidenceId,
  archiveEntryId,
  calendarDate,
  calendarYear,
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
  type IdentityNamespace,
  type MediaItem,
  type MediaItemId,
  type RawObject,
  type SourceConnection,
  type SourceRecord,
  type SourceRecordId,
  type SyncRun,
} from '@media-tracker/domain'
import { ulid } from 'ulid'

import type { Bindings } from './env'
import { createLedgerRepository } from './env'

const parserVersion = 'hardcover-user-books@1'
const pageSize = 100

export class HardcoverTokenMissingError extends Error {
  constructor() {
    super('Hardcover is not configured')
    this.name = 'HardcoverTokenMissingError'
  }
}

function instantNow(): ReturnType<typeof utcInstant> {
  return utcInstant(new Date().toISOString())
}

function safeErrorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError'
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer)
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')
}

function sourceRecordedAt(book: HardcoverReadBook) {
  if (book.updatedAt === null || Number.isNaN(Date.parse(book.updatedAt))) return null
  return temporalInstant(new Date(book.updatedAt).toISOString())
}

function publishedAt(book: HardcoverReadBook) {
  if (book.releaseDate !== null) {
    try {
      calendarDate(book.releaseDate)
      return temporalDay(book.releaseDate)
    } catch {
      // Fall through to the less precise release year.
    }
  }
  if (book.releaseYear !== null) {
    try {
      calendarYear(String(book.releaseYear))
      return temporalYear(String(book.releaseYear))
    } catch {
      return null
    }
  }
  return null
}

function validFinishedDate(value: string | null): value is string {
  if (value === null) return false
  try {
    calendarDate(value)
    return true
  } catch {
    return false
  }
}

function normalizedBookRating(value: number | null) {
  return value !== null && value >= 0 && value <= 5 ? sourceRating(value, 0, 5) : null
}

async function connectionForSync(
  repository: CanonicalLedgerRepository,
  now: ReturnType<typeof utcInstant>,
): Promise<SourceConnection> {
  const existing = await repository.findConnectionBySource('hardcover')
  return {
    id: existing?.id ?? connectionId(ulid()),
    source: 'hardcover',
    label: existing?.label ?? 'Hardcover',
    status: 'connected',
    coverage: 'complete',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
}

type PendingIdentity = { id: ExternalIdentityId; mediaItemId: MediaItemId }

function identityKey(
  namespace: IdentityNamespace,
  externalType: string,
  externalId: string,
): string {
  return `${namespace}:${externalType}:${externalId}`
}

async function findOrCreateIdentity(
  repository: CanonicalLedgerRepository,
  pending: Map<string, PendingIdentity>,
  input: {
    namespace: IdentityNamespace
    externalType: string
    externalId: string
    mediaItemId: MediaItemId
    sourceRecordId: SourceRecordId
  },
): Promise<ExternalIdentity> {
  const key = identityKey(input.namespace, input.externalType, input.externalId)
  const queued = pending.get(key)
  const known =
    queued ??
    (await repository.findExternalIdentity({
      namespace: input.namespace,
      externalType: input.externalType,
      externalId: input.externalId,
      connectionId: null,
    }))
  const id = known?.id ?? externalIdentityId(ulid())
  const mediaId = known?.mediaItemId ?? input.mediaItemId
  pending.set(key, { id, mediaItemId: mediaId })
  return {
    id,
    mediaItemId: mediaId,
    namespace: input.namespace,
    externalType: input.externalType,
    externalId: input.externalId,
    scope: { kind: 'global' },
    canonicalUrl: null,
    firstObservedSourceRecordId: input.sourceRecordId,
    lastObservedSourceRecordId: input.sourceRecordId,
    retiredAt: null,
  }
}

function cleanIsbn(value: string | null): string | null {
  if (value === null) return null
  const cleaned = value.replace(/[\s-]/g, '').toUpperCase()
  return cleaned.length === 0 ? null : cleaned
}

function cleanAsin(value: string | null): string | null {
  const cleaned = value?.trim().toUpperCase() ?? ''
  return cleaned.length === 0 ? null : cleaned
}

async function normalizeBook(
  repository: CanonicalLedgerRepository,
  connection: SourceConnection,
  rawObject: RawObject,
  book: HardcoverReadBook,
  index: number,
  observedAt: ReturnType<typeof utcInstant>,
  pendingIdentities: Map<string, PendingIdentity>,
): Promise<{
  sourceRecord: SourceRecord
  mediaItem: MediaItem
  identities: ExternalIdentity[]
  archiveEntries: ArchiveEntryWrite[]
}> {
  const recordId = sourceRecordId(ulid())
  const sourceRecord: SourceRecord = {
    id: recordId,
    rawObjectId: rawObject.id,
    connectionId: connection.id,
    recordType: 'user_book',
    recordPath: `$.data.user_books[${index}]`,
    sourceRecordKey: `user_book:${book.userBookId}`,
    sourceRecordedAt: sourceRecordedAt(book),
    observedAt,
    parserVersion,
    contentSha256: null,
    disposition: 'normalized',
    upstreamState: 'active',
    errorCode: null,
  }

  const workIds = [book.bookId, book.workCanonicalId].filter(
    (value, position, values): value is number =>
      value !== null && values.indexOf(value) === position,
  )
  let knownWork: PendingIdentity | null = null
  for (const workId of workIds) {
    const key = identityKey('hardcover', 'book_id', String(workId))
    knownWork =
      pendingIdentities.get(key) ??
      (await repository.findExternalIdentity({
        namespace: 'hardcover',
        externalType: 'book_id',
        externalId: String(workId),
        connectionId: null,
      }))
    if (knownWork !== null) break
  }
  const itemId = knownWork?.mediaItemId ?? mediaItemId(ulid())
  const identities: ExternalIdentity[] = []
  for (const workId of workIds) {
    identities.push(
      await findOrCreateIdentity(repository, pendingIdentities, {
        namespace: 'hardcover',
        externalType: 'book_id',
        externalId: String(workId),
        mediaItemId: itemId,
        sourceRecordId: recordId,
      }),
    )
  }

  const editionIds = [book.editionId, book.editionCanonicalId].filter(
    (value, position, values): value is number =>
      value !== null && values.indexOf(value) === position,
  )
  for (const editionId of editionIds) {
    identities.push(
      await findOrCreateIdentity(repository, pendingIdentities, {
        namespace: 'hardcover',
        externalType: 'edition_id',
        externalId: String(editionId),
        mediaItemId: itemId,
        sourceRecordId: recordId,
      }),
    )
  }
  const isbn10 = cleanIsbn(book.isbn10)
  const isbn13 = cleanIsbn(book.isbn13)
  const asin = cleanAsin(book.asin)
  for (const [namespace, externalType, externalId] of [
    ['isbn', 'isbn_10', isbn10],
    ['isbn', 'isbn_13', isbn13],
    ['asin', 'asin', asin],
  ] as const) {
    if (externalId === null) continue
    identities.push(
      await findOrCreateIdentity(repository, pendingIdentities, {
        namespace,
        externalType,
        externalId,
        mediaItemId: itemId,
        sourceRecordId: recordId,
      }),
    )
  }

  const identityByEditionId = new Map(
    identities
      .filter(
        (identity) => identity.namespace === 'hardcover' && identity.externalType === 'edition_id',
      )
      .map((identity) => [identity.externalId, identity.id]),
  )
  const defaultConsumedIdentity =
    (book.editionId === null ? null : identityByEditionId.get(String(book.editionId))) ??
    identities.find(
      (identity) => identity.namespace === 'hardcover' && identity.externalType === 'book_id',
    )?.id ??
    null
  const finishedReads = book.reads.filter((read) => validFinishedDate(read.finishedAt))
  const occurrences =
    finishedReads.length > 0
      ? finishedReads.map((read) => ({
          key: `read:${read.id}`,
          consumedAt: temporalDay(read.finishedAt!),
          identityId:
            (read.editionId === null ? null : identityByEditionId.get(String(read.editionId))) ??
            defaultConsumedIdentity,
          admissionReason: 'hardcover_finished_read' as const,
        }))
      : [
          {
            key: `user_book:${book.userBookId}:read_status`,
            consumedAt: null,
            identityId: defaultConsumedIdentity,
            admissionReason: 'hardcover_read_status' as const,
          },
        ]
  const archiveEntries: ArchiveEntryWrite[] = []
  for (const occurrence of occurrences) {
    const existingId = await repository.findArchiveEntryId(connection.id, occurrence.key)
    const entryId = existingId ?? archiveEntryId(ulid())
    const evidence: ArchiveEntryEvidence[] = [
      {
        id: archiveEntryEvidenceId(ulid()),
        archiveEntryId: entryId,
        sourceRecordId: recordId,
        role: 'admission',
        linkedAt: observedAt,
      },
      {
        id: archiveEntryEvidenceId(ulid()),
        archiveEntryId: entryId,
        sourceRecordId: recordId,
        role: 'metadata',
        linkedAt: observedAt,
      },
    ]
    if (occurrence.consumedAt !== null) {
      evidence.push({
        id: archiveEntryEvidenceId(ulid()),
        archiveEntryId: entryId,
        sourceRecordId: recordId,
        role: 'occurrence_time',
        linkedAt: observedAt,
      })
    }
    if (book.rating !== null) {
      evidence.push({
        id: archiveEntryEvidenceId(ulid()),
        archiveEntryId: entryId,
        sourceRecordId: recordId,
        role: 'rating',
        linkedAt: observedAt,
      })
    }
    if (book.review !== null && book.review.length > 0) {
      evidence.push({
        id: archiveEntryEvidenceId(ulid()),
        archiveEntryId: entryId,
        sourceRecordId: recordId,
        role: 'review',
        linkedAt: observedAt,
      })
    }
    archiveEntries.push({
      entry: {
        id: entryId,
        mediaItemId: itemId,
        connectionId: connection.id,
        consumedIdentityId: occurrence.identityId,
        sourceOccurrenceKey: occurrence.key,
        admissionReason: occurrence.admissionReason,
        consumedAt: occurrence.consumedAt,
        sourceRecordedAt: sourceRecordedAt(book),
        sourceRating: normalizedBookRating(book.rating),
        reviewText: book.review,
        upstreamState: 'active',
        createdAt: observedAt,
        updatedAt: observedAt,
      },
      evidence,
    })
  }

  return {
    sourceRecord,
    mediaItem: {
      id: itemId,
      type: 'book',
      title: book.title,
      subtitle: book.subtitle,
      primaryCreatorName: null,
      description: null,
      canonicalUrl: null,
      imageUrl: null,
      publishedAt: publishedAt(book),
      durationMs: book.audioSeconds === null ? null : book.audioSeconds * 1000,
      createdAt: observedAt,
      updatedAt: observedAt,
    },
    identities,
    archiveEntries,
  }
}

export async function syncHardcover(bindings: Bindings): Promise<HardcoverSyncResponse> {
  const token = bindings.HARDCOVER_TOKEN?.trim()
  if (token === undefined || token.length === 0) throw new HardcoverTokenMissingError()

  const repository = createLedgerRepository(bindings.DB)
  const startedAt = instantNow()
  const connection = await connectionForSync(repository, startedAt)
  const previousCursor = await repository.findSyncCursor(connection.id, 'read-books')
  const runId = syncRunId(ulid())
  const mode = previousCursor === null ? ('backfill' as const) : ('reconcile' as const)
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
  const pendingIdentities = new Map<string, PendingIdentity>()
  const rawObjects: RawObject[] = []
  let pages = 0
  let sourceRecords = 0
  let books = 0
  let archiveEntries = 0

  await repository.saveConnection(connection)
  await repository.saveSyncRun(runningRun)

  try {
    const userId = await fetchHardcoverUserId(token)
    let afterId = 0
    while (true) {
      const page = await fetchHardcoverReadBooksPage({ token, userId, afterId, limit: pageSize })
      const acquiredAt = instantNow()
      const checksum = await sha256(page.bytes)
      const storageKey = `raw/hardcover/sha256/${checksum.slice(0, 2)}/${checksum}.json`
      await bindings.RAW_BUCKET.put(storageKey, page.bytes, {
        httpMetadata: { contentType: page.contentType },
        customMetadata: { sha256: checksum },
      })
      const rawObject: RawObject = {
        id: rawObjectId(ulid()),
        connectionId: connection.id,
        syncRunId: runId,
        kind: 'api_page',
        acquisitionKey: `hardcover:${runId}:page:${pages + 1}`,
        storageKey,
        sha256: checksum,
        contentType: page.contentType,
        byteLength: page.bytes.byteLength,
        acquiredAt,
        processingStatus: 'pending',
        lastParserVersion: null,
        processingError: null,
      }
      rawObjects.push(rawObject)
      await repository.commit({ rawObjects: [rawObject] })

      try {
        for (const [index, book] of page.books.entries()) {
          const normalized = await normalizeBook(
            repository,
            connection,
            rawObject,
            book,
            index,
            acquiredAt,
            pendingIdentities,
          )
          await repository.commit({
            sourceRecords: [normalized.sourceRecord],
            mediaItems: [normalized.mediaItem],
            externalIdentities: normalized.identities,
            archiveEntries: normalized.archiveEntries,
          })
          sourceRecords += 1
          books += 1
          archiveEntries += normalized.archiveEntries.length
        }
        await repository.commit({
          rawObjects: [
            {
              ...rawObject,
              processingStatus: 'processed',
              lastParserVersion: parserVersion,
            },
          ],
        })
      } catch (error) {
        await repository.commit({
          rawObjects: [
            {
              ...rawObject,
              processingStatus: 'failed',
              lastParserVersion: parserVersion,
              processingError: safeErrorName(error),
            },
          ],
        })
        throw error
      }

      pages += 1
      if (page.books.length < pageSize) break
      afterId = page.books.at(-1)!.userBookId
    }

    const finishedAt = instantNow()
    const succeededRun: SyncRun = {
      ...runningRun,
      status: 'succeeded',
      finishedAt,
      counts: {
        rawObjects: rawObjects.length,
        sourceRecords,
        normalizedRecords: archiveEntries,
        failedRecords: 0,
      },
    }
    await repository.commit({
      syncRun: succeededRun,
      cursor: {
        id: previousCursor?.id ?? syncCursorId(ulid()),
        connectionId: connection.id,
        name: 'read-books',
        checkpoint: { lastFullSyncAt: finishedAt, books, archiveEntries },
        committedAt: finishedAt,
        syncRunId: runId,
      },
    })
    await repository.saveConnection({ ...connection, updatedAt: finishedAt })
    return { syncRunId: runId, mode, pages, sourceRecords, books, archiveEntries }
  } catch (error) {
    const finishedAt = instantNow()
    await repository.saveSyncRun({
      ...runningRun,
      status: 'failed',
      finishedAt,
      counts: {
        rawObjects: rawObjects.length,
        sourceRecords,
        normalizedRecords: archiveEntries,
        failedRecords: 1,
      },
      errorCode: safeErrorName(error),
      errorMessage: 'Hardcover sync failed',
    })
    await repository.saveConnection({ ...connection, status: 'degraded', updatedAt: finishedAt })
    throw error
  }
}
