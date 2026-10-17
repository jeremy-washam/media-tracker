import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

/** Section totals are unfiltered library facts, shared across collection queries. */
export function useLibrarySectionCounts<TPage, TCounts>(
  media: string,
  page: TPage | undefined,
  select: (page: TPage) => TCounts,
): TCounts | undefined {
  const queryClient = useQueryClient()
  const cached = queryClient
    .getQueryCache()
    .findAll({ queryKey: [`${media}-summary`] })
    .filter((query) => query.state.data !== undefined)
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt)[0]
  const previousPage = cached?.state.data as TPage | undefined
  return previousPage ? select(previousPage) : page ? select(page) : undefined
}

const layoutKey = 'media-tracker:library-layout'
export function useLibraryLayout(explicit: 'grid' | 'list' | undefined, supported = true) {
  const [saved, setSaved] = useState<'grid' | 'list'>(() => {
    try {
      return localStorage.getItem(layoutKey) === 'grid' ? 'grid' : 'list'
    } catch {
      return 'list'
    }
  })
  const setLayout = (layout: 'grid' | 'list') => {
    setSaved(layout)
    try {
      localStorage.setItem(layoutKey, layout)
    } catch {
      /* Preference can remain in memory. */
    }
  }
  return [supported ? (explicit ?? saved) : 'list', setLayout] as const
}

export function useLiveSearch(
  draft: string | null,
  query: string | undefined,
  apply: (value: string | undefined) => void,
  reset: () => void,
) {
  const latest = useRef({ apply, reset })
  useEffect(() => {
    latest.current = { apply, reset }
  })
  useEffect(() => {
    if (draft === null) return
    const timeout = window.setTimeout(() => {
      if (draft.trim() !== (query ?? '')) latest.current.apply(draft.trim() || undefined)
      latest.current.reset()
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [draft, query])
}

export function useInspectorPresence(item: string | undefined) {
  const [retained, setRetained] = useState(item)
  if (item && item !== retained) setRetained(item)
  useEffect(() => {
    if (item) return
    const timeout = window.setTimeout(() => setRetained(undefined), 180)
    return () => window.clearTimeout(timeout)
  }, [item])
  return item ?? retained
}

export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}
