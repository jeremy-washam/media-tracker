import { useQuery } from '@tanstack/react-query'

import { fetchHealth } from '../api'

export function HealthIndicator() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => fetchHealth(),
    refetchInterval: 30_000,
    retry: 1,
  })

  if (health.isPending) {
    return (
      <div className="status-pill" aria-live="polite">
        <span className="status-icon">
          <span className="status-dot status-dot-pending" />
        </span>
        Connecting to local API
      </div>
    )
  }

  if (health.isError) {
    return (
      <div className="status-pill status-pill-error" aria-live="polite">
        <span className="status-icon">
          <span className="status-dot status-dot-error" />
        </span>
        Local API unavailable
      </div>
    )
  }

  return (
    <div className="status-pill" aria-live="polite">
      <span className="status-icon">
        <span className="status-dot status-dot-ready" />
      </span>
      Local API connected
    </div>
  )
}
