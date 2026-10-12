import { LibrarySelect } from '../../components/library-controls'
import {
  useLiveSearch,
  useLibraryLayout,
  useInspectorPresence,
} from '../../components/library-hooks'
import { useRef, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import {
  ExternalLink,
  ArrowUp,
  ArrowDown,
  Grid2X2,
  Headphones,
  List,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import type { PodcastCollectionItem } from '@media-tracker/contracts'
import {
  fetchPodcast,
  fetchPodcastFilterOptions,
  fetchPodcastHistory,
  fetchPodcasts,
} from './podcasts-api'
import { useSpotifyInspectorFocus } from '../spotify-inspector-focus'
import {
  normalizePodcastSearch,
  podcastQuerySearch,
  type PodcastsRouteSearch,
} from './podcasts-route-search'

function date(value: string | null | undefined) {
  if (!value) return 'Date unknown'
  if (/^\d{4}$/.test(value)) return value
  if (/^\d{4}-\d{2}$/.test(value))
    return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short' }).format(
      new Date(`${value}-01T12:00:00`),
    )
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00` : value)
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(parsed)
}
function duration(value: number | null) {
  if (value === null) return null
  const minutes = Math.round(value / 60_000)
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`
}

export function PodcastsCollectionPage({ view }: { view: 'archive' | 'queue' | 'following' }) {
  const raw = useSearch({ strict: false }) as PodcastsRouteSearch
  const search = normalizePodcastSearch(raw, view)
  const navigate = useNavigate()
  const [draft, setDraft] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const selectedResultRef = useRef<HTMLButtonElement | null>(null)
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const [layout, saveLayout] = useLibraryLayout(search.layout, view === 'following')
  const update = (patch: Partial<PodcastsRouteSearch>) => {
    if (patch.layout) saveLayout(patch.layout)
    const next = { ...search, ...patch }
    for (const key of Object.keys(next) as (keyof PodcastsRouteSearch)[])
      if (next[key] === undefined || next[key] === '') delete next[key]
    void navigate({ to: `/library/podcasts/${view}`, search: next })
  }
  useLiveSearch(
    draft,
    search.q,
    (q) => update({ q, item: undefined }),
    () => setDraft(null),
  )
  const inspectorItem = useInspectorPresence(search.item)
  const closeInspector = () => {
    const target = selectedResultRef.current?.isConnected
      ? selectedResultRef.current
      : headingRef.current
    update({ item: undefined, kind: undefined })
    requestAnimationFrame(() => target?.focus())
  }
  const request = { view, ...podcastQuerySearch(search), limit: 50 }
  const result = useInfiniteQuery({
    queryKey: ['podcasts', request],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      fetchPodcasts({ ...request, ...(pageParam ? { cursor: pageParam } : {}) }, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })
  const items = result.data?.pages.flatMap((page) => page.data) ?? []
  const summary = result.data?.pages[0]
  const sorts =
    view === 'following'
      ? [
          ['savedAt', 'Recently followed'],
          ['title', 'Show'],
          ['publisher', 'Publisher'],
          ['episodeCount', 'Episode count'],
        ]
      : view === 'archive'
        ? [
            ['activityAt', 'Recent activity'],
            ['observedTime', 'Observed time'],
            ['publishedAt', 'Published date'],
            ['duration', 'Duration'],
            ['title', 'Episode'],
            ['show', 'Show'],
          ]
        : [
            ['savedAt', 'Recently saved'],
            ['publishedAt', 'Published date'],
            ['duration', 'Duration'],
            ['title', 'Episode'],
            ['show', 'Show'],
          ]
  if (search.q) sorts.unshift(['relevance', 'Relevance'])
  const selectedSort = search.sort ?? String(sorts[0]![0])
  const selectedDirection =
    search.direction ??
    (['title', 'show', 'publisher', 'relevance'].includes(selectedSort) ? 'asc' : 'desc')
  return (
    <section
      data-inspector-open={Boolean(search.item)}
      className={`books-page spotify-library-page podcasts-page podcasts-${layout}`}
    >
      <div className="books-collection">
        <header className="books-header">
          <div>
            <span className="eyebrow">Library</span>
            <h1 ref={headingRef} tabIndex={-1}>
              Podcasts
            </h1>
          </div>
          <nav className="books-tabs" aria-label="Podcast sections">
            {(['archive', 'queue', 'following'] as const).map((target) => (
              <Link
                key={target}
                to={`/library/podcasts/${target}`}
                search={normalizePodcastSearch(search, target)}
                activeProps={{ className: 'active', 'aria-current': 'page' }}
              >
                {target[0]!.toUpperCase() + target.slice(1)}{' '}
                <span>{summary?.sectionCounts[target] ?? '—'}</span>
              </Link>
            ))}
          </nav>
        </header>
        <div className="books-toolbar">
          <form
            className="books-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault()
              update({
                q: (draft ?? search.q ?? '').trim() || undefined,
                item: undefined,
                sort: undefined,
              })
              setDraft(null)
            }}
          >
            <Search aria-hidden="true" />
            <input
              aria-label="Search podcasts"
              placeholder={
                view === 'following' ? 'Search shows or publishers' : 'Search episodes or shows'
              }
              value={draft ?? search.q ?? ''}
              onChange={(event) => setDraft(event.target.value)}
            />
            {(draft ?? search.q) ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setDraft(null)
                  update({ q: undefined, item: undefined, sort: undefined })
                }}
              >
                <X aria-hidden="true" />
              </button>
            ) : null}
          </form>
          {view !== 'following' ? (
            <label className="library-inline-filter">
              <span>Show</span>
              <select
                value={search.following ?? 'all'}
                onChange={(event) =>
                  update({
                    following: event.target.value as PodcastsRouteSearch['following'],
                    item: undefined,
                  })
                }
              >
                <option value="all">All shows</option>
                <option value="following">Following</option>
                <option value="not_following">Not following</option>
              </select>
            </label>
          ) : null}
          <button
            type="button"
            className="toolbar-button"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((value) => !value)}
          >
            <SlidersHorizontal aria-hidden="true" /> Filters
          </button>
          <label className="books-sort">
            <span className="sr-only">Sort podcasts</span>
            <LibrarySelect
              aria-label="Sort podcasts"
              value={selectedSort}
              onChange={(event) =>
                update({ sort: event.target.value, direction: undefined, item: undefined })
              }
            >
              {sorts.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </LibrarySelect>
          </label>
          <button
            type="button"
            className="toolbar-button"
            aria-label="Reverse podcast sort"
            onClick={() =>
              update({
                direction: selectedDirection === 'asc' ? 'desc' : 'asc',
                item: undefined,
              })
            }
          >
            {selectedDirection === 'asc' ? (
              <ArrowUp aria-hidden="true" />
            ) : (
              <ArrowDown aria-hidden="true" />
            )}
          </button>
          {view === 'following' ? (
            <div className="layout-toggle" aria-label="Result layout">
              <button
                type="button"
                aria-label="List view"
                aria-pressed={layout === 'list'}
                onClick={() => update({ layout: 'list' })}
              >
                <List />
              </button>
              <button
                type="button"
                aria-label="Grid view"
                aria-pressed={layout === 'grid'}
                onClick={() => update({ layout: 'grid' })}
              >
                <Grid2X2 />
              </button>
            </div>
          ) : null}
        </div>
        {filtersOpen ? (
          <section className="filter-panel" aria-label="Podcast filters">
            <div className="filter-panel-heading">
              <strong>Filters</strong>
              <button
                type="button"
                onClick={() =>
                  update({
                    dateFrom: undefined,
                    dateTo: undefined,
                    dateUnknown: undefined,
                    publishedFrom: undefined,
                    publishedTo: undefined,
                    publishedUnknown: undefined,
                    duration: undefined,
                    libraryEpisodes: undefined,
                    following: undefined,
                    show: undefined,
                    publisher: undefined,
                    language: undefined,
                    item: undefined,
                  })
                }
              >
                Clear
              </button>
            </div>
            <div className="filter-panel-grid">
              <fieldset className="date-filter">
                <legend>{view === 'archive' ? 'Activity date' : 'Saved date'}</legend>
                <label>
                  From
                  <input
                    type="date"
                    value={search.dateFrom ?? ''}
                    onChange={(event) =>
                      update({ dateFrom: event.target.value || undefined, item: undefined })
                    }
                  />
                </label>
                <label>
                  To
                  <input
                    type="date"
                    value={search.dateTo ?? ''}
                    onChange={(event) =>
                      update({ dateTo: event.target.value || undefined, item: undefined })
                    }
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={search.dateUnknown ?? false}
                    onChange={(event) =>
                      update({ dateUnknown: event.target.checked || undefined, item: undefined })
                    }
                  />{' '}
                  Date unavailable
                </label>
              </fieldset>
              {view !== 'following' ? (
                <>
                  <fieldset className="date-filter">
                    <legend>Published</legend>
                    <label>
                      From
                      <input
                        type="date"
                        value={search.publishedFrom ?? ''}
                        onChange={(event) =>
                          update({
                            publishedFrom: event.target.value || undefined,
                            item: undefined,
                          })
                        }
                      />
                    </label>
                    <label>
                      To
                      <input
                        type="date"
                        value={search.publishedTo ?? ''}
                        onChange={(event) =>
                          update({ publishedTo: event.target.value || undefined, item: undefined })
                        }
                      />
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={search.publishedUnknown ?? false}
                        onChange={(event) =>
                          update({
                            publishedUnknown: event.target.checked || undefined,
                            item: undefined,
                          })
                        }
                      />{' '}
                      Date unavailable
                    </label>
                  </fieldset>
                  <label className="library-inline-filter">
                    <span>Duration</span>
                    <select
                      value={search.duration?.[0] ?? ''}
                      onChange={(event) =>
                        update({
                          duration: event.target.value
                            ? [
                                event.target.value as NonNullable<
                                  PodcastsRouteSearch['duration']
                                >[number],
                              ]
                            : undefined,
                          item: undefined,
                        })
                      }
                    >
                      <option value="">Any duration</option>
                      <option value="under30">Under 30 min</option>
                      <option value="30to59">30–59 min</option>
                      <option value="1to2hours">1–2 hr</option>
                      <option value="over2hours">Over 2 hr</option>
                      <option value="unknown">Duration unavailable</option>
                    </select>
                  </label>
                  <PodcastFacetPicker
                    view={view}
                    facet="show"
                    search={search}
                    selected={search.show ?? []}
                    onChange={(value) =>
                      update({ show: toggleValue(search.show, value), item: undefined })
                    }
                  />
                </>
              ) : (
                <>
                  <label className="library-inline-filter">
                    <span>Library episodes</span>
                    <select
                      value={search.libraryEpisodes?.[0] ?? ''}
                      onChange={(event) =>
                        update({
                          libraryEpisodes: event.target.value
                            ? [
                                event.target.value as NonNullable<
                                  PodcastsRouteSearch['libraryEpisodes']
                                >[number],
                              ]
                            : undefined,
                          item: undefined,
                        })
                      }
                    >
                      <option value="">Any</option>
                      <option value="archive">Has Archive episodes</option>
                      <option value="queue">Has Queue episodes</option>
                      <option value="none">No Library episodes</option>
                    </select>
                  </label>
                  <PodcastFacetPicker
                    view="following"
                    facet="publisher"
                    search={search}
                    selected={search.publisher ?? []}
                    onChange={(value) =>
                      update({ publisher: toggleValue(search.publisher, value), item: undefined })
                    }
                  />
                  <PodcastFacetPicker
                    view="following"
                    facet="language"
                    search={search}
                    selected={search.language ?? []}
                    onChange={(value) =>
                      update({ language: toggleValue(search.language, value), item: undefined })
                    }
                  />
                </>
              )}
            </div>
          </section>
        ) : null}
        <div className="books-result-summary" aria-live="polite">
          <span>
            {result.isPending
              ? 'Loading podcasts…'
              : `${(summary?.filteredCount ?? 0).toLocaleString()} ${view === 'following' ? 'shows' : 'episodes'}`}
          </span>
        </div>
        {!result.isPending &&
        summary?.coverage &&
        (view === 'following'
          ? !summary.coverage.savedShowsAt
          : !summary.coverage.savedEpisodesAt) ? (
          <p className="library-coverage-note">
            {view === 'following'
              ? 'Following has not completed a checkpointed Spotify show sync.'
              : 'Saved episodes have not completed a checkpointed Spotify sync; Queue may be incomplete.'}
          </p>
        ) : null}
        {result.isError ? (
          <div className="books-state books-state-error" role="alert">
            <h2>Podcasts could not be loaded</h2>
            <p>{result.error.message}</p>
          </div>
        ) : null}
        {!result.isPending && !result.isError && items.length === 0 ? (
          <div className="books-state">
            <Headphones />
            <h2>No {view === 'following' ? 'followed shows' : `episodes in ${view}`}</h2>
            <p>Sync Spotify from Connections to populate this section.</p>
          </div>
        ) : null}
        {items.length ? (
          <div className="spotify-result-grid">
            {items.map((item) => (
              <PodcastItem
                key={`${item.kind}:${item.id}`}
                item={item}
                selected={search.item === item.id}
                onSelect={(element) => {
                  selectedResultRef.current = element
                  update({ item: item.id, kind: item.kind })
                }}
              />
            ))}
          </div>
        ) : null}
        {result.hasNextPage ? (
          <button
            className="load-more"
            type="button"
            disabled={result.isFetchingNextPage}
            onClick={() => void result.fetchNextPage()}
          >
            {result.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        ) : null}
      </div>
      {inspectorItem ? (
        <PodcastInspector
          id={inspectorItem}
          kind={search.kind ?? (view === 'following' ? 'show' : 'episode')}
          onClose={closeInspector}
          onOpenShow={(id) => update({ item: id, kind: 'show' })}
        />
      ) : null}
    </section>
  )
}

function toggleValue(selected: string[] | undefined, value: string): string[] | undefined {
  const next = (selected ?? []).includes(value)
    ? (selected ?? []).filter((item) => item !== value)
    : [...(selected ?? []), value]
  return next.length ? next : undefined
}

function PodcastFacetPicker({
  view,
  facet,
  search,
  selected,
  onChange,
}: {
  view: 'archive' | 'queue' | 'following'
  facet: 'show' | 'publisher' | 'language'
  search: PodcastsRouteSearch
  selected: string[]
  onChange: (value: string) => void
}) {
  const [optionQ, setOptionQ] = useState('')
  const request = { ...podcastQuerySearch(search), view, facet, optionQ, optionLimit: 30 }
  const options = useInfiniteQuery({
    queryKey: ['podcast-filter-options', request],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      fetchPodcastFilterOptions(
        { ...request, ...(pageParam ? { optionCursor: pageParam } : {}) },
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })
  const label = facet === 'show' ? 'Shows' : facet === 'publisher' ? 'Publishers' : 'Languages'
  return (
    <fieldset className="library-facet-picker">
      <legend>
        {label}
        {selected.length ? ` (${selected.length} selected)` : ''}
      </legend>
      <input
        aria-label={`Search ${label.toLowerCase()} options`}
        type="search"
        placeholder={`Find ${facet}`}
        value={optionQ}
        onChange={(event) => setOptionQ(event.target.value)}
      />
      <div className="library-facet-options">
        {options.isPending ? <span>Loading options…</span> : null}
        {options.isError ? <span role="alert">Options unavailable</span> : null}
        {options.data?.pages
          .flatMap((page) => page.data)
          .map((option) => (
            <label key={option.value}>
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                onChange={() => onChange(option.value)}
              />
              <span>{option.label}</span>
              <small>{option.count.toLocaleString()}</small>
            </label>
          ))}
        {options.data?.pages[0]?.data.length === 0 ? <span>No matching options</span> : null}
      </div>
      {options.hasNextPage ? (
        <button
          type="button"
          disabled={options.isFetchingNextPage}
          onClick={() => void options.fetchNextPage()}
        >
          {options.isFetchingNextPage ? 'Loading…' : 'More options'}
        </button>
      ) : null}
    </fieldset>
  )
}

function PodcastItem({
  item,
  selected,
  onSelect,
}: {
  item: PodcastCollectionItem
  selected: boolean
  onSelect: (element: HTMLButtonElement) => void
}) {
  return (
    <button
      type="button"
      className={`spotify-result ${selected ? 'selected' : ''}`}
      onClick={(event) => onSelect(event.currentTarget)}
    >
      {item.imageUrl ? (
        <img src={item.imageUrl} alt="" loading="lazy" />
      ) : (
        <span className="spotify-art-fallback">
          <Headphones />
        </span>
      )}
      <span className="spotify-result-copy">
        <strong>{item.title}</strong>
        <span>
          {item.subtitle ?? (item.kind === 'show' ? 'Publisher unknown' : 'Show unknown')}
        </span>
        <small>
          {item.kind === 'show'
            ? `${item.archiveEpisodeCount} listened · ${item.queueEpisodeCount} queued`
            : [date(item.date), duration(item.durationMs)].filter(Boolean).join(' · ')}
        </small>
      </span>
    </button>
  )
}

function PodcastInspector({
  id,
  kind,
  onClose,
  onOpenShow,
}: {
  id: string
  kind: 'episode' | 'show'
  onClose: () => void
  onOpenShow: (id: string) => void
}) {
  const [tab, setTab] = useState<'details' | 'history'>('details')
  const inspectorRef = useSpotifyInspectorFocus(onClose, id)
  const detail = useQuery({
    queryKey: ['podcast', kind, id],
    queryFn: ({ signal }) => fetchPodcast(id, kind, signal),
  })
  const history = useInfiniteQuery({
    queryKey: ['podcast-history', id],
    enabled: kind === 'episode' && tab === 'history',
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => fetchPodcastHistory(id, pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })
  return (
    <aside ref={inspectorRef} className="media-inspector" aria-label="Podcast inspector">
      <header className="spotify-inspector-topbar">
        <div className="inspector-tabs" role="tablist" aria-label="Podcast information">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'details'}
            onClick={() => setTab('details')}
          >
            Details
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'history'}
            onClick={() => setTab('history')}
          >
            History{kind === 'episode' && detail.data ? ` (${detail.data.playbackCount})` : ''}
          </button>
        </div>
        <button type="button" onClick={onClose} aria-label="Close inspector">
          <X />
        </button>
      </header>
      {detail.isPending ? (
        <p>Loading…</p>
      ) : detail.isError ? (
        <p role="alert">{detail.error.message}</p>
      ) : detail.data ? (
        <>
          <div className="inspector-hero">
            {detail.data.imageUrl ? (
              <img src={detail.data.imageUrl} alt="" />
            ) : (
              <span className="spotify-art-fallback">
                <Headphones />
              </span>
            )}
            <div>
              <span className="eyebrow">{detail.data.kind}</span>
              <h2>{detail.data.title}</h2>
              <p>{detail.data.subtitle}</p>
            </div>
          </div>
          {tab === 'details' ? (
            <section>
              <h3>Details</h3>
              {detail.data.description ? <p>{detail.data.description}</p> : null}
              <dl>
                <div>
                  <dt>{kind === 'show' ? 'Episodes in Archive' : 'Observed time'}</dt>
                  <dd>
                    {kind === 'show'
                      ? detail.data.archiveEpisodeCount
                      : duration(detail.data.observedMs)}
                  </dd>
                </div>
                <div>
                  <dt>{kind === 'show' ? 'Episodes queued' : 'Published'}</dt>
                  <dd>
                    {kind === 'show'
                      ? detail.data.queueEpisodeCount
                      : date(detail.data.publishedAt)}
                  </dd>
                </div>
                {kind === 'episode' && detail.data.durationMs !== null ? (
                  <div>
                    <dt>Duration</dt>
                    <dd>{duration(detail.data.durationMs)}</dd>
                  </div>
                ) : null}
                {kind === 'show' && detail.data.totalEpisodes !== null ? (
                  <div>
                    <dt>Catalog episodes</dt>
                    <dd>{detail.data.totalEpisodes}</dd>
                  </div>
                ) : null}
              </dl>
              {kind === 'episode' && detail.data.showId ? (
                <button
                  type="button"
                  className="inspector-related-link"
                  onClick={() => onOpenShow(detail.data!.showId!)}
                >
                  Show details: {detail.data.subtitle ?? 'Show'}
                </button>
              ) : null}
              {kind === 'show' ? (
                <div className="inspector-related-links">
                  <Link to="/library/podcasts/archive" search={{ show: [id] }}>
                    Archive episodes
                  </Link>
                  <Link to="/library/podcasts/queue" search={{ show: [id] }}>
                    Queued episodes
                  </Link>
                </div>
              ) : null}
              {detail.data.canonicalUrl ? (
                <a href={detail.data.canonicalUrl} target="_blank" rel="noreferrer">
                  Open in Spotify <ExternalLink />
                </a>
              ) : null}
            </section>
          ) : kind === 'episode' ? (
            <section>
              <h3>History</h3>
              {history.isPending ? <p>Loading history…</p> : null}
              {history.isError ? <p role="alert">{history.error.message}</p> : null}
              {history.data?.pages[0]?.totalCount === 0 ? <p>No supported history.</p> : null}
              <ol className="history-list">
                {history.data?.pages
                  .flatMap((page) => page.data)
                  .map((entry, index) => (
                    <li key={`${entry.occurredAt}:${index}`}>
                      <strong>{date(entry.occurredAt)}</strong>
                      <span>
                        {entry.source === 'reader'
                          ? 'Reader Archive'
                          : entry.observedMs === null
                            ? 'Playback detected'
                            : `${duration(entry.observedMs)} observed`}
                      </span>
                    </li>
                  ))}
              </ol>
              {history.hasNextPage ? (
                <button
                  type="button"
                  className="load-more"
                  disabled={history.isFetchingNextPage}
                  onClick={() => void history.fetchNextPage()}
                >
                  {history.isFetchingNextPage ? 'Loading…' : 'Load more history'}
                </button>
              ) : null}
            </section>
          ) : (
            <section>
              <h3>Following</h3>
              <dl>
                <div>
                  <dt>Saved in Spotify</dt>
                  <dd>{date(detail.data.date)}</dd>
                </div>
                <div>
                  <dt>First observed</dt>
                  <dd>{date(detail.data.firstObservedAt)}</dd>
                </div>
                <div>
                  <dt>Last observed</dt>
                  <dd>{date(detail.data.lastObservedAt)}</dd>
                </div>
                <div>
                  <dt>Current state</dt>
                  <dd>{detail.data.following ? 'Following' : 'Not following'}</dd>
                </div>
              </dl>
            </section>
          )}
        </>
      ) : null}
    </aside>
  )
}
