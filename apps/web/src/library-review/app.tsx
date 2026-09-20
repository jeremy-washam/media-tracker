import { useEffect, useMemo, useState, type ComponentType, type SVGProps } from 'react'
import {
  BookOpen,
  ChartNoAxesColumn,
  FileText,
  Film,
  Headphones,
  Library,
  MessageSquare,
  Moon,
  Music2,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Video,
} from 'lucide-react'
import { ArticlesSurfaceReview } from './articles-surface'
import { BooksSurfaceReview } from './books-surface-review'
import {
  articlesSurfaceData,
  booksSurfaceProps,
  itemCount,
  musicSurfaceData,
  moviesSurfaceProps,
  parseFixture,
  podcastsSurfaceProps,
  videosSurfaceProps,
  type MediaKey,
  type ReviewFixture,
} from './data-adapters'
import { MoviesSurfaceReview } from './movies-surface-review'
import { MusicSurfaceReview } from './music-surface-review'
import { PodcastsSurfaceReview } from './podcasts-surface-review'
import { VideosSurfaceReview } from './videos-surface-review'

type MediaDefinition = {
  key: MediaKey
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
}

const mediaDefinitions: MediaDefinition[] = [
  { key: 'books', label: 'Books', icon: BookOpen },
  { key: 'movies', label: 'Movies', icon: Film },
  { key: 'articles', label: 'Articles', icon: FileText },
  { key: 'podcasts', label: 'Podcasts', icon: Headphones },
  { key: 'videos', label: 'Videos', icon: Video },
  { key: 'music', label: 'Music', icon: Music2 },
]

export function LibraryReviewApp() {
  const [collapsed, setCollapsed] = useState(false)
  const [dark, setDark] = useState(true)
  const [media, setMedia] = useState<MediaKey>('books')
  const [fixture, setFixture] = useState<ReviewFixture>({})
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'missing'>('loading')

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  useEffect(() => {
    const controller = new AbortController()
    fetch('/__private__/library-review-data.json', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Fixture request failed: ${response.status}`)
        return response.json() as Promise<unknown>
      })
      .then((value) => {
        setFixture(parseFixture(value))
        setLoadState('ready')
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setLoadState('missing')
      })
    return () => controller.abort()
  }, [])

  const selectedDefinition = useMemo(
    () => mediaDefinitions.find((definition) => definition.key === media)!,
    [media],
  )
  const booksProps = useMemo(() => booksSurfaceProps(fixture), [fixture])
  const articlesData = useMemo(() => articlesSurfaceData(fixture), [fixture])
  const moviesProps = useMemo(() => moviesSurfaceProps(fixture), [fixture])
  const podcastsProps = useMemo(() => podcastsSurfaceProps(fixture), [fixture])
  const musicData = useMemo(() => musicSurfaceData(fixture), [fixture])
  const videosProps = useMemo(() => videosSurfaceProps(fixture), [fixture])

  const mediaSurface =
    media === 'books' ? (
      <BooksSurfaceReview {...booksProps} />
    ) : media === 'articles' ? (
      <ArticlesSurfaceReview data={articlesData} />
    ) : media === 'movies' ? (
      <MoviesSurfaceReview {...moviesProps} />
    ) : media === 'podcasts' ? (
      <PodcastsSurfaceReview {...podcastsProps} />
    ) : media === 'music' ? (
      <MusicSurfaceReview data={musicData} />
    ) : media === 'videos' ? (
      <VideosSurfaceReview {...videosProps} />
    ) : (
      <div className="review-placeholder">
        <span className="review-eyebrow">{selectedDefinition.label}</span>
        <h1>{loadState === 'loading' ? 'Loading the private sample…' : 'Design in progress'}</h1>
        <p>The media-specific proposal will appear here without changing the shared Index shell.</p>
      </div>
    )

  return (
    <div className="review-page">
      <header className="review-topbar">
        <div>
          <span className="review-eyebrow">Library / Surface review</span>
          <strong>Real-data layout study</strong>
        </div>
        <div className="review-topbar-actions">
          <span className={`data-status data-status-${loadState}`}>
            {loadState === 'ready'
              ? 'Private sample loaded'
              : loadState === 'loading'
                ? 'Loading private sample'
                : 'Private sample unavailable'}
          </span>
          <button
            className="review-icon-button"
            type="button"
            aria-label={dark ? 'Use light appearance' : 'Use dark appearance'}
            onClick={() => setDark((value) => !value)}
          >
            {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </button>
        </div>
      </header>
      <div className={`review-frame ${collapsed ? 'review-frame-collapsed' : ''}`}>
        <aside className="review-sidebar" aria-label="Primary navigation">
          <div className="review-brand">
            {!collapsed && (
              <span>
                Imladris<span aria-hidden="true">.</span>
              </span>
            )}
            <button
              className="review-icon-button"
              type="button"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onClick={() => setCollapsed((value) => !value)}
            >
              {collapsed ? (
                <PanelLeftOpen aria-hidden="true" />
              ) : (
                <PanelLeftClose aria-hidden="true" />
              )}
            </button>
          </div>
          <nav className="review-global-nav" aria-label="Surfaces">
            <button type="button" disabled title="Chat">
              <MessageSquare aria-hidden="true" />
              {!collapsed && <span>Chat</span>}
            </button>
            <button className="active" type="button" aria-current="page" title="Library">
              <Library aria-hidden="true" />
              {!collapsed && <span>Library</span>}
            </button>
            <button type="button" disabled title="Recaps">
              <ChartNoAxesColumn aria-hidden="true" />
              {!collapsed && <span>Recaps</span>}
            </button>
          </nav>
          <nav className="review-media-nav" aria-label="Media types">
            {!collapsed && <span className="review-nav-label">Media</span>}
            {mediaDefinitions.map((definition) => {
              const Icon = definition.icon
              return (
                <button
                  key={definition.key}
                  className={media === definition.key ? 'active' : ''}
                  type="button"
                  title={definition.label}
                  aria-pressed={media === definition.key}
                  onClick={() => setMedia(definition.key)}
                >
                  <Icon aria-hidden="true" />
                  {!collapsed && (
                    <>
                      <span>{definition.label}</span>
                      <small>{itemCount(fixture, definition.key) || '—'}</small>
                    </>
                  )}
                </button>
              )
            })}
          </nav>
          <div className="review-profile">
            <span>J</span>
            {!collapsed && <strong>Profile</strong>}
          </div>
        </aside>
        <main className="review-workspace">
          <div className="review-breadcrumb">
            <span>Library</span>
            <span aria-hidden="true">/</span>
            <strong>{selectedDefinition.label}</strong>
            <small>Proposal · not production</small>
          </div>
          <section className="review-surface" aria-label={`${selectedDefinition.label} proposal`}>
            {mediaSurface}
          </section>
        </main>
      </div>
    </div>
  )
}
