import {
  fetchReaderDocumentPage,
  fetchReadwiseHighlightPage,
  normalizeReaderDocument,
  parseReaderPage,
  parseReadwiseHighlightPage,
} from '@media-tracker/connector-readwise'
import type { ReadwiseSyncResponse } from '@media-tracker/contracts'
import type {
  ArchiveEntryWrite,
  CanonicalLedgerRepository,
  ReaderArticleDocumentProjection,
  ReaderArticleRetirementProjection,
  ReaderHighlightContainerProjection,
  SqlArticlesRepository,
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
import { createArticlesRepository, createLedgerRepository } from './env'
import { withReadwiseRetry } from './readwise-retry'

const parserVersion = 'readwise-documents@5'
const highlightParserVersion = 'readwise-highlights@1'
const cursorName = 'reader-documents'
const overlapMilliseconds = 5 * 60 * 1000
const completeSnapshotIntervalMilliseconds = 24 * 60 * 60 * 1000

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
  const value = Reflect.get(checkpoint, 'updatedAfter')
  if (typeof value !== 'string') return undefined
  const milliseconds = Date.parse(value)
  return Number.isFinite(milliseconds)
    ? new Date(milliseconds - overlapMilliseconds).toISOString()
    : undefined
}

async function shouldRunCompleteSnapshot(
  database: D1Database,
  connection: string,
): Promise<boolean> {
  const row = await database
    .prepare(
      `SELECT documents_snapshot_completed_at completed_at,documents_parser_version parser_version
       FROM readwise_projection_state WHERE connection_id=?`,
    )
    .bind(connection)
    .first<{ completed_at: string | null; parser_version: string | null }>()
  if (row?.completed_at == null || row.parser_version !== parserVersion) return true
  const completedAt = Date.parse(row.completed_at)
  return (
    !Number.isFinite(completedAt) ||
    Date.now() - completedAt >= completeSnapshotIntervalMilliseconds
  )
}

async function sha256(bytes: Uint8Array): Promise<{ digest: ArrayBuffer; hex: string }> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return {
    digest,
    hex: [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join(''),
  }
}

async function storeRawPage(bucket: R2Bucket, bytes: Uint8Array, contentType: string) {
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

async function syncHighlights(input: {
  token: string
  bindings: Bindings
  repository: CanonicalLedgerRepository
  articles: SqlArticlesRepository
  connection: SourceConnection
  runId: ReturnType<typeof syncRunId>
}): Promise<{ rawObjects: number; sourceRecords: number }> {
  let pageCursor: string | undefined,
    pageNumber = 0,
    sourceRecordCount = 0
  const seen = new Set<string>()
  do {
    const observedAt = instantNow()
    const response = await withReadwiseRetry(() =>
      fetchReadwiseHighlightPage({
        token: input.token,
        ...(pageCursor ? { pageCursor } : {}),
      }),
    )
    const stored = await storeRawPage(
      input.bindings.RAW_BUCKET,
      response.bytes,
      response.contentType,
    )
    const rawId = rawObjectId(ulid())
    const pending: RawObject = {
      id: rawId,
      connectionId: input.connection.id,
      syncRunId: input.runId,
      kind: 'api_page',
      acquisitionKey: `readwise:${input.runId}:highlights:${pageNumber + 1}`,
      storageKey: stored.storageKey,
      sha256: stored.sha256,
      contentType: response.contentType,
      byteLength: stored.byteLength,
      acquiredAt: observedAt,
      processingStatus: 'pending',
      lastParserVersion: null,
      processingError: null,
    }
    await input.repository.commit({ rawObjects: [pending] })
    try {
      const page = parseReadwiseHighlightPage(response.body)
      const sourceRecords: SourceRecord[] = []
      const containers: ReaderHighlightContainerProjection[] = []
      for (const [index, container] of page.results.entries()) {
        const recordId = sourceRecordId(ulid())
        sourceRecords.push({
          id: recordId,
          rawObjectId: rawId,
          connectionId: input.connection.id,
          recordType: 'readwise_highlight_container',
          recordPath: `$.results[${index}]`,
          sourceRecordKey: `readwise-highlight-container:${container.user_book_id}`,
          sourceRecordedAt: null,
          observedAt,
          parserVersion: highlightParserVersion,
          contentSha256: null,
          disposition: 'normalized',
          upstreamState: container.is_deleted ? 'removed' : 'active',
          errorCode: null,
        })
        containers.push({
          id: `readwise:${input.connection.id}:highlight-container:${container.user_book_id}`,
          connectionId: input.connection.id,
          userBookId: container.user_book_id,
          externalId: container.external_id ?? null,
          source: container.source ?? null,
          title: container.title ?? null,
          author: container.author ?? null,
          category: container.category ?? null,
          sourceUrl: container.source_url ?? null,
          documentNote: container.note ?? null,
          deleted: container.is_deleted,
          sourceUpdatedAt: container.updated ?? null,
          sourceRecordId: recordId,
          observedAt,
          highlights: container.highlights.map((highlight) => ({
            id: `readwise:${input.connection.id}:highlight:${highlight.id}`,
            highlightId: highlight.id,
            deleted: highlight.is_deleted,
            text: highlight.text ?? null,
            note: highlight.note ?? null,
            location: highlight.location ?? null,
            endLocation: highlight.end_location ?? null,
            locationType: highlight.location_type ?? null,
            color: highlight.color ?? null,
            favorite: highlight.is_favorite,
            discard: highlight.is_discard,
            highlightedAt: highlight.highlighted_at ?? null,
            createdAt: highlight.created_at ?? null,
            updatedAt: highlight.updated_at ?? null,
            readerUrl: highlight.readwise_url ?? null,
          })),
        })
      }
      await input.repository.commit({
        rawObjects: [
          { ...pending, processingStatus: 'processed', lastParserVersion: highlightParserVersion },
        ],
        sourceRecords,
      })
      await input.articles.applyHighlightContainers(containers)
      sourceRecordCount += sourceRecords.length
      pageNumber += 1
      const next = page.nextPageCursor ?? undefined
      if (next) {
        if (seen.has(next)) throw new Error('Readwise highlights returned a repeated page cursor')
        seen.add(next)
      }
      pageCursor = next
    } catch (error) {
      await input.repository.commit({
        rawObjects: [
          {
            ...pending,
            processingStatus: 'failed',
            lastParserVersion: highlightParserVersion,
            processingError: errorName(error),
          },
        ],
      })
      throw error
    }
  } while (pageCursor)
  await input.articles.finalizeHighlightsSnapshot({
    connectionId: input.connection.id,
    syncRunId: input.runId,
    completedAt: instantNow(),
    parserVersion: highlightParserVersion,
  })
  return { rawObjects: pageNumber, sourceRecords: sourceRecordCount }
}

export async function syncReadwiseArchive(bindings: Bindings): Promise<ReadwiseSyncResponse> {
  const token = bindings.READWISE_TOKEN
  if (!token) throw new ReadwiseTokenMissingError()
  const repository = createLedgerRepository(bindings.DB)
  const articles = createArticlesRepository(bindings.DB)
  const startedAt = instantNow()
  const connection = await connectionForSync(repository, startedAt)
  const previousCursor = await repository.findSyncCursor(connection.id, cursorName)
  const completeSnapshot = await shouldRunCompleteSnapshot(bindings.DB, connection.id)
  const updatedAfter = completeSnapshot
    ? undefined
    : overlappedUpdatedAfter(previousCursor?.checkpoint)
  const runId = syncRunId(ulid())
  let pages = 0,
    rawObjectCount = 0,
    sourceRecordCount = 0,
    archiveItemCount = 0
  let lastRawId: ReturnType<typeof rawObjectId>
  const runningRun: SyncRun = {
    id: runId,
    connectionId: connection.id,
    kind: completeSnapshot ? 'backfill' : 'reconcile',
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
      const response = await withReadwiseRetry(() =>
        fetchReaderDocumentPage({
          token,
          limit: 100,
          ...(updatedAfter ? { updatedAfter } : {}),
          ...(pageCursor ? { pageCursor } : {}),
        }),
      )
      const stored = await storeRawPage(bindings.RAW_BUCKET, response.bytes, response.contentType)
      const rawId = rawObjectId(ulid())
      lastRawId = rawId
      const pendingRawObject: RawObject = {
        id: rawId,
        connectionId: connection.id,
        syncRunId: runId,
        kind: 'api_page',
        acquisitionKey: `readwise:${runId}:documents:${pages + 1}`,
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
        const sourceRecords: SourceRecord[] = [],
          mediaItems: MediaItem[] = [],
          externalIdentities: ExternalIdentity[] = []
        const archiveEntries: ArchiveEntryWrite[] = []
        const articleDocuments: ReaderArticleDocumentProjection[] = []
        const retiredArticleDocuments: ReaderArticleRetirementProjection[] = []
        for (const [index, readerDocument] of page.results.entries()) {
          const item = normalizeReaderDocument(readerDocument)
          const recordId = sourceRecordId(ulid())
          const knownIdentity = await repository.findExternalIdentity({
            namespace: 'readwise',
            externalType: 'document_id',
            externalId: item.documentId,
            connectionId: connection.id,
          })
          const knownArchiveId = await repository.findArchiveEntryId(
            connection.id,
            `reader-document:${item.documentId}`,
          )
          const shouldCanonicalize = item.article !== null || item.archive !== null
          sourceRecords.push({
            id: recordId,
            rawObjectId: rawId,
            connectionId: connection.id,
            recordType: 'reader_document',
            recordPath: `$.results[${index}]`,
            sourceRecordKey: item.sourceRecordKey,
            sourceRecordedAt: item.sourceRecordedAt,
            observedAt: acquiredAt,
            parserVersion,
            contentSha256: null,
            disposition: shouldCanonicalize ? 'normalized' : 'ignored',
            upstreamState: 'active',
            errorCode: null,
          })
          if (item.article === null) {
            retiredArticleDocuments.push({
              connectionId: connection.id,
              documentId: item.documentId,
              sourceRecordId: recordId,
              snapshotRunId: completeSnapshot ? runId : null,
              observedAt: acquiredAt,
              rawCategory: readerDocument.category,
              currentLocation: readerDocument.location?.trim().toLowerCase() || 'unknown',
            })
          }
          if (!shouldCanonicalize) continue
          const itemId = knownIdentity?.mediaItemId ?? mediaItemId(ulid())
          const identityId = knownIdentity?.id ?? externalIdentityId(ulid())
          const title = item.article?.title ?? item.archive?.title ?? null
          const creator = item.article?.author ?? item.archive?.primaryCreatorName ?? null
          const description = item.article?.summary ?? item.archive?.description ?? null
          const canonicalUrl = item.article
            ? (item.article.sourceUrl ?? item.article.readerUrl)
            : (item.archive?.canonicalUrl ?? null)
          const imageUrl = item.article?.imageUrl ?? item.archive?.imageUrl ?? null
          const publishedAt = item.article?.publishedAt ?? item.archive?.publishedAt ?? null
          const mediaType = item.article ? 'article' : item.archive?.mediaType
          if (!mediaType) continue
          mediaItems.push({
            id: itemId,
            type: mediaType,
            title,
            subtitle: null,
            primaryCreatorName: creator,
            description,
            canonicalUrl,
            imageUrl,
            publishedAt,
            durationMs: null,
            createdAt: acquiredAt,
            updatedAt: acquiredAt,
          })
          externalIdentities.push({
            id: identityId,
            mediaItemId: itemId,
            namespace: 'readwise',
            externalType: 'document_id',
            externalId: item.documentId,
            scope: { kind: 'connection', connectionId: connection.id },
            canonicalUrl,
            firstObservedSourceRecordId: recordId,
            lastObservedSourceRecordId: recordId,
            retiredAt: null,
          })
          if (item.archive) {
            const entryId = knownArchiveId ?? archiveEntryId(ulid())
            archiveEntries.push({
              entry: {
                id: entryId,
                mediaItemId: itemId,
                connectionId: connection.id,
                consumedIdentityId: identityId,
                sourceOccurrenceKey: item.archive.sourceOccurrenceKey,
                admissionReason: 'readwise_archive_state',
                consumedAt: item.archive.consumedAt,
                sourceRecordedAt: item.sourceRecordedAt,
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
          if (item.article) {
            const a = item.article
            articleDocuments.push({
              id: `readwise:${connection.id}:${encodeURIComponent(item.documentId)}`,
              connectionId: connection.id,
              documentId: item.documentId,
              mediaItemId: itemId,
              externalIdentityId: identityId,
              sourceRecordId: recordId,
              snapshotRunId: completeSnapshot ? runId : null,
              observedAt: acquiredAt,
              readerUrl: a.readerUrl,
              sourceUrl: a.sourceUrl,
              rawCategory: a.category,
              subtype: a.subtype,
              currentLocation: a.location,
              title: a.title,
              author: a.author,
              publication: a.publication,
              acquisitionSource: a.acquisitionSource,
              summary: a.summary,
              imageUrl: a.imageUrl,
              documentNote: a.note,
              wordCount: a.wordCount,
              readingTimeRaw: a.readingTimeRaw,
              readingTimeMinutes: a.readingTimeMinutes,
              listeningTimeRaw: a.listeningTimeRaw,
              readingProgress: a.readingProgress,
              progressValid: a.progressValid,
              publishedAt: a.publishedAt,
              createdAt: a.createdAt?.value ?? null,
              savedAt: a.savedAt?.value ?? null,
              firstOpenedAt: a.firstOpenedAt?.value ?? null,
              lastOpenedAt: a.lastOpenedAt?.value ?? null,
              lastMovedAt: a.lastMovedAt?.value ?? null,
              updatedAt: a.updatedAt?.value ?? null,
              tags: a.tags,
            })
          }
        }
        await repository.commit({
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
        await articles.applyDocumentsPage(articleDocuments)
        await articles.retireArticleDocuments(retiredArticleDocuments)
        pages += 1
        sourceRecordCount += sourceRecords.length
        archiveItemCount += archiveEntries.length
        const nextCursor = page.nextPageCursor ?? undefined
        if (nextCursor) {
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
    } while (pageCursor)

    const highlightCounts = await syncHighlights({
      token,
      bindings,
      repository,
      articles,
      connection,
      runId,
    })
    rawObjectCount += highlightCounts.rawObjects
    sourceRecordCount += highlightCounts.sourceRecords
    const finishedAt = instantNow()
    if (completeSnapshot) {
      const snapshotId = sourceRecordId(ulid())
      await repository.commit({
        sourceRecords: [
          {
            id: snapshotId,
            rawObjectId: lastRawId,
            connectionId: connection.id,
            recordType: 'reader_documents_snapshot',
            recordPath: '$snapshot',
            sourceRecordKey: `reader-documents-snapshot:${runId}`,
            sourceRecordedAt: null,
            observedAt: finishedAt,
            parserVersion,
            contentSha256: null,
            disposition: 'normalized',
            upstreamState: 'active',
            errorCode: null,
          },
        ],
      })
      sourceRecordCount += 1
      await articles.finalizeDocumentsSnapshot({
        connectionId: connection.id,
        syncRunId: runId,
        snapshotSourceRecordId: snapshotId,
        completedAt: finishedAt,
        parserVersion,
      })
    }
    await articles.rebuildProjection({
      connectionId: connection.id,
      syncRunId: runId,
      rebuiltAt: finishedAt,
    })
    const contentTargets = await articles.reserveContentTargets(connection.id, runId, finishedAt)
    for (let index = 0; index < contentTargets.length; index += 100) {
      await bindings.SYNC_QUEUE.sendBatch(
        contentTargets.slice(index, index + 100).map((target, batchIndex) => ({
          body: {
            idempotencyKey: `readwise-content:${target.connectionId}:${target.documentId}:${target.sourceUpdatedAt ?? 'unknown'}:a1:e1`,
            source: 'readwise' as const,
            operation: 'acquire_article_content' as const,
            connectionId: target.connectionId,
            documentId: target.documentId,
          },
          delaySeconds: Math.floor((index + batchIndex) / 10) * 60,
        })),
      )
    }
    await repository.commit({
      syncRun: {
        ...runningRun,
        status: 'succeeded',
        finishedAt,
        counts: {
          rawObjects: rawObjectCount,
          sourceRecords: sourceRecordCount,
          normalizedRecords: archiveItemCount,
          failedRecords: 0,
        },
      },
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
      errorMessage: 'Readwise sync failed',
    })
    await repository.saveConnection({ ...connection, status: 'degraded', updatedAt: finishedAt })
    throw error
  }
}
