import controlsStyles from '@/components/library-controls.module.css'
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

type UiPart = { 'data-ui'?: string }
export function FlatTabs({
  className,
  'data-ui': part,
  ...props
}: ComponentProps<typeof Tabs> & UiPart) {
  return (
    <Tabs
      className={cn('gap-0', className)}
      {...props}
      data-ui={['flat-tabs', part].filter(Boolean).join(' ')}
    />
  )
}
export function FlatTabsList({
  className,
  context = 'header',
  'data-ui': part,
  ...props
}: ComponentProps<typeof TabsList> & UiPart & { context?: 'header' | 'standalone' }) {
  return (
    <TabsList
      variant="line"
      className={cn(
        'h-8 gap-[15px] p-0',
        context === 'header' && 'self-stretch group-data-[orientation=horizontal]/tabs:h-full',
        className,
      )}
      {...props}
      data-ui={['flat-tabs-list', part].filter(Boolean).join(' ')}
    />
  )
}
export function FlatTabsTrigger({
  className,
  'data-ui': part,
  ...props
}: ComponentProps<typeof TabsTrigger> & UiPart) {
  return (
    <TabsTrigger
      className={cn(
        'cursor-default h-full flex-none rounded-none px-0.5 text-[12px] leading-(--text-sm--line-height) font-semibold text-muted-foreground data-active:text-foreground group-data-[orientation=horizontal]/tabs:after:bottom-0 group-data-[context=collection]/tabs:px-2',
        className,
      )}
      {...props}
      data-ui={['flat-tabs-trigger', part].filter(Boolean).join(' ')}
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
    // A rapid out-and-back resize can clamp scrollLeft while coalescing to the
    // same observed width. The window event still reveals the selected tab.
    window.addEventListener('resize', revealSelected)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', revealSelected)
    }
  }, [target, children])
  if (!target) return null
  return createPortal(
    <nav
      className={cn(controlsStyles['books-tabs'], 'group/tabs')}
      data-orientation="horizontal"
      data-context="collection"
      aria-label={label}
      data-ui="books-tabs"
    >
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
