import inspectorStyles from '@/components/inspector.module.css'
import type { ReactNode } from 'react'
import { X } from '@/components/icons'
import { AppButton as Button } from '@/components/ui-patterns'
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
    <FlatTabsContent key={value} value={value} className={inspectorStyles['inspector-tab-panel']}>
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
    <header className={inspectorStyles['inspector-topbar']} data-ui="inspector-header">
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
