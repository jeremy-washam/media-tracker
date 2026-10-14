import { Link } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function CollectionEmptyState({
  icon: Icon,
  title,
  description,
  onClear,
  clearLabel = 'Clear search and filters',
}: {
  icon: LucideIcon
  title: string
  description: string
  onClear?: (() => void) | undefined
  clearLabel?: string
}) {
  return (
    <div className="collection-empty-state">
      <Icon aria-hidden="true" />
      <h2>{title}</h2>
      <p>{description}</p>
      {onClear ? (
        <Button variant="outline" type="button" onClick={onClear}>
          {clearLabel}
        </Button>
      ) : (
        <Button variant="outline" nativeButton={false} render={<Link to="/connections" />}>
          Open Connections
        </Button>
      )}
    </div>
  )
}
