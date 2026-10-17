import { invalidateLibraryQueries } from '../library-queries'
import { Notice, FileUploadButton } from '@/components/ui-patterns'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useId, useState, type ReactNode } from 'react'
import {
  CaretDown,
  CheckCircle,
  XCircle,
  Clock,
  ArrowsClockwise,
  Warning,
  UploadSimple,
} from '@/components/icons'
import type { ConnectionsResponse } from '@media-tracker/contracts'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { SourceLogo } from '@/components/source-logo'
import styles from './connections-page.module.css'
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
    'Reader documents across all locations and highlights are reconciled hourly when deployed. Removed documents retain their evidence.',
  hardcover:
    'Want to Read, Currently Reading, and Read relationships are reconciled hourly when deployed.',
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
        invalidateLibraryQueries(queryClient),
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
        invalidateLibraryQueries(queryClient),
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
        invalidateLibraryQueries(queryClient),
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
        invalidateLibraryQueries(queryClient),
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
        invalidateLibraryQueries(queryClient),
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
        invalidateLibraryQueries(queryClient),
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
        invalidateLibraryQueries(queryClient),
      ])
    },
  })

  return (
    <section className={styles.page} data-ui="connections-page" aria-label="Connections">
      {connections.isError ? (
        <Notice>
          <p>Connection status could not be loaded.</p>
          <Button size="sm" variant="outline" onClick={() => void connections.refetch()}>
            Try again
          </Button>
        </Notice>
      ) : null}
      <div className={styles.sources} aria-busy={connections.isPending}>
        {connectionRows(connections.data?.data ?? []).map(
          ({ connection, additionalConnections }) => (
            <ConnectionRow
              key={connection.id ?? connection.source}
              connection={connection}
              additionalConnections={additionalConnections}
              resuming={resumed.isPending}
              onResume={(input) => resumed.mutate(input)}
            >
              {connection.source === 'readwise' ? (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  disabled={readwiseSync.isPending}
                  onClick={() => readwiseSync.mutate()}
                >
                  {readwiseSync.isPending ? (
                    <Spinner aria-hidden="true" />
                  ) : (
                    <ArrowsClockwise aria-hidden="true" />
                  )}
                  {readwiseSync.isPending ? 'Syncing…' : 'Sync now'}
                </Button>
              ) : connection.source === 'hardcover' ? (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  disabled={hardcoverSync.isPending}
                  onClick={() => hardcoverSync.mutate()}
                >
                  {hardcoverSync.isPending ? (
                    <Spinner aria-hidden="true" />
                  ) : (
                    <ArrowsClockwise aria-hidden="true" />
                  )}
                  {hardcoverSync.isPending ? 'Syncing…' : 'Sync now'}
                </Button>
              ) : connection.source === 'letterboxd' ? (
                <div className={styles.actionGroup}>
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    disabled={letterboxdSync.isPending}
                    onClick={() => letterboxdSync.mutate()}
                  >
                    {letterboxdSync.isPending ? (
                      <Spinner aria-hidden="true" />
                    ) : (
                      <ArrowsClockwise aria-hidden="true" />
                    )}
                    {letterboxdSync.isPending ? 'Syncing…' : 'Sync now'}
                  </Button>
                  <FileUploadButton
                    buttonSize="sm"
                    accept=".zip,application/zip"
                    disabled={letterboxdImport.isPending}
                    onChange={(event) => {
                      const archive = event.currentTarget.files?.[0]
                      if (archive !== undefined) letterboxdImport.mutate(archive)
                      event.currentTarget.value = ''
                    }}
                  >
                    <UploadSimple aria-hidden="true" />
                    {letterboxdImport.isPending ? 'Importing…' : 'Import ZIP'}
                  </FileUploadButton>
                </div>
              ) : connection.source === 'spotify' ? (
                <div className={styles.actionGroup}>
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    disabled={spotifySync.isPending}
                    onClick={() => spotifySync.mutate()}
                  >
                    {spotifySync.isPending ? (
                      <Spinner aria-hidden="true" />
                    ) : (
                      <ArrowsClockwise aria-hidden="true" />
                    )}
                    {spotifySync.isPending ? 'Syncing…' : 'Sync now'}
                  </Button>
                  <FileUploadButton
                    buttonSize="sm"
                    accept=".zip,application/zip"
                    disabled={spotifyImport.isPending}
                    onChange={(event) => {
                      const archive = event.currentTarget.files?.[0]
                      if (archive !== undefined) spotifyImport.mutate(archive)
                      event.currentTarget.value = ''
                    }}
                  >
                    <UploadSimple aria-hidden="true" />
                    {spotifyImport.isPending ? 'Importing…' : 'Import ZIP'}
                  </FileUploadButton>
                </div>
              ) : connection.source === 'youtube' ? (
                <FileUploadButton
                  buttonSize="sm"
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
                  <UploadSimple aria-hidden="true" />
                  {youtubeImport.isPending ? 'Importing…' : 'Import Takeout'}
                </FileUploadButton>
              ) : null}
            </ConnectionRow>
          ),
        )}
        {connections.isPending
          ? Array.from({ length: 5 }, (_, index) => (
              <div className={styles.skeletonRow} key={index} aria-hidden="true">
                <Skeleton className="size-8" />
                <div className={styles.skeletonCopy}>
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-56 max-w-full" />
                </div>
              </div>
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
        <Notice>Readwise sync failed. Confirm the Worker has a valid READWISE_TOKEN secret.</Notice>
      ) : null}
      {hardcoverSync.isSuccess ? (
        <p className="checkpoint-note">
          {hardcoverSync.data.mode === 'backfill' ? 'Imported' : 'Reconciled'}{' '}
          {hardcoverSync.data.books} read books and {hardcoverSync.data.archiveEntries} supported
          reading occurrences from Hardcover.
        </p>
      ) : null}
      {hardcoverSync.isError ? (
        <Notice>
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
        <Notice>
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
        <Notice>Letterboxd RSS sync failed. Confirm the configured username and try again.</Notice>
      ) : null}
      {spotifyImport.isSuccess ? (
        <p className="checkpoint-note">
          {spotifyImport.data.alreadyImported
            ? 'That exact Spotify export was already imported.'
            : `Imported ${spotifyImport.data.totalArchiveEpisodes} podcast episodes from ${spotifyImport.data.totalPodcastSegments} playback segments.`}
        </p>
      ) : null}
      {spotifyImport.isError ? (
        <Notice>
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
        <Notice>
          Some Spotify reads could not be refreshed: {spotifySync.data.partialFailures.join(', ')}.
          Retained data remains available.
        </Notice>
      ) : null}
      {spotifySync.isError ? (
        <Notice>
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
        <Notice>
          YouTube import failed. Select a Google Takeout ZIP containing YouTube watch history.
        </Notice>
      ) : null}
      {resumed.isError ? (
        <Notice>
          Import could not resume. Retry, or upload the original ZIP if parsing did not finish.
        </Notice>
      ) : null}
      <section className={styles.newAccount} aria-labelledby="youtube-account-title">
        <div>
          <h2 id="youtube-account-title">Add a YouTube account</h2>
          <p>Import later snapshots using the existing account above.</p>
        </div>
        <div className={styles.accountForm}>
          <div className={styles.accountField}>
            <FieldLabel htmlFor="youtube-account-label">Account label</FieldLabel>
            <Input
              id="youtube-account-label"
              aria-label="YouTube account label"
              value={youtubeKey}
              onChange={(event) => setYoutubeKey(event.target.value)}
              placeholder="e.g. Personal"
            />
          </div>
          <FileUploadButton
            accept=".zip,application/zip"
            disabled={youtubeImport.isPending || youtubeKey.trim() === ''}
            onChange={(event) => {
              const archive = event.currentTarget.files?.[0]
              if (archive !== undefined) youtubeImport.mutate({ archive })
              event.currentTarget.value = ''
            }}
          >
            <UploadSimple aria-hidden="true" />
            {youtubeImport.isPending ? 'Importing…' : 'Import a new YouTube account'}
          </FileUploadButton>
        </div>
      </section>
      <section className={styles.activity} aria-labelledby="sync-activity-title">
        <h2 id="sync-activity-title">Recent sync activity</h2>
        {runs.isPending ? <Skeleton className="h-16 w-full" /> : null}
        {runs.isError ? (
          <Notice>
            <p>Sync activity could not be loaded.</p>
            <Button size="sm" variant="outline" onClick={() => void runs.refetch()}>
              Try again
            </Button>
          </Notice>
        ) : null}
        {runs.isSuccess && runs.data.pages.every((page) => page.data.length === 0) ? (
          <p className={styles.muted}>No recent sync activity.</p>
        ) : null}
        {runs.data?.pages
          .flatMap((page) => page.data)
          .map((run) => {
            const status = run.catalogProgress?.state ?? run.status
            return (
              <article className={styles.activityRow} key={run.id}>
                <div className={styles.activityIcon} aria-hidden="true">
                  {status === 'succeeded' ? (
                    <CheckCircle className={styles.connected} />
                  ) : status === 'failed' ? (
                    <XCircle className={styles.disconnected} />
                  ) : status === 'running' ? (
                    <Spinner />
                  ) : status === 'partially_succeeded' ? (
                    <Warning className={styles.degraded} />
                  ) : (
                    <Clock />
                  )}
                </div>
                <div className={styles.activityCopy}>
                  <div className={styles.activityHeading}>
                    <strong>{run.connectionLabel}</strong>
                    <time dateTime={run.startedAt}>{formatTimestamp(run.startedAt)}</time>
                  </div>
                  <p>
                    {run.catalogProgress ? 'Catalog refresh' : run.kind} ·{' '}
                    {status.replaceAll('_', ' ')}
                  </p>
                  {run.catalogProgress ? (
                    <p>
                      {run.catalogProgress.returnedCount.toLocaleString()} metadata records returned
                      · {run.catalogProgress.unavailableCount.toLocaleString()} unavailable ·{' '}
                      {run.catalogProgress.requestedCount.toLocaleString()} requested
                      <br />
                      Last activity {formatTimestamp(run.catalogProgress.lastActivityAt)}
                      {run.catalogProgress.nextAttemptAt
                        ? ` · Next attempt ${formatTimestamp(run.catalogProgress.nextAttemptAt)}`
                        : ''}
                    </p>
                  ) : (
                    <p>
                      {run.sourceRecords.toLocaleString()} source records ·{' '}
                      {run.normalizedRecords.toLocaleString()} normalized ·{' '}
                      {run.failedRecords.toLocaleString()} failed
                    </p>
                  )}
                  {run.errorMessage === null ? null : (
                    <Notice>
                      {run.errorMessage} ({run.errorCode})
                    </Notice>
                  )}
                </div>
              </article>
            )
          })}
        {runs.hasNextPage ? (
          <Button
            variant="outline"
            type="button"
            size="sm"
            disabled={runs.isFetchingNextPage}
            onClick={() => void runs.fetchNextPage()}
          >
            Older activity
          </Button>
        ) : null}
      </section>
    </section>
  )
}

type Connection = ConnectionsResponse['data'][number]
type ResumeInput = { source: 'spotify' | 'youtube'; importId: string; connectionId: string }

function connectionRows(connections: readonly Connection[]) {
  const spotify = connections.filter((connection) => connection.source === 'spotify')
  return connections
    .filter((connection) => connection.source !== 'spotify' || connection === spotify[0])
    .map((connection) => ({
      connection,
      // The API's first Spotify record is also the target of Sync and Import ZIP.
      // Keep other records available for recovery without repeating those actions.
      additionalConnections: connection.source === 'spotify' ? spotify.slice(1) : [],
    }))
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function ConnectionStatus({ status }: { status: Connection['status'] }) {
  const appearance = {
    connected: { icon: CheckCircle, label: 'Connected', className: styles.connected },
    disconnected: { icon: XCircle, label: 'Disconnected', className: styles.disconnected },
    degraded: { icon: Warning, label: 'Needs attention', className: styles.degraded },
    reauthorization_required: {
      icon: XCircle,
      label: 'Sign-in required',
      className: styles.disconnected,
    },
  }[status]
  const Icon = appearance.icon
  return (
    <span className={`${styles.status} ${appearance.className}`}>
      <Icon aria-hidden="true" />
      {appearance.label}
    </span>
  )
}

function ConnectionRow({
  connection,
  additionalConnections,
  children,
  resuming,
  onResume,
}: {
  connection: Connection
  additionalConnections: readonly Connection[]
  children: ReactNode
  resuming: boolean
  onResume: (input: ResumeInput) => void
}) {
  const headingId = useId()
  return (
    <article
      className={styles.sourceRow}
      data-source={connection.source}
      aria-labelledby={headingId}
    >
      <SourceLogo source={connection.source} className={styles.logo} />
      <div className={styles.sourceCopy}>
        <div className={styles.sourceHeading}>
          <h2 id={headingId}>{sourceNames[connection.source]}</h2>
          <ConnectionStatus status={connection.status} />
        </div>
        {connection.id !== null && connection.label !== sourceNames[connection.source] ? (
          <p className={styles.accountName}>{connection.label}</p>
        ) : null}
        <div className={styles.facts}>
          <span>
            {connection.coverage === null
              ? 'Not imported'
              : `${connection.coverage.replaceAll('_', ' ')} coverage`}
          </span>
          <span>
            {connection.lastSuccessfulSyncAt === null ? (
              'No completed sync yet'
            ) : (
              <>
                Synced{' '}
                <time dateTime={connection.lastSuccessfulSyncAt}>
                  {formatTimestamp(connection.lastSuccessfulSyncAt)}
                </time>
              </>
            )}
          </span>
        </div>
        {additionalConnections.length > 0 ? (
          <p className={styles.accountName}>
            {additionalConnections.length} additional saved connection
            {additionalConnections.length === 1 ? '' : 's'} in Details
            {additionalConnections.some((saved) => saved.incompleteImports.length > 0)
              ? ' · Unfinished import needs attention'
              : ''}
          </p>
        ) : null}
        <Collapsible className={styles.details}>
          <CollapsibleTrigger render={<Button variant="ghost" size="xs" />}>
            Details <CaretDown aria-hidden="true" />
          </CollapsibleTrigger>
          <CollapsibleContent className={styles.detailsContent}>
            <p>{coverageNotes[connection.source]}</p>
            {connection.lastAttemptedSyncAt === null ? null : (
              <p>
                Last attempt:{' '}
                <time dateTime={connection.lastAttemptedSyncAt}>
                  {formatTimestamp(connection.lastAttemptedSyncAt)}
                </time>
              </p>
            )}
            {connection.lastExportAt === null ? null : (
              <p>
                Last completed export:{' '}
                <time dateTime={connection.lastExportAt}>
                  {formatTimestamp(connection.lastExportAt)}
                </time>
              </p>
            )}
            {additionalConnections.map((saved, index) => (
              <section className={styles.savedConnection} key={saved.id ?? index}>
                <div className={styles.sourceHeading}>
                  <h3>
                    {saved.label !== sourceNames[saved.source]
                      ? saved.label
                      : `Additional saved connection ${index + 1}`}
                  </h3>
                  <ConnectionStatus status={saved.status} />
                </div>
                <p>
                  {saved.coverage === null
                    ? 'Not imported'
                    : `${saved.coverage.replaceAll('_', ' ')} coverage`}
                </p>
                {saved.lastSuccessfulSyncAt === null ? (
                  <p>No completed sync yet</p>
                ) : (
                  <p>
                    Last synced:{' '}
                    <time dateTime={saved.lastSuccessfulSyncAt}>
                      {formatTimestamp(saved.lastSuccessfulSyncAt)}
                    </time>
                  </p>
                )}
                {saved.lastAttemptedSyncAt === null ? null : (
                  <p>
                    Last attempt:{' '}
                    <time dateTime={saved.lastAttemptedSyncAt}>
                      {formatTimestamp(saved.lastAttemptedSyncAt)}
                    </time>
                  </p>
                )}
                {saved.lastExportAt === null ? null : (
                  <p>
                    Last completed export:{' '}
                    <time dateTime={saved.lastExportAt}>{formatTimestamp(saved.lastExportAt)}</time>
                  </p>
                )}
                <PendingImports connection={saved} resuming={resuming} onResume={onResume} />
              </section>
            ))}
          </CollapsibleContent>
        </Collapsible>
        <PendingImports connection={connection} resuming={resuming} onResume={onResume} />
      </div>
      <div className={styles.actions}>{children}</div>
    </article>
  )
}

function PendingImports({
  connection,
  resuming,
  onResume,
}: {
  connection: Connection
  resuming: boolean
  onResume: (input: ResumeInput) => void
}) {
  return (
    <>
      {connection.incompleteImports.map((pending) => (
        <div className={styles.pendingImport} key={pending.importId}>
          <p>
            Import {pending.status}: {pending.nextOffset.toLocaleString()}
            {pending.totalRecords === null
              ? ''
              : ` / ${pending.totalRecords.toLocaleString()}`}{' '}
            records committed.
          </p>
          {connection.id !== null &&
          (connection.source === 'youtube' || connection.source === 'spotify') ? (
            <Button
              variant="outline"
              size="sm"
              disabled={resuming}
              onClick={() =>
                onResume({
                  source: connection.source as 'youtube' | 'spotify',
                  importId: pending.importId,
                  connectionId: connection.id!,
                })
              }
            >
              <ArrowsClockwise aria-hidden="true" />
              Resume import
            </Button>
          ) : (
            <p>Upload the same ZIP again to retry.</p>
          )}
        </div>
      ))}
    </>
  )
}
