import { InvalidLibraryCursorError } from '../library-api'
import paginationStyles from '@/components/collection-pagination.module.css'
import { cn } from '@/lib/utils'
import { useRef, useLayoutEffect, type RefObject, type MouseEvent } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AppButton as Button } from '@/components/ui-patterns'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { useInfiniteScroll, type CollectionPaginationQuery } from './collection-scroll'

export function CollectionPagination({
  query,
  scrollRef,
  itemCount,
  label,
}: {
  query: CollectionPaginationQuery
  scrollRef: RefObject<HTMLElement | null>
  itemCount: number
  label: string
}) {
  const sentinel = useRef<HTMLDivElement>(null)
  const keyboardFocus = useRef<number | null>(null)
  // Query resolution can precede React's commit; focus after the new rows exist.
  useLayoutEffect(() => {
    const index = keyboardFocus.current
    if (index === null || itemCount <= index) return
    const item = scrollRef.current?.querySelectorAll<HTMLElement>('[data-collection-item]')[index]
    if (item) {
      item.focus()
      keyboardFocus.current = null
    }
  }, [itemCount, scrollRef])
  useInfiniteScroll(scrollRef, sentinel, query)
  if (!query.hasNextPage && itemCount === 0) return null
  const noun = itemCount === 1 ? label.replace(/s$/, '') : label
  const unsupported = typeof window !== 'undefined' && !('IntersectionObserver' in window)
  const invalidCursor = query.error instanceof InvalidLibraryCursorError
  const load = (event: MouseEvent<HTMLButtonElement>) => {
    if (query.isFetching) return
    if (invalidCursor) {
      keyboardFocus.current = null
      void query.refetch().catch(() => {})
      return
    }
    keyboardFocus.current = event.detail === 0 ? itemCount : null
    void query.fetchNextPage({ cancelRefetch: false }).catch(() => {
      keyboardFocus.current = null
    })
  }

  return (
    <div className={paginationStyles['collection-pagination']} data-ui="collection-pagination">
      <div ref={sentinel} className="h-px" aria-hidden="true" />
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={cn(paginationStyles['collection-pagination-status'], 'text-muted-foreground')}
      >
        {query.isPaused ? (
          <span>Waiting for a connection…</span>
        ) : query.isFetchingNextPage ? (
          <>
            <Spinner
              aria-hidden="true"
              role="presentation"
              className="motion-reduce:animate-none"
            />
            <span>Loading more {label}…</span>
          </>
        ) : !query.hasNextPage && itemCount > 0 ? (
          <>
            <Separator className="max-w-12" />
            <span>
              {itemCount === 1 ? '1' : `All ${itemCount.toLocaleString()}`} {noun} loaded
            </span>
            <Separator className="max-w-12" />
          </>
        ) : itemCount > 0 && !query.isFetchNextPageError ? (
          <span className="sr-only">
            {itemCount.toLocaleString()} {noun} loaded. More available.
          </span>
        ) : null}
      </div>
      {query.isFetchNextPageError ? (
        <Alert className="mx-auto max-w-md">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {invalidCursor
                ? 'This collection changed. Refresh it to load more.'
                : `More ${label} could not be loaded.`}
            </span>
            <Button variant="outline" disabled={query.isFetching} onClick={load}>
              {invalidCursor ? 'Refresh collection' : 'Try again'}
            </Button>
          </AlertDescription>
        </Alert>
      ) : query.hasNextPage ? (
        <Button
          variant="outline"
          className={unsupported ? undefined : 'sr-only focus:not-sr-only'}
          disabled={query.isFetching}
          onClick={load}
        >
          Load more {label}
        </Button>
      ) : null}
    </div>
  )
}
