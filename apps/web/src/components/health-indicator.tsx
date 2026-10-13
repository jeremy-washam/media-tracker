import { Badge } from '@/components/ui/badge'
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
      <Badge variant="ghost" className="px-0 status-pill" aria-live="polite">
        <span className="status-icon">
          <span className="status-dot status-dot-pending" />
        </span>
        Connecting to local API
      </Badge>
    )
  }

  if (health.isError) {
    return (
      <Badge variant="ghost" className="px-0 status-pill status-pill-error" aria-live="polite">
        <span className="status-icon">
          <span className="status-dot status-dot-error" />
        </span>
        Local API unavailable
      </Badge>
    )
  }

  return (
    <Badge variant="ghost" className="px-0 status-pill" aria-live="polite">
      <span className="status-icon">
        <span className="status-dot status-dot-ready" />
      </span>
      Local API connected
    </Badge>
  )
}
