import {
  classifySavedEpisode,
  fetchSpotifySavedEpisodesResponse,
  parseSpotifySavedEpisodesPage,
  type SpotifySavedEpisodeObservation,
  type SpotifySavedEpisodesPage,
} from '@media-tracker/connector-spotify'
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
  temporalDay,
  temporalInstant,
  temporalMonth,
  temporalYear,
  utcInstant,
  type ExternalIdentity,
  type MediaItem,
  type RawObject,
  type SourceConnection,
  type SourceRecord,
  type SyncRun,
  type TemporalValue,
} from '@media-tracker/domain'
import { ulid } from 'ulid'

import type { Bindings } from './env'
import { createLedgerRepository } from './env'
import { refreshStoredSpotifyToken } from './spotify-credentials'

const parserVersion = 'spotify-saved-episodes@1'

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

export async function syncSpotifySavedEpisodes(
  bindings: SpotifyBindings,
): Promise<SpotifySyncResponse> {
  const clientId = bindings.SPOTIFY_CLIENT_ID?.trim()
  const refreshToken = bindings.SPOTIFY_REFRESH_TOKEN?.trim()
  if (!clientId || !refreshToken) throw new SpotifyCredentialsMissingError()

  const repository = createLedgerRepository(bindings.DB)
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
          if (!isArchive || !hasIdentity) {
            await repository.commit({ sourceRecords: [record] })
            continue
          }

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
          const archiveEntry: ArchiveEntryWrite = {
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
            archiveEntries: [archiveEntry],
          })
          archiveEpisodes += 1
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
