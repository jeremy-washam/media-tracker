import { navigationItemVariants } from './navigation-variants'
import shellStyles from '@/components/app-shell.module.css'
import { cn } from '@/lib/utils'
import { WorkspaceHeaderContext } from './workspace-header-context'
import { AppButton as Button } from '@/components/ui-patterns'
import { Hint, Notice } from '@/components/ui-patterns'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { useEffect, useState } from 'react'
import type { AppIcon } from '@/components/icons'
import { Link, Outlet, useLocation } from '@tanstack/react-router'
import {
  BookOpen,
  ChartBar,
  Article,
  FilmReel,
  Microphone,
  Books,
  List,
  ChatCircle,
  Moon,
  MusicNotes,
  ArrowLineLeft,
  ArrowLineRight,
  Plugs,
  Sun,
  YoutubeLogo,
} from '@/components/icons'

import { HealthIndicator } from './health-indicator'

type DisabledNavigationItem = {
  label: string
  icon: AppIcon
}

const unavailableMedia: DisabledNavigationItem[] = []

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
  const [headerTarget, setHeaderTarget] = useState<HTMLDivElement | null>(null)
  const location = useLocation()
  const inBooks = location.pathname.startsWith('/library/books')
  const inMovies = location.pathname.startsWith('/library/movies')
  const inArticles = location.pathname.startsWith('/library/articles')
  const inPodcasts = location.pathname.startsWith('/library/podcasts')
  const inMusic = location.pathname.startsWith('/library/music')
  const inVideos = location.pathname.startsWith('/library/videos')
  const inLibrary = inBooks || inMovies || inArticles || inPodcasts || inMusic || inVideos

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    window.localStorage.setItem('media-tracker:dark', String(dark))
  }, [dark])

  useEffect(() => {
    window.localStorage.setItem('media-tracker:sidebar-collapsed', String(collapsed))
  }, [collapsed])

  const navigation = (collapsed: boolean, mobile: boolean) => (
    <aside
      className={
        mobile
          ? cn(shellStyles['app-sidebar'], shellStyles['mobile-sidebar'])
          : shellStyles['app-sidebar']
      }
      aria-label="Primary navigation"
      data-ui="app-sidebar"
    >
      <div className={shellStyles['app-brand']} data-ui="app-brand">
        <Link
          to="/library/books/archive"
          aria-label="Imladris Books"
          className="cursor-default"
          onClick={() => setMobileOpen(false)}
        >
          <span
            className={shellStyles['app-brand-mark']}
            aria-hidden="true"
            data-ui="app-brand-mark"
          />
          <strong className={shellStyles['app-brand-wordmark']} data-ui="app-brand-wordmark">
            Imladris
          </strong>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className={shellStyles['sidebar-collapse']}
          type="button"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() => setCollapsed((value) => !value)}
          data-ui="sidebar-collapse"
        >
          {collapsed ? <ArrowLineRight aria-hidden="true" /> : <ArrowLineLeft aria-hidden="true" />}
        </Button>
      </div>

      <nav
        className={shellStyles['global-navigation']}
        aria-label="Application"
        data-ui="global-navigation"
      >
        <UnavailableNavigation label="Chat" icon={ChatCircle} collapsed={collapsed} />
        <Hint content="Library">
          <Link
            to="/library/books/archive"
            className={navigationItemVariants({ active: inLibrary, collapsed })}
            aria-current={inLibrary ? 'page' : undefined}
            aria-label="Library"
            onClick={() => setMobileOpen(false)}
          >
            <Books aria-hidden="true" />
            {!collapsed ? <span>Library</span> : null}
          </Link>
        </Hint>
        <UnavailableNavigation label="Recaps" icon={ChartBar} collapsed={collapsed} />
      </nav>

      <nav
        className={shellStyles['media-navigation']}
        aria-label="Media types"
        data-ui="media-navigation"
      >
        {!collapsed ? <span className={shellStyles['nav-heading']}>Media</span> : null}
        <Hint content="Books">
          <Link
            to="/library/books/archive"
            activeOptions={{ includeSearch: false }}
            className={navigationItemVariants({ active: inBooks, collapsed })}
            aria-current={inBooks ? 'page' : undefined}
            aria-label="Books"
            onClick={() => setMobileOpen(false)}
          >
            <BookOpen aria-hidden="true" />
            {!collapsed ? <span>Books</span> : null}
          </Link>
        </Hint>
        <Hint content="Movies">
          <Link
            to="/library/movies/archive"
            activeOptions={{ includeSearch: false }}
            className={navigationItemVariants({ active: inMovies, collapsed })}
            aria-current={inMovies ? 'page' : undefined}
            aria-label="Movies"
            onClick={() => setMobileOpen(false)}
          >
            <FilmReel aria-hidden="true" />
            {!collapsed ? <span>Movies</span> : null}
          </Link>
        </Hint>
        <Hint content="Articles">
          <Link
            to="/library/articles/archive"
            activeOptions={{ includeSearch: false }}
            className={navigationItemVariants({ active: inArticles, collapsed })}
            aria-current={inArticles ? 'page' : undefined}
            aria-label="Articles"
            onClick={() => setMobileOpen(false)}
          >
            <Article aria-hidden="true" />
            {!collapsed ? <span>Articles</span> : null}
          </Link>
        </Hint>
        <Hint content="Podcasts">
          <Link
            to="/library/podcasts/archive"
            activeOptions={{ includeSearch: false }}
            className={navigationItemVariants({ active: inPodcasts, collapsed })}
            aria-current={inPodcasts ? 'page' : undefined}
            aria-label="Podcasts"
            onClick={() => setMobileOpen(false)}
          >
            <Microphone aria-hidden="true" />
            {!collapsed ? <span>Podcasts</span> : null}
          </Link>
        </Hint>
        <Hint content="Music">
          <Link
            to="/library/music/tracks"
            activeOptions={{ includeSearch: false }}
            className={navigationItemVariants({ active: inMusic, collapsed })}
            aria-current={inMusic ? 'page' : undefined}
            aria-label="Music"
            onClick={() => setMobileOpen(false)}
          >
            <MusicNotes aria-hidden="true" />
            {!collapsed ? <span>Music</span> : null}
          </Link>
        </Hint>
        <Hint content="Videos">
          <Link
            to="/library/videos/archive"
            activeOptions={{ includeSearch: false }}
            className={navigationItemVariants({ active: inVideos, collapsed })}
            aria-current={inVideos ? 'page' : undefined}
            aria-label="Videos"
            onClick={() => setMobileOpen(false)}
          >
            <YoutubeLogo aria-hidden="true" />
            {!collapsed ? <span>Videos</span> : null}
          </Link>
        </Hint>
        {unavailableMedia.map((item) => (
          <UnavailableNavigation key={item.label} {...item} collapsed={collapsed} />
        ))}
      </nav>

      <div className={shellStyles['sidebar-secondary']} data-ui="sidebar-secondary">
        <Hint content="Connections">
          <Link
            to="/connections"
            className={navigationItemVariants({
              active: location.pathname === '/connections',
              collapsed,
            })}
            aria-label="Connections"
            onClick={() => setMobileOpen(false)}
          >
            <Plugs aria-hidden="true" />
            {!collapsed ? <span>Connections</span> : null}
          </Link>
        </Hint>
        <Hint content={dark ? 'Use light appearance' : 'Use dark appearance'}>
          <Button
            variant="ghost"
            className={navigationItemVariants({ collapsed })}
            type="button"
            aria-label={dark ? 'Use light appearance' : 'Use dark appearance'}
            onClick={() => setDark((value) => !value)}
          >
            {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
            {!collapsed ? <span>{dark ? 'Light appearance' : 'Dark appearance'}</span> : null}
          </Button>
        </Hint>
        <div className={shellStyles['sidebar-health']}>
          <HealthIndicator />
        </div>
      </div>
    </aside>
  )

  return (
    <WorkspaceHeaderContext value={headerTarget}>
      <TooltipProvider delay={300}>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <div
            className={cn(
              shellStyles['app-frame'],
              collapsed ? shellStyles['sidebar-collapsed'] : undefined,
            )}
            data-ui="app-frame"
            data-sidebar-collapsed={collapsed}
          >
            {navigation(collapsed, false)}
            <SheetContent
              side="left"
              className={cn(shellStyles['navigation-sheet'], 'p-0')}
              showCloseButton
            >
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SheetDescription className="sr-only">
                Library and source connections
              </SheetDescription>
              {navigation(false, true)}
            </SheetContent>

            <div className={shellStyles['app-workspace']}>
              <header className={shellStyles['workspace-header']} data-ui="workspace-header">
                <SheetTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      className={shellStyles['mobile-nav-trigger']}
                      aria-label="Open navigation"
                      data-ui="mobile-nav-trigger"
                    />
                  }
                >
                  <List aria-hidden="true" />
                </SheetTrigger>
                <div className={shellStyles['workspace-breadcrumb']} data-ui="workspace-breadcrumb">
                  {inLibrary ? (
                    <>
                      <span>Library</span>
                      <span aria-hidden="true">/</span>
                      <strong>
                        {inMovies
                          ? 'Movies'
                          : inArticles
                            ? 'Articles'
                            : inPodcasts
                              ? 'Podcasts'
                              : inMusic
                                ? 'Music'
                                : inVideos
                                  ? 'Videos'
                                  : 'Books'}
                      </strong>
                    </>
                  ) : (
                    <strong>Connections</strong>
                  )}
                </div>
                <div
                  className={shellStyles['workspace-header-tabs']}
                  ref={setHeaderTarget}
                  data-ui="workspace-tabs"
                />
              </header>
              <main className={shellStyles['workspace-content']}>
                <Outlet />
              </main>
            </div>
          </div>
        </Sheet>
      </TooltipProvider>
    </WorkspaceHeaderContext>
  )
}

function UnavailableNavigation({
  label,
  icon: Icon,
  collapsed,
}: DisabledNavigationItem & { collapsed: boolean }) {
  return (
    <Button
      variant="ghost"
      type="button"
      disabled
      aria-label={`${label} — not available yet`}
      className={navigationItemVariants({ collapsed })}
    >
      <Icon aria-hidden="true" />
      {!collapsed ? <span>{label}</span> : null}
      {!collapsed ? <small>Later</small> : null}
    </Button>
  )
}

export function RouteError({ error }: { error: Error }) {
  return (
    <Notice className={shellStyles['route-state']}>
      <h1>Something went wrong</h1>
      <p>{error.message}</p>
      <Link to="/library/books/archive">Return to Books</Link>
    </Notice>
  )
}

export function NotFoundPage() {
  return (
    <section className={shellStyles['route-state']}>
      <h1>Page not found</h1>
      <p>This page does not exist in your media archive.</p>
      <Link to="/library/books/archive">Return to Books</Link>
    </section>
  )
}
