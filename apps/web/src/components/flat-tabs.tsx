import {
  Children,
  isValidElement,
  useContext,
  useLayoutEffect,
  type ComponentProps,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { WorkspaceHeaderContext } from './workspace-header-context'

export function FlatTabs({ className, ...props }: ComponentProps<typeof Tabs>) {
  return <Tabs className={cn('flat-tabs gap-0', className)} {...props} />
}

export function FlatTabsList({ className, ...props }: ComponentProps<typeof TabsList>) {
  return <TabsList variant="line" className={cn('flat-tabs-list', className)} {...props} />
}

export function FlatTabsTrigger({ className, ...props }: ComponentProps<typeof TabsTrigger>) {
  return (
    <TabsTrigger
      className={cn(
        'flat-tabs-trigger group-data-[orientation=horizontal]/tabs:after:bottom-0',
        className,
      )}
      {...props}
    />
  )
}

export function FlatTabsContent({
  keepMounted = true,
  ...props
}: ComponentProps<typeof TabsContent>) {
  return <TabsContent keepMounted={keepMounted} {...props} />
}

// Route-aware links stay owned by each collection, including search normalization
// and its cached counts. Only their placement and presentation are shared.
export function CollectionTabList({
  children,
  'aria-label': label,
}: {
  children: ReactNode
  'aria-label': string
}) {
  const target = useContext(WorkspaceHeaderContext)
  useLayoutEffect(() => {
    if (!target) return
    const revealSelected = () => {
      const active = target.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
      if (!active) return
      const viewport = target.getBoundingClientRect()
      const tab = active.getBoundingClientRect()
      if (tab.left < viewport.left) target.scrollBy({ left: tab.left - viewport.left })
      else if (tab.right > viewport.right) target.scrollBy({ left: tab.right - viewport.right })
    }
    revealSelected()
    const observer = new ResizeObserver(revealSelected)
    observer.observe(target)
    return () => observer.disconnect()
  }, [target, children])
  if (!target) return null
  return createPortal(
    <nav className="books-tabs group/tabs" data-orientation="horizontal" aria-label={label}>
      <FlatTabsList aria-label={label} activateOnFocus={false}>
        {Children.map(children, (child) => {
          if (!isValidElement<{ to: string; children: ReactNode }>(child)) return child
          return (
            <FlatTabsTrigger
              nativeButton={false}
              value={child.props.to.split('/').at(-1)}
              render={child}
            >
              {child.props.children}
            </FlatTabsTrigger>
          )
        })}
      </FlatTabsList>
    </nav>,
    target,
  )
}
