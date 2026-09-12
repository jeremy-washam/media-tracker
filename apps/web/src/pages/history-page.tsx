import { useQuery } from '@tanstack/react-query'

import { fetchMedia } from '../api'

const mediaTypeNames = {
  article: 'Article',
  video: 'Video',
  podcast_episode: 'Podcast',
  movie: 'Movie',
  book: 'Book',
  song: 'Song',
} as const

export function HistoryPage() {
  const media = useQuery({ queryKey: ['media'], queryFn: () => fetchMedia() })
  const items = media.data?.data ?? []
  const typeCount = new Set(items.map((item) => item.type)).size

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
          <span>First source</span>
          <strong>Reader</strong>
          <small>More services come next</small>
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
        <div className="media-list" aria-label="Media Archive">
          {items.map((item) => (
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
        </div>
      ) : null}
    </section>
  )
}
