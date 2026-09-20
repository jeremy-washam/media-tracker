import {
  fetchHardcoverEditionsResponse,
  fetchHardcoverReadBooksResponse,
  parseHardcoverEditionsPage,
  parseHardcoverReadBooksPage,
  fetchHardcoverUserId,
  type HardcoverEdition,
  type HardcoverReadBook,
} from '@media-tracker/connector-hardcover'
import type { HardcoverSyncResponse } from '@media-tracker/contracts'
import type {
  ArchiveEntryWrite,
  CanonicalLedgerRepository,
  HardcoverBookProjection,
} from '@media-tracker/db'
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
import { createBooksRepository, createLedgerRepository } from './env'

const parserVersion = 'hardcover-user-books@3'
const editionParserVersion = 'hardcover-editions@1'
const pageSize = 50
const editionBatchSize = 50

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

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : 'Unknown Hardcover sync failure'
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
  retireOccurrences: NonNullable<
    import('@media-tracker/db').CanonicalWriteBatch['retireOccurrences']
  >
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

  const editionIds = [
    book.editionId,
    book.editionCanonicalId,
    ...book.reads.map((read) => read.editionId),
  ].filter(
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
      : book.statusId === 3
        ? [
            {
              key: `user_book:${book.userBookId}:read_status`,
              consumedAt: null,
              identityId: defaultConsumedIdentity,
              admissionReason: 'hardcover_read_status' as const,
            },
          ]
        : []
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
      replaceRating: true,
      replaceReview: true,
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

  const fallback =
    finishedReads.length === 0
      ? null
      : await repository.findArchiveEntryId(
          connection.id,
          `user_book:${book.userBookId}:read_status`,
        )
  return {
    retireOccurrences:
      fallback === null
        ? []
        : [
            {
              id: fallback,
              evidence: {
                id: archiveEntryEvidenceId(ulid()),
                archiveEntryId: fallback,
                sourceRecordId: recordId,
                role: 'removal',
                linkedAt: observedAt,
              },
            },
          ],
    sourceRecord,
    mediaItem: {
      id: itemId,
      type: 'book',
      title: book.title,
      subtitle: book.subtitle,
      primaryCreatorName:
        book.contributors.find(
          (contributor) =>
            contributor.primary || contributor.roleName.toLocaleLowerCase() === 'author',
        )?.name ?? null,
      description: book.description,
      canonicalUrl: book.slug === null ? null : `https://hardcover.app/books/${book.slug}`,
      imageUrl: book.cover.url,
      publishedAt: publishedAt(book),
      durationMs: book.audioSeconds === null ? null : book.audioSeconds * 1000,
      createdAt: observedAt,
      updatedAt: observedAt,
    },
    identities,
    archiveEntries,
  }
}

function editionProjection(
  edition: HardcoverEdition,
  sourceRecordIdOverride?: SourceRecordId,
): HardcoverBookProjection['editions'][number] {
  return {
    id: edition.id,
    canonicalId: edition.canonicalId,
    title: edition.title,
    subtitle: edition.subtitle,
    information: edition.information,
    readingFormatId: edition.readingFormatId,
    readingFormat: edition.readingFormat,
    rawFormat: edition.rawFormat,
    pages: edition.pages,
    audioSeconds: edition.audioSeconds,
    releaseDate: edition.releaseDate,
    publisher: edition.publisher,
    language: edition.language,
    isbn10: edition.isbn10,
    isbn13: edition.isbn13,
    asin: edition.asin,
    coverUrl: edition.image.url,
    coverColor: edition.image.color,
    ...(sourceRecordIdOverride === undefined ? {} : { sourceRecordId: sourceRecordIdOverride }),
    contributors: edition.contributors.map((contributor, position) => ({
      ...contributor,
      position,
    })),
  }
}

function bookProjection(input: {
  book: HardcoverReadBook
  connection: SourceConnection
  runId: SyncRun['id']
  sourceRecord: SourceRecord
  mediaItem: MediaItem
  archiveEntries: readonly ArchiveEntryWrite[]
  observedAt: ReturnType<typeof utcInstant>
  enrichedEditions: ReadonlyMap<
    number,
    { edition: HardcoverEdition; sourceRecordId: SourceRecordId }
  >
}): HardcoverBookProjection {
  const editions = new Map<number, HardcoverBookProjection['editions'][number]>()
  for (const edition of [input.book.currentEdition, input.book.defaultCoverEdition]) {
    if (edition !== null) editions.set(edition.id, editionProjection(edition))
  }
  for (const read of input.book.reads) {
    if (read.editionId === null) continue
    const enriched = input.enrichedEditions.get(read.editionId)
    if (enriched !== undefined) {
      editions.set(
        enriched.edition.id,
        editionProjection(enriched.edition, enriched.sourceRecordId),
      )
    }
  }
  const archiveIds = new Map(
    input.archiveEntries.map((write) => [write.entry.sourceOccurrenceKey, write.entry.id]),
  )
  let releaseDate: string | null = null
  let releasePrecision: HardcoverBookProjection['releasePrecision'] = null
  if (input.book.releaseDate !== null) {
    try {
      calendarDate(input.book.releaseDate)
      releaseDate = input.book.releaseDate
      releasePrecision = 'day'
    } catch {
      // Use the less precise release year below.
    }
  }
  if (releaseDate === null && input.book.releaseYear !== null) {
    try {
      calendarYear(String(input.book.releaseYear))
      releaseDate = String(input.book.releaseYear)
      releasePrecision = 'year'
    } catch {
      // Preserve an unknown publication date.
    }
  }
  return {
    connectionId: input.connection.id,
    syncRunId: input.runId,
    sourceRecordId: input.sourceRecord.id,
    observedAt: input.observedAt,
    sourceUpdatedAt: input.book.updatedAt,
    mediaItemId: input.mediaItem.id,
    userBookId: input.book.userBookId,
    workId: input.book.bookId,
    canonicalWorkId: input.book.workCanonicalId,
    currentEditionId: input.book.editionId,
    statusId: input.book.statusId,
    statusLabel: input.book.statusLabel,
    dateAdded: input.book.dateAdded,
    readCount: input.book.readCount,
    personalRating: input.book.rating,
    reviewText: input.book.review,
    reviewHasSpoilers: input.book.reviewHasSpoilers,
    reviewedAt: input.book.reviewedAt,
    title: input.book.title ?? 'Untitled book',
    subtitle: input.book.subtitle,
    description: input.book.description,
    slug: input.book.slug,
    pages: input.book.pages,
    audioSeconds: input.book.audioSeconds,
    releaseDate,
    releasePrecision,
    coverUrl: input.book.cover.url,
    coverColor: input.book.cover.color,
    communityRating: input.book.communityRating,
    communityRatingsCount: input.book.communityRatingsCount,
    usersReadCount: input.book.usersReadCount,
    defaultCoverEditionId: input.book.defaultCoverEditionId,
    editions: [...editions.values()],
    contributors: input.book.contributors.map((contributor, position) => ({
      ...contributor,
      position,
    })),
    series: input.book.series,
    taxonomy: input.book.taxonomy,
    reads: input.book.reads.map((read) => ({
      id: read.id,
      archiveEntryId: archiveIds.get(`read:${read.id}`) ?? null,
      editionId: read.editionId,
      startedAt: read.startedAt,
      pausedAt: read.pausedAt,
      finishedAt: validFinishedDate(read.finishedAt) ? read.finishedAt : null,
      finishedAtPrecisionRaw:
        read.finishedAtPrecision === null ? null : String(read.finishedAtPrecision),
      progress: read.progress,
      progressPages: read.progressPages,
      progressSeconds: read.progressSeconds,
    })),
  }
}

export async function syncHardcover(bindings: Bindings): Promise<HardcoverSyncResponse> {
  const token = bindings.HARDCOVER_TOKEN?.trim()
  if (token === undefined || token.length === 0) throw new HardcoverTokenMissingError()

  const repository = createLedgerRepository(bindings.DB)
  const booksRepository = createBooksRepository(bindings.DB)
  const startedAt = instantNow()
  const connection = await connectionForSync(repository, startedAt)
  const previousCursor = await repository.findSyncCursor(connection.id, 'library-books')
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
  let queueBooks = 0
  let works = 0
  const projectedEditionIds = new Set<number>()

  await repository.saveConnection(connection)
  await repository.saveSyncRun(runningRun)

  try {
    const userId = await fetchHardcoverUserId(token)
    let afterId = 0
    while (true) {
      const response = await fetchHardcoverReadBooksResponse({
        token,
        userId,
        afterId,
        limit: pageSize,
      })
      const acquiredAt = instantNow()
      const checksum = await sha256(response.bytes)
      const storageKey = `raw/hardcover/sha256/${checksum.slice(0, 2)}/${checksum}.json`
      await bindings.RAW_BUCKET.put(storageKey, response.bytes, {
        httpMetadata: { contentType: response.contentType },
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
        contentType: response.contentType,
        byteLength: response.bytes.byteLength,
        acquiredAt,
        processingStatus: 'pending',
        lastParserVersion: null,
        processingError: null,
      }
      rawObjects.push(rawObject)
      await repository.commit({ rawObjects: [rawObject] })

      let page: ReturnType<typeof parseHardcoverReadBooksPage>
      try {
        page = parseHardcoverReadBooksPage(response)
        const embeddedEditionIds = new Set(
          page.books.flatMap((book) =>
            [book.currentEdition?.id, book.defaultCoverEdition?.id].filter(
              (value): value is number => value !== undefined && value !== null,
            ),
          ),
        )
        const consumedEditionIds = [
          ...new Set(
            page.books.flatMap((book) =>
              book.reads.flatMap((read) =>
                read.editionId === null || embeddedEditionIds.has(read.editionId)
                  ? []
                  : [read.editionId],
              ),
            ),
          ),
        ]
        const enrichedEditions = new Map<
          number,
          { edition: HardcoverEdition; sourceRecordId: SourceRecordId }
        >()
        for (let start = 0; start < consumedEditionIds.length; start += editionBatchSize) {
          const ids = consumedEditionIds.slice(start, start + editionBatchSize)
          const editionResponse = await fetchHardcoverEditionsResponse({ token, ids })
          const editionAcquiredAt = instantNow()
          const editionChecksum = await sha256(editionResponse.bytes)
          const editionStorageKey = `raw/hardcover/sha256/${editionChecksum.slice(0, 2)}/${editionChecksum}.json`
          await bindings.RAW_BUCKET.put(editionStorageKey, editionResponse.bytes, {
            httpMetadata: { contentType: editionResponse.contentType },
            customMetadata: { sha256: editionChecksum },
          })
          const editionRawObject: RawObject = {
            id: rawObjectId(ulid()),
            connectionId: connection.id,
            syncRunId: runId,
            kind: 'api_page',
            acquisitionKey: `hardcover:${runId}:page:${pages + 1}:editions:${start / editionBatchSize + 1}`,
            storageKey: editionStorageKey,
            sha256: editionChecksum,
            contentType: editionResponse.contentType,
            byteLength: editionResponse.bytes.byteLength,
            acquiredAt: editionAcquiredAt,
            processingStatus: 'pending',
            lastParserVersion: null,
            processingError: null,
          }
          rawObjects.push(editionRawObject)
          await repository.commit({ rawObjects: [editionRawObject] })
          try {
            const editionPage = parseHardcoverEditionsPage(editionResponse)
            const editionRecords = editionPage.editions.map((edition, index) => {
              const record: SourceRecord = {
                id: sourceRecordId(ulid()),
                rawObjectId: editionRawObject.id,
                connectionId: connection.id,
                recordType: 'edition',
                recordPath: `$.data.editions[${index}]`,
                sourceRecordKey: `edition:${edition.id}`,
                sourceRecordedAt: null,
                observedAt: editionAcquiredAt,
                parserVersion: editionParserVersion,
                contentSha256: null,
                disposition: 'normalized',
                upstreamState: 'active',
                errorCode: null,
              }
              enrichedEditions.set(edition.id, { edition, sourceRecordId: record.id })
              return record
            })
            await repository.commit({
              sourceRecords: editionRecords,
              rawObjects: [
                {
                  ...editionRawObject,
                  processingStatus: 'processed',
                  lastParserVersion: editionParserVersion,
                },
              ],
            })
            sourceRecords += editionRecords.length
          } catch (error) {
            await repository.commit({
              rawObjects: [
                {
                  ...editionRawObject,
                  processingStatus: 'failed',
                  lastParserVersion: editionParserVersion,
                  processingError: safeErrorName(error),
                },
              ],
            })
            throw error
          }
        }
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
            retireOccurrences: normalized.retireOccurrences,
          })
          const projection = bookProjection({
            book,
            connection,
            runId,
            sourceRecord: normalized.sourceRecord,
            mediaItem: normalized.mediaItem,
            archiveEntries: normalized.archiveEntries,
            observedAt: acquiredAt,
            enrichedEditions,
          })
          await booksRepository.upsertHardcoverBooks([projection])
          projection.editions.forEach((edition) => projectedEditionIds.add(edition.id))
          sourceRecords += 1
          books += 1
          works += 1
          if (book.statusId === 1 || book.statusId === 2) queueBooks += 1
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
    await booksRepository.finalizeHardcoverSnapshot({
      connectionId: connection.id,
      syncRunId: runId,
      refreshedAt: finishedAt,
    })
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
        name: 'library-books',
        checkpoint: {
          lastFullSyncAt: finishedAt,
          books,
          queueBooks,
          archiveEntries,
          editions: projectedEditionIds.size,
          parserVersion,
        },
        committedAt: finishedAt,
        syncRunId: runId,
      },
    })
    await repository.saveConnection({ ...connection, updatedAt: finishedAt })
    return {
      syncRunId: runId,
      mode,
      pages,
      sourceRecords,
      books,
      archiveEntries,
      queueBooks,
      works,
      editions: projectedEditionIds.size,
    }
  } catch (error) {
    const finishedAt = instantNow()
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'hardcover.sync.failed',
        syncRunId: runId,
        errorName: safeErrorName(error),
        errorMessage: safeErrorMessage(error),
      }),
    )
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
      errorMessage: safeErrorMessage(error),
    })
    await repository.saveConnection({ ...connection, status: 'degraded', updatedAt: finishedAt })
    throw error
  }
}
