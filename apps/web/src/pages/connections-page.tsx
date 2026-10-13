import { Notice, FileUploadButton } from '@/components/ui-patterns'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  fetchConnections,
  fetchSyncRuns,
  resumeImport,
  importLetterboxd,
  importSpotify,
  importYoutube,
  syncHardcover,
  syncLetterboxd,
  syncReadwise,
  syncSpotify,
} from '../api'

const sourceNames = {
  readwise: 'Readwise Reader',
  hardcover: 'Hardcover',
  letterboxd: 'Letterboxd',
  spotify: 'Spotify',
  youtube: 'YouTube',
} as const

const coverageNotes = {
  readwise:
    'Reader Archive is polled hourly when the Worker is deployed. Removed documents retain their evidence.',
  hardcover: 'The current Read shelf is reconciled hourly when deployed.',
  letterboxd:
    'RSS covers recent public activity. Import exports periodically for older and private history.',
  spotify:
    'Spotify sync discovers saved episodes and shows and imports recent tracks. Import Extended Streaming History for older listening history. Audiobooks are not included in Podcasts.',
  youtube:
    'Manual Takeout imports only. Automatic watch-history sync is unavailable. Use the same account when importing later snapshots.',
} as const
export function ConnectionsPage() {
  const queryClient = useQueryClient()
  const [youtubeKey, setYoutubeKey] = useState('')
  const runs = useInfiniteQuery({
    queryKey: ['sync-runs'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchSyncRuns(pageParam),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchInterval: 5000,
  })
  const resumed = useMutation({
    mutationFn: (input: {
      source: 'spotify' | 'youtube'
      importId: string
      connectionId: string
    }) => resumeImport(input.source, input.importId, input.connectionId),
    onSettled: () => queryClient.invalidateQueries(),
  })
  const connections = useQuery({
    queryKey: ['connections'],
    queryFn: () => fetchConnections(),
    refetchInterval: 5000,
  })
  const readwiseSync = useMutation({
    mutationFn: () => syncReadwise(),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['connections'] }),
        queryClient.invalidateQueries({ queryKey: ['sync-runs'] }),
        queryClient.invalidateQueries({ queryKey: ['media'] }),
      ])
    },
  })
  const letterboxdImport = useMutation({
    mutationFn: (archive: File) => importLetterboxd(archive),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['connections'] }),
        queryClient.invalidateQueries({ queryKey: ['sync-runs'] }),
        queryClient.invalidateQueries({ queryKey: ['media'] }),
      ])
    },
  })
  const hardcoverSync = useMutation({
    mutationFn: () => syncHardcover(),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['connections'] }),
        queryClient.invalidateQueries({ queryKey: ['sync-runs'] }),
        queryClient.invalidateQueries({ queryKey: ['media'] }),
      ])
    },
  })
  const letterboxdSync = useMutation({
    mutationFn: () => syncLetterboxd(),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['connections'] }),
        queryClient.invalidateQueries({ queryKey: ['sync-runs'] }),
        queryClient.invalidateQueries({ queryKey: ['media'] }),
      ])
    },
  })
  const spotifyImport = useMutation({
    mutationFn: (archive: File) => importSpotify(archive),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['connections'] }),
        queryClient.invalidateQueries({ queryKey: ['sync-runs'] }),
        queryClient.invalidateQueries({ queryKey: ['media'] }),
      ])
    },
  })
  const spotifySync = useMutation({
    mutationFn: () => syncSpotify(),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['connections'] }),
        queryClient.invalidateQueries({ queryKey: ['sync-runs'] }),
        queryClient.invalidateQueries({ queryKey: ['media'] }),
      ])
    },
  })
  const youtubeImport = useMutation({
    mutationFn: (input: { archive: File; connectionId?: string }) =>
      importYoutube(
        input.archive,
        fetch,
        input.connectionId === undefined
          ? { connectionKey: youtubeKey.trim(), connectionLabel: youtubeKey.trim() }
          : { connectionId: input.connectionId },
      ),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['connections'] }),
        queryClient.invalidateQueries({ queryKey: ['sync-runs'] }),
        queryClient.invalidateQueries({ queryKey: ['media'] }),
      ])
    },
  })

  return (
    <section className="page-stack" aria-labelledby="connections-title">
      <div className="page-heading page-heading-compact">
        <p className="eyebrow">Source coverage</p>
        <h1 id="connections-title">Connections</h1>
        <p>See what is connected, how much history is covered, and when each source last synced.</p>
      </div>
      {connections.isError ? (
        <Notice className="notice notice-error">
          Connection status is unavailable because the local API could not be reached.
        </Notice>
      ) : null}
      <label className="checkpoint-note">
        New YouTube account or channel label{' '}
        <Input
          aria-label="YouTube account label"
          value={youtubeKey}
          onChange={(event) => setYoutubeKey(event.target.value)}
          placeholder="e.g. Personal"
        />
      </label>
      {youtubeKey.trim() !== '' ? (
        <FileUploadButton
          accept=".zip,application/zip"
          disabled={youtubeImport.isPending}
          onChange={(event) => {
            const archive = event.currentTarget.files?.[0]
            if (archive !== undefined) youtubeImport.mutate({ archive })
            event.currentTarget.value = ''
          }}
        >
          Import a new YouTube account
        </FileUploadButton>
      ) : null}
      <div className="connection-list" aria-busy={connections.isPending}>
        {(connections.data?.data ?? []).map((connection) => (
          <article className="connection-row" key={connection.id ?? connection.source}>
            <div className={`source-monogram source-${connection.source}`} aria-hidden="true">
              {sourceNames[connection.source].slice(0, 1)}
            </div>
            <div className="connection-copy">
              <h2>{sourceNames[connection.source]}</h2>
              {connection.id === null ? null : <p>{connection.label}</p>}
              <p>
                {connection.status.replaceAll('_', ' ')} · Coverage:{' '}
                {connection.coverage?.replaceAll('_', ' ') ?? 'Not imported'}
              </p>
              <p>{coverageNotes[connection.source]}</p>
              {connection.lastAttemptedSyncAt === null ? null : (
                <p>Last attempt: {new Date(connection.lastAttemptedSyncAt).toLocaleString()}</p>
              )}
              {connection.lastExportAt === null ? null : (
                <p>Last completed export: {new Date(connection.lastExportAt).toLocaleString()}</p>
              )}
              {connection.incompleteImports.map((pending) => (
                <div key={pending.importId}>
                  <p>
                    Import {pending.status}: {pending.nextOffset}
                    {pending.totalRecords === null ? '' : ` / ${pending.totalRecords}`} records
                    committed.
                  </p>
                  {connection.id !== null &&
                  (connection.source === 'youtube' || connection.source === 'spotify') ? (
                    <Button
                      variant="outline"
                      className="sync-button"
                      type="button"
                      disabled={resumed.isPending}
                      onClick={() =>
                        resumed.mutate({
                          source: connection.source as 'youtube' | 'spotify',
                          importId: pending.importId,
                          connectionId: connection.id!,
                        })
                      }
                    >
                      Resume import
                    </Button>
                  ) : (
                    <p>Upload the same ZIP again to retry.</p>
                  )}
                </div>
              ))}
              <p>
                {connection.lastSuccessfulSyncAt === null
                  ? 'No completed sync yet'
                  : `Last synced ${new Date(connection.lastSuccessfulSyncAt).toLocaleString()}`}
              </p>
            </div>
            {connection.source === 'readwise' ? (
              <Button
                variant="outline"
                className="sync-button"
                type="button"
                disabled={readwiseSync.isPending}
                onClick={() => readwiseSync.mutate()}
              >
                {readwiseSync.isPending ? 'Syncing…' : 'Sync now'}
              </Button>
            ) : connection.source === 'hardcover' ? (
              <Button
                variant="outline"
                className="sync-button"
                type="button"
                disabled={hardcoverSync.isPending}
                onClick={() => hardcoverSync.mutate()}
              >
                {hardcoverSync.isPending ? 'Syncing…' : 'Sync now'}
              </Button>
            ) : connection.source === 'letterboxd' ? (
              <div className="connection-actions">
                <Button
                  variant="outline"
                  className="sync-button sync-button-secondary"
                  type="button"
                  disabled={letterboxdSync.isPending}
                  onClick={() => letterboxdSync.mutate()}
                >
                  {letterboxdSync.isPending ? 'Syncing…' : 'Sync now'}
                </Button>
                <FileUploadButton
                  accept=".zip,application/zip"
                  disabled={letterboxdImport.isPending}
                  onChange={(event) => {
                    const archive = event.currentTarget.files?.[0]
                    if (archive !== undefined) letterboxdImport.mutate(archive)
                    event.currentTarget.value = ''
                  }}
                >
                  {letterboxdImport.isPending ? 'Importing…' : 'Import ZIP'}
                </FileUploadButton>
              </div>
            ) : connection.source === 'spotify' ? (
              <div className="connection-actions">
                <Button
                  variant="outline"
                  className="sync-button sync-button-secondary"
                  type="button"
                  disabled={spotifySync.isPending}
                  onClick={() => spotifySync.mutate()}
                >
                  {spotifySync.isPending ? 'Syncing…' : 'Sync now'}
                </Button>
                <FileUploadButton
                  accept=".zip,application/zip"
                  disabled={spotifyImport.isPending}
                  onChange={(event) => {
                    const archive = event.currentTarget.files?.[0]
                    if (archive !== undefined) spotifyImport.mutate(archive)
                    event.currentTarget.value = ''
                  }}
                >
                  {spotifyImport.isPending ? 'Importing…' : 'Import ZIP'}
                </FileUploadButton>
              </div>
            ) : connection.source === 'youtube' ? (
              <FileUploadButton
                accept=".zip,application/zip"
                disabled={
                  youtubeImport.isPending || (connection.id === null && youtubeKey.trim() === '')
                }
                onChange={(event) => {
                  const archive = event.currentTarget.files?.[0]
                  if (archive !== undefined)
                    youtubeImport.mutate({
                      archive,
                      ...(connection.id === null ? {} : { connectionId: connection.id }),
                    })
                  event.currentTarget.value = ''
                }}
              >
                {youtubeImport.isPending ? 'Importing…' : 'Import Takeout'}
              </FileUploadButton>
            ) : (
              <Badge variant="outline">{connection.status}</Badge>
            )}
          </article>
        ))}
        {connections.isPending
          ? Array.from({ length: 5 }, (_, index) => (
              <Skeleton className="connection-skeleton" key={index} aria-hidden="true" />
            ))
          : null}
      </div>
      {readwiseSync.isSuccess ? (
        <p className="checkpoint-note">
          Imported {readwiseSync.data.archiveItems} Archive items from{' '}
          {readwiseSync.data.sourceRecords} Reader records.
        </p>
      ) : null}
      {readwiseSync.isError ? (
        <Notice className="checkpoint-note sync-error">
          Readwise sync failed. Confirm the Worker has a valid READWISE_TOKEN secret.
        </Notice>
      ) : null}
      {hardcoverSync.isSuccess ? (
        <p className="checkpoint-note">
          {hardcoverSync.data.mode === 'backfill' ? 'Imported' : 'Reconciled'}{' '}
          {hardcoverSync.data.books} read books and {hardcoverSync.data.archiveEntries} supported
          reading occurrences from Hardcover.
        </p>
      ) : null}
      {hardcoverSync.isError ? (
        <Notice className="checkpoint-note sync-error">
          Hardcover sync failed. Confirm the Worker has a valid HARDCOVER_TOKEN secret.
        </Notice>
      ) : null}
      {letterboxdImport.isSuccess ? (
        <p className="checkpoint-note">
          {letterboxdImport.data.alreadyImported
            ? 'That exact Letterboxd export was already imported.'
            : `Imported ${letterboxdImport.data.films} films and ${letterboxdImport.data.archiveEntries} viewing records from Letterboxd.`}
        </p>
      ) : null}
      {letterboxdImport.isError ? (
        <Notice className="checkpoint-note sync-error">
          Letterboxd import failed. Select the ZIP downloaded from Letterboxd’s export page.
        </Notice>
      ) : null}
      {letterboxdSync.isSuccess ? (
        <p className="checkpoint-note">
          {letterboxdSync.data.unchanged
            ? `Letterboxd RSS is current (${letterboxdSync.data.feedEntries} recent entries checked).`
            : `Reconciled ${letterboxdSync.data.archiveEntries} recent Letterboxd viewings.`}
        </p>
      ) : null}
      {letterboxdSync.isError ? (
        <Notice className="checkpoint-note sync-error">
          Letterboxd RSS sync failed. Confirm the configured username and try again.
        </Notice>
      ) : null}
      {spotifyImport.isSuccess ? (
        <p className="checkpoint-note">
          {spotifyImport.data.alreadyImported
            ? 'That exact Spotify export was already imported.'
            : `Imported ${spotifyImport.data.totalArchiveEpisodes} podcast episodes from ${spotifyImport.data.totalPodcastSegments} playback segments.`}
        </p>
      ) : null}
      {spotifyImport.isError ? (
        <Notice className="checkpoint-note sync-error">
          Spotify import failed. Select the Extended Streaming History ZIP from Spotify.
        </Notice>
      ) : null}
      {spotifySync.isSuccess ? (
        <p className="checkpoint-note">
          Reconciled {spotifySync.data.archiveEpisodes} consumed saved episodes,{' '}
          {spotifySync.data.savedShows} followed shows, and {spotifySync.data.recentTracks} recent
          track observations; enriched {spotifySync.data.catalogTracks} additional tracks.
        </p>
      ) : null}
      {spotifySync.isSuccess && spotifySync.data.partialFailures.length > 0 ? (
        <Notice className="checkpoint-note sync-error">
          Some Spotify reads could not be refreshed: {spotifySync.data.partialFailures.join(', ')}.
          Retained data remains available.
        </Notice>
      ) : null}
      {spotifySync.isError ? (
        <Notice className="checkpoint-note sync-error">
          Spotify sync failed. Confirm its client ID and refresh token are configured.
        </Notice>
      ) : null}
      {youtubeImport.isSuccess ? (
        <p className="checkpoint-note">
          {youtubeImport.data.alreadyImported
            ? 'That exact YouTube Takeout was already imported.'
            : `Imported ${youtubeImport.data.archiveEntries} YouTube watch occurrences, ${youtubeImport.data.queueEntries} Watch Later entries, and ${youtubeImport.data.subscriptionRecords} subscriptions.`}
        </p>
      ) : null}
      {youtubeImport.isError ? (
        <Notice className="checkpoint-note sync-error">
          YouTube import failed. Select a Google Takeout ZIP containing YouTube watch history.
        </Notice>
      ) : null}
      {resumed.isError ? (
        <Notice>
          Import could not resume. Retry, or upload the original ZIP if parsing did not finish.
        </Notice>
      ) : null}
      <h2>Recent sync activity</h2>
      {runs.isError ? <Notice>Sync activity could not be loaded.</Notice> : null}
      {runs.data?.pages
        .flatMap((page) => page.data)
        .map((run) => (
          <article className="connection-row" key={run.id}>
            <div>
              <strong>{run.connectionLabel}</strong>
              <p>
                {run.catalogProgress ? 'Catalog refresh' : run.kind} ·{' '}
                {(run.catalogProgress?.state ?? run.status).replaceAll('_', ' ')} ·{' '}
                {new Date(run.startedAt).toLocaleString()}
              </p>
              {run.catalogProgress ? (
                <p>
                  {run.catalogProgress.returnedCount.toLocaleString()} metadata records returned ·{' '}
                  {run.catalogProgress.unavailableCount.toLocaleString()} unavailable ·{' '}
                  {run.catalogProgress.requestedCount.toLocaleString()} requested
                  <br />
                  Last activity {new Date(run.catalogProgress.lastActivityAt).toLocaleString()}
                  {run.catalogProgress.nextAttemptAt
                    ? ` · Next attempt ${new Date(run.catalogProgress.nextAttemptAt).toLocaleString()}`
                    : ''}
                </p>
              ) : (
                <p>
                  {run.sourceRecords} source records · {run.normalizedRecords} normalized ·{' '}
                  {run.failedRecords} failed
                </p>
              )}
              {run.errorMessage === null ? null : (
                <Notice>
                  {run.errorMessage} ({run.errorCode})
                </Notice>
              )}
            </div>
          </article>
        ))}
      {runs.hasNextPage ? (
        <Button
          variant="outline"
          type="button"
          className="sync-button"
          disabled={runs.isFetchingNextPage}
          onClick={() => void runs.fetchNextPage()}
        >
          Older activity
        </Button>
      ) : null}
    </section>
  )
}
