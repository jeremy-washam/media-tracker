import shellStyles from '@/components/app-shell.module.css'
import { cn } from '@/lib/utils'
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
      <Badge
        variant="ghost"
        className={cn('px-0', shellStyles['status-pill'])}
        aria-live="polite"
        data-ui="health-indicator"
      >
        <span className={shellStyles['status-icon']}>
          <span className={cn(shellStyles['status-dot'], shellStyles['status-dot-pending'])} />
        </span>
        Connecting to local API
      </Badge>
    )
  }

  if (health.isError) {
    return (
      <Badge
        variant="ghost"
        className={cn('px-0', shellStyles['status-pill'], shellStyles['status-pill-error'])}
        aria-live="polite"
        data-ui="health-indicator"
      >
        <span className={shellStyles['status-icon']}>
          <span className={cn(shellStyles['status-dot'], shellStyles['status-dot-error'])} />
        </span>
        Local API unavailable
      </Badge>
    )
  }

  return (
    <Badge
      variant="ghost"
      className={cn('px-0', shellStyles['status-pill'])}
      aria-live="polite"
      data-ui="health-indicator"
    >
      <span className={shellStyles['status-icon']}>
        <span className={cn(shellStyles['status-dot'], shellStyles['status-dot-ready'])} />
      </span>
      Local API connected
    </Badge>
  )
}
