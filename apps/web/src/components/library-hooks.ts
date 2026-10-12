import { useEffect, useRef, useState } from 'react'

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
