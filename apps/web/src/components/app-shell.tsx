import { useEffect, useState, type ComponentType, type SVGProps } from 'react'
import { Link, Outlet, useLocation } from '@tanstack/react-router'
import {
  BookOpen,
  ChartNoAxesColumn,
  FileText,
  Film,
  Headphones,
  Library,
  Menu,
  MessageSquare,
  Moon,
  Music2,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Sun,
  Video,
  X,
} from 'lucide-react'

import { HealthIndicator } from './health-indicator'

type DisabledNavigationItem = {
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
}

const unavailableMedia: DisabledNavigationItem[] = [
  { label: 'Podcasts', icon: Headphones },
  { label: 'Music', icon: Music2 },
  { label: 'Videos', icon: Video },
]

function preference(key: string): boolean {
  return typeof window !== 'undefined' && window.localStorage.getItem(key) === 'true'
}

function initialDark(): boolean {
  if (typeof window === 'undefined') return false
  const stored = window.localStorage.getItem('media-tracker:dark')
  return stored === null
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : stored === 'true'
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(() => preference('media-tracker:sidebar-collapsed'))
  const [dark, setDark] = useState(initialDark)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const inBooks = location.pathname.startsWith('/library/books')
  const inMovies = location.pathname.startsWith('/library/movies')
  const inArticles = location.pathname.startsWith('/library/articles')
  const inLibrary = inBooks || inMovies || inArticles

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    window.localStorage.setItem('media-tracker:dark', String(dark))
  }, [dark])

  useEffect(() => {
    window.localStorage.setItem('media-tracker:sidebar-collapsed', String(collapsed))
  }, [collapsed])

  return (
    <div
      className={`app-frame ${collapsed ? 'sidebar-collapsed' : ''} ${mobileOpen ? 'mobile-nav-open' : ''}`}
    >
      <button
        type="button"
        className="mobile-backdrop"
        aria-label="Close navigation"
        onClick={() => setMobileOpen(false)}
      />
      <aside className="app-sidebar" aria-label="Primary navigation">
        <div className="app-brand">
          <Link
            to="/library/books/archive"
            aria-label="Imladris Books"
            onClick={() => setMobileOpen(false)}
          >
            <span className="app-brand-mark" aria-hidden="true">
              I
            </span>
            {!collapsed ? <strong>Imladris</strong> : null}
          </Link>
          <button
            className="sidebar-collapse"
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
          <button
            className="mobile-nav-close"
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          >
            <X aria-hidden="true" />
          </button>
        </div>

        <nav className="global-navigation" aria-label="Application">
          <UnavailableNavigation label="Chat" icon={MessageSquare} collapsed={collapsed} />
          <Link
            to="/library/books/archive"
            className={inLibrary ? 'active' : ''}
            aria-current={inLibrary ? 'page' : undefined}
            title="Library"
            onClick={() => setMobileOpen(false)}
          >
            <Library aria-hidden="true" />
            {!collapsed ? <span>Library</span> : null}
          </Link>
          <UnavailableNavigation label="Recaps" icon={ChartNoAxesColumn} collapsed={collapsed} />
        </nav>

        <nav className="media-navigation" aria-label="Media types">
          {!collapsed ? <span className="nav-heading">Media</span> : null}
          <Link
            to="/library/books/archive"
            activeOptions={{ includeSearch: false }}
            className={inBooks ? 'active' : ''}
            aria-current={inBooks ? 'page' : undefined}
            title="Books"
            onClick={() => setMobileOpen(false)}
          >
            <BookOpen aria-hidden="true" />
            {!collapsed ? <span>Books</span> : null}
          </Link>
          <Link
            to="/library/movies/archive"
            activeOptions={{ includeSearch: false }}
            className={inMovies ? 'active' : ''}
            aria-current={inMovies ? 'page' : undefined}
            title="Movies"
            onClick={() => setMobileOpen(false)}
          >
            <Film aria-hidden="true" />
            {!collapsed ? <span>Movies</span> : null}
          </Link>
          <Link
            to="/library/articles/archive"
            activeOptions={{ includeSearch: false }}
            className={inArticles ? 'active' : ''}
            aria-current={inArticles ? 'page' : undefined}
            title="Articles"
            onClick={() => setMobileOpen(false)}
          >
            <FileText aria-hidden="true" />
            {!collapsed ? <span>Articles</span> : null}
          </Link>
          {unavailableMedia.map((item) => (
            <UnavailableNavigation key={item.label} {...item} collapsed={collapsed} />
          ))}
        </nav>

        <div className="sidebar-secondary">
          <Link
            to="/connections"
            activeProps={{ className: 'active' }}
            title="Connections"
            onClick={() => setMobileOpen(false)}
          >
            <Plug aria-hidden="true" />
            {!collapsed ? <span>Connections</span> : null}
          </Link>
          <button
            type="button"
            title={dark ? 'Use light appearance' : 'Use dark appearance'}
            aria-label={dark ? 'Use light appearance' : 'Use dark appearance'}
            onClick={() => setDark((value) => !value)}
          >
            {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
            {!collapsed ? <span>{dark ? 'Light appearance' : 'Dark appearance'}</span> : null}
          </button>
          <div className="sidebar-health">
            <HealthIndicator />
          </div>
        </div>
      </aside>

      <div className="app-workspace">
        <header className="workspace-header">
          <button
            className="mobile-nav-trigger"
            type="button"
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          >
            <Menu aria-hidden="true" />
          </button>
          <div>
            {inLibrary ? (
              <>
                <span>Library</span>
                <span aria-hidden="true">/</span>
                <strong>{inMovies ? 'Movies' : inArticles ? 'Articles' : 'Books'}</strong>
              </>
            ) : (
              <strong>Connections</strong>
            )}
          </div>
        </header>
        <main className="workspace-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function UnavailableNavigation({
  label,
  icon: Icon,
  collapsed,
}: DisabledNavigationItem & { collapsed: boolean }) {
  return (
    <button
      type="button"
      disabled
      aria-label={`${label} — not available yet`}
      title={`${label} — not available yet`}
    >
      <Icon aria-hidden="true" />
      {!collapsed ? <span>{label}</span> : null}
      {!collapsed ? <small>Later</small> : null}
    </button>
  )
}

export function RouteError({ error }: { error: Error }) {
  return (
    <section className="route-state" role="alert">
      <h1>Something went wrong</h1>
      <p>{error.message}</p>
      <Link to="/library/books/archive">Return to Books</Link>
    </section>
  )
}

export function NotFoundPage() {
  return (
    <section className="route-state">
      <h1>Page not found</h1>
      <p>This page does not exist in your media archive.</p>
      <Link to="/library/books/archive">Return to Books</Link>
    </section>
  )
}
