import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { fetchConnections, importLetterboxd, syncReadwise } from '../api'

const sourceNames = {
  readwise: 'Readwise Reader',
  hardcover: 'Hardcover',
  letterboxd: 'Letterboxd',
  spotify: 'Spotify',
  youtube: 'YouTube',
} as const

export function ConnectionsPage() {
  const queryClient = useQueryClient()
  const connections = useQuery({
    queryKey: ['connections'],
    queryFn: () => fetchConnections(),
  })
  const readwiseSync = useMutation({
    mutationFn: () => syncReadwise(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['connections'] }),
        queryClient.invalidateQueries({ queryKey: ['media'] }),
      ])
    },
  })
  const letterboxdImport = useMutation({
    mutationFn: (archive: File) => importLetterboxd(archive),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['connections'] }),
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
        <div className="notice notice-error" role="alert">
          Connection status is unavailable because the local API could not be reached.
        </div>
      ) : null}

      <div className="connection-list" aria-busy={connections.isPending}>
        {(connections.data?.data ?? []).map((connection) => (
          <article className="connection-row" key={connection.source}>
            <div className={`source-monogram source-${connection.source}`} aria-hidden="true">
              {sourceNames[connection.source].slice(0, 1)}
            </div>
            <div className="connection-copy">
              <h2>{sourceNames[connection.source]}</h2>
              <p>
                {connection.lastSuccessfulSyncAt === null
                  ? 'No completed sync yet'
                  : `Last synced ${new Date(connection.lastSuccessfulSyncAt).toLocaleString()}`}
              </p>
            </div>
            {connection.source === 'readwise' ? (
              <button
                className="sync-button"
                type="button"
                disabled={readwiseSync.isPending}
                onClick={() => readwiseSync.mutate()}
              >
                {readwiseSync.isPending ? 'Syncing…' : 'Sync now'}
              </button>
            ) : connection.source === 'letterboxd' ? (
              <label
                className={`sync-button${letterboxdImport.isPending ? ' sync-button-disabled' : ''}`}
              >
                {letterboxdImport.isPending ? 'Importing…' : 'Import ZIP'}
                <input
                  className="file-input"
                  type="file"
                  accept=".zip,application/zip"
                  disabled={letterboxdImport.isPending}
                  onChange={(event) => {
                    const archive = event.currentTarget.files?.[0]
                    if (archive !== undefined) letterboxdImport.mutate(archive)
                    event.currentTarget.value = ''
                  }}
                />
              </label>
            ) : (
              <span className="connection-state">{connection.status}</span>
            )}
          </article>
        ))}

        {connections.isPending
          ? Array.from({ length: 5 }, (_, index) => (
              <div className="connection-row connection-skeleton" key={index} aria-hidden="true" />
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
        <p className="checkpoint-note sync-error" role="alert">
          Readwise sync failed. Confirm the Worker has a valid READWISE_TOKEN secret.
        </p>
      ) : null}
      {letterboxdImport.isSuccess ? (
        <p className="checkpoint-note">
          {letterboxdImport.data.alreadyImported
            ? 'That exact Letterboxd export was already imported.'
            : `Imported ${letterboxdImport.data.films} films and ${letterboxdImport.data.archiveEntries} viewing records from Letterboxd.`}
        </p>
      ) : null}
      {letterboxdImport.isError ? (
        <p className="checkpoint-note sync-error" role="alert">
          Letterboxd import failed. Select the ZIP downloaded from Letterboxd’s export page.
        </p>
      ) : null}
    </section>
  )
}
