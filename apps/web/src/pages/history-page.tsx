import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import type { MediaSummary } from '@media-tracker/contracts'

import { fetchMedia } from '../api'

const mediaTypeNames = {
  article: 'Article',
  video: 'Video',
  podcast_episode: 'Podcast',
  movie: 'Movie',
  book: 'Book',
  song: 'Song',
} as const

const mediaTypePluralNames = {
  article: 'Articles',
  video: 'Videos',
  podcast_episode: 'Podcasts',
  movie: 'Movies',
  book: 'Books',
  song: 'Songs',
} as const

type MediaType = MediaSummary['type']
type MediaFilter = 'all' | MediaType
const mediaTypes = Object.keys(mediaTypeNames) as MediaType[]

export function HistoryPage() {
  const [filter, setFilter] = useState<MediaFilter>('all')
  const media = useQuery({ queryKey: ['media'], queryFn: () => fetchMedia() })
  const items = media.data?.data ?? []
  const typeCount = new Set(items.map((item) => item.type)).size
  const filteredItems = filter === 'all' ? items : items.filter((item) => item.type === filter)
  const counts = Object.fromEntries(
    mediaTypes.map((type) => [type, items.filter((item) => item.type === type).length]),
  ) as Record<MediaType, number>

  return (
    <section className="page-stack" aria-labelledby="history-title">
      <div className="page-heading">
        <p className="eyebrow">Personal ledger</p>
        <h1 id="history-title">Your media history, in one place.</h1>
        <p>
          Movies, books, podcasts, articles, and videos from your connected services appear here.
        </p>
      </div>

      <div className="summary-grid" aria-label="History summary">
        <article className="summary-card">
          <span>Items imported</span>
          <strong>{media.isPending ? '—' : items.length}</strong>
          <small>{items.length === 0 ? 'Waiting for the first import' : 'In your Archive'}</small>
        </article>
        <article className="summary-card">
          <span>Media types</span>
          <strong>{media.isPending ? '—' : typeCount}</strong>
          <small>Across the current Archive</small>
        </article>
        <article className="summary-card">
          <span>Current view</span>
          <strong>{media.isPending ? '—' : filteredItems.length}</strong>
          <small>{filter === 'all' ? 'All media' : mediaTypePluralNames[filter]}</small>
        </article>
      </div>

      {media.isError ? (
        <div className="notice notice-error" role="alert">
          Your Archive could not be loaded from the local API.
        </div>
      ) : null}

      {!media.isPending && !media.isError && items.length === 0 ? (
        <div className="empty-panel">
          <div className="empty-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <h2>No media yet</h2>
            <p>Open Connections and run the first Readwise Archive sync.</p>
          </div>
        </div>
      ) : null}

      {items.length > 0 ? (
        <>
          <div className="media-filters" aria-label="Filter Archive by media type">
            <button
              type="button"
              className={filter === 'all' ? 'active' : ''}
              aria-pressed={filter === 'all'}
              onClick={() => setFilter('all')}
            >
              All <span>{items.length}</span>
            </button>
            {mediaTypes.map((type) => (
              <button
                type="button"
                className={filter === type ? 'active' : ''}
                aria-pressed={filter === type}
                onClick={() => setFilter(type)}
                key={type}
              >
                {mediaTypePluralNames[type]} <span>{counts[type]}</span>
              </button>
            ))}
          </div>

          <div
            className="media-list"
            aria-label={`${filter === 'all' ? 'All media' : mediaTypePluralNames[filter]} Archive`}
          >
            {filteredItems.map((item) => (
              <article className="media-row" key={item.id}>
                <span className={`media-type-mark media-type-${item.type}`} aria-hidden="true">
                  {mediaTypeNames[item.type].slice(0, 1)}
                </span>
                <div>
                  <h2>{item.title ?? 'Untitled item'}</h2>
                  <p>{mediaTypeNames[item.type]}</p>
                </div>
              </article>
            ))}
            {filteredItems.length === 0 ? (
              <div className="filter-empty">
                No {mediaTypePluralNames[filter as MediaType]?.toLowerCase() ?? 'items'} imported
                yet.
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  )
}
