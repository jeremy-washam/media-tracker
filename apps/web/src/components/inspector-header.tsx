import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FlatTabsContent } from '@/components/flat-tabs'

// Tabs keep their panel associations while the shared item request settles.
export function InspectorStatePanels({
  values,
  children,
}: {
  values: string[]
  children: ReactNode
}) {
  return values.map((value) => (
    <FlatTabsContent key={value} value={value} className="inspector-tab-panel">
      {children}
    </FlatTabsContent>
  ))
}

export function InspectorHeader({
  children,
  onClose,
}: {
  children: ReactNode
  onClose: () => void
}) {
  return (
    <header className="inspector-topbar">
      {children}
      <Button
        variant="ghost"
        size="icon"
        type="button"
        onClick={onClose}
        aria-label="Close inspector"
      >
        <X />
      </Button>
    </header>
  )
}
