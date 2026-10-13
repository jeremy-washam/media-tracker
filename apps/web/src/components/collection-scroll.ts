import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import {
  hashKey,
  useQueryClient,
  type QueryClient,
  type QueryKey,
  type FetchNextPageOptions,
} from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'

interface ScrollPosition {
  top: number
  item: string | undefined
  offset: number
}

const positions = new WeakMap<QueryClient, Map<string, ScrollPosition>>()

function capture(root: HTMLElement): ScrollPosition {
  const top = root.getBoundingClientRect().top + root.clientTop
  const items = root.querySelectorAll<HTMLElement>('[data-collection-item]')
  let start = 0
  let end = items.length
  while (start < end) {
    const middle = Math.floor((start + end) / 2)
    if (items[middle]!.getBoundingClientRect().bottom <= top) start = middle + 1
    else end = middle
  }
  const item = items[start]
  return {
    top: root.scrollTop,
    item: item?.dataset.collectionItem,
    offset: item ? item.getBoundingClientRect().top - top : 0,
  }
}

function restore(root: HTMLElement, position: ScrollPosition) {
  const item = position.item
    ? root.querySelector<HTMLElement>(`[data-collection-item="${CSS.escape(position.item)}"]`)
    : undefined
  root.scrollTop = item
    ? root.scrollTop +
      item.getBoundingClientRect().top -
      root.getBoundingClientRect().top -
      root.clientTop -
      position.offset
    : position.top
}

/** Keep a visible item anchored across layouts and cached, same-session navigation. */
export function useCollectionScroll(queryKey: QueryKey, layout: string, itemCount: number) {
  const root = useRef<HTMLDivElement>(null)
  const client = useQueryClient()
  const router = useRouter()
  const key = hashKey(queryKey)
  const snapshot = useRef<ScrollPosition | undefined>(undefined)
  const pending = useRef<ScrollPosition | undefined>(undefined)
  const previousLayout = useRef(layout)
  const restoredTop = useRef<number | undefined>(undefined)
  const navigation = useRef<string | undefined>(undefined)

  useEffect(
    () =>
      router.history.subscribe(({ action }) => {
        navigation.current = action.type
      }),
    [router],
  )

  useLayoutEffect(() => {
    const element = root.current
    if (!element) return
    let cache = positions.get(client)
    if (!cache) {
      cache = new Map()
      positions.set(client, cache)
    }
    // A new search/filter/sort starts at the top. Back/Forward and returning to
    // a cached collection restore its position; presentation changes keep the key.
    const freshQuery = navigation.current === 'PUSH' || navigation.current === 'REPLACE'
    pending.current = freshQuery ? undefined : cache.get(key)
    snapshot.current = pending.current
    element.scrollTop = 0
    const onScroll = () => {
      // A programmatic layout restore can expose earlier cards in the same row.
      // Keep the chosen anchor until the user actually changes scroll position.
      if (
        restoredTop.current !== undefined &&
        Math.abs(element.scrollTop - restoredTop.current) < 1
      )
        return
      restoredTop.current = undefined
      snapshot.current = capture(element)
    }
    const onLayoutActivation = (event: Event) => {
      if ((event.target as HTMLElement).closest('.layout-toggle')) onScroll()
    }
    let width = element.clientWidth
    const resize = new ResizeObserver(() => {
      if (width === element.clientWidth) return
      width = element.clientWidth
      const position = snapshot.current
      if (position) {
        restore(element, position)
        restoredTop.current = element.scrollTop
        snapshot.current = { ...position, top: element.scrollTop }
      }
    })
    resize.observe(element)
    element.addEventListener('click', onLayoutActivation, true)
    element.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      resize.disconnect()
      element.removeEventListener('click', onLayoutActivation, true)
      element.removeEventListener('scroll', onScroll)
      if (snapshot.current) {
        cache.delete(key)
        cache.set(key, snapshot.current)
        if (cache.size > 100) cache.delete(cache.keys().next().value!)
      }
    }
  }, [client, key])

  useLayoutEffect(() => {
    const element = root.current
    if (!element || itemCount === 0) return
    const position =
      pending.current ?? (previousLayout.current !== layout ? snapshot.current : undefined)
    if (position) {
      restore(element, position)
      restoredTop.current = element.scrollTop
    }
    pending.current = undefined
    previousLayout.current = layout
    snapshot.current = position ? { ...position, top: element.scrollTop } : capture(element)
  }, [key, layout, itemCount])

  return root
}

export interface CollectionPaginationQuery {
  hasNextPage: boolean
  isFetching: boolean
  isFetchingNextPage: boolean
  isFetchNextPageError: boolean
  isPaused: boolean
  fetchNextPage: (options?: FetchNextPageOptions) => Promise<unknown>
}

/** Reobserve after each fetch so short pages can continue filling the pane. */
export function useInfiniteScroll(
  scrollRef: RefObject<HTMLElement | null>,
  sentinelRef: RefObject<HTMLElement | null>,
  query: CollectionPaginationQuery,
) {
  const inFlight = useRef(false)
  const { hasNextPage, isFetching, isFetchNextPageError, isPaused, fetchNextPage } = query
  useEffect(() => {
    const root = scrollRef.current
    const sentinel = sentinelRef.current
    if (
      !root ||
      !sentinel ||
      !hasNextPage ||
      isFetching ||
      isFetchNextPageError ||
      isPaused ||
      !('IntersectionObserver' in window)
    )
      return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting) || inFlight.current) return
        inFlight.current = true
        void fetchNextPage({ cancelRefetch: false })
          .catch(() => {})
          .finally(() => {
            inFlight.current = false
          })
      },
      { root, rootMargin: '0px 0px 400px 0px', threshold: 0 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [
    scrollRef,
    sentinelRef,
    hasNextPage,
    isFetching,
    isFetchNextPageError,
    isPaused,
    fetchNextPage,
  ])
}
