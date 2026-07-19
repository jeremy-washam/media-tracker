import { useQuery } from '@tanstack/react-query'

import { fetchConnections } from '../api'

const sourceNames = {
  readwise: 'Readwise Reader',
  hardcover: 'Hardcover',
  letterboxd: 'Letterboxd',
  spotify: 'Spotify',
  youtube: 'YouTube',
} as const

export function ConnectionsPage() {
  const connections = useQuery({
    queryKey: ['connections'],
    queryFn: () => fetchConnections(),
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
              <p>Not configured</p>
            </div>
            <span className="connection-state">Disconnected</span>
          </article>
        ))}

        {connections.isPending
          ? Array.from({ length: 5 }, (_, index) => (
              <div className="connection-row connection-skeleton" key={index} aria-hidden="true" />
            ))
          : null}
      </div>

      <p className="checkpoint-note">
        No credentials are needed yet. Provider setup begins with Readwise after the data ledger is
        in place.
      </p>
    </section>
  )
}
