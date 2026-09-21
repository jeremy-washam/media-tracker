import { useMemo, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import {
  ExternalLink,
  ArrowUpDown,
  Grid2X2,
  Headphones,
  List,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import type { PodcastCollectionItem } from '@media-tracker/contracts'
import { fetchPodcast, fetchPodcastHistory, fetchPodcasts } from './podcasts-api'
import {
  normalizePodcastSearch,
  podcastQuerySearch,
  type PodcastsRouteSearch,
} from './podcasts-route-search'

function date(value: string | null | undefined) {
  return value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
    : 'Date unknown'
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
  const layout = search.layout ?? (view === 'following' ? 'grid' : 'list')
  const update = (patch: Partial<PodcastsRouteSearch>) => {
    const next = { ...search, ...patch }
    for (const key of Object.keys(next) as (keyof PodcastsRouteSearch)[])
      if (next[key] === undefined || next[key] === '') delete next[key]
    void navigate({ to: `/library/podcasts/${view}`, search: next })
  }
  const request = useMemo(
    () => ({ view, ...podcastQuerySearch(search), limit: 50 }),
    [view, search],
  )
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
  const selectedSort = search.sort ?? String(sorts[0]![0])
  const selectedDirection =
    search.direction ?? (['title', 'show', 'publisher'].includes(selectedSort) ? 'asc' : 'desc')
  return (
    <section className={`books-page spotify-library-page podcasts-page podcasts-${layout}`}>
      <div className="books-collection">
        <header className="books-header">
          <div>
            <span className="eyebrow">Library</span>
            <h1>Podcasts</h1>
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
            <select
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
            </select>
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
            <ArrowUpDown aria-hidden="true" />
            {selectedDirection === 'asc' ? 'Ascending' : 'Descending'}
          </button>
          <div className="layout-toggle" aria-label="Result layout">
            <button
              type="button"
              aria-label="Grid view"
              aria-pressed={layout === 'grid'}
              onClick={() => update({ layout: 'grid' })}
            >
              <Grid2X2 />
            </button>
            <button
              type="button"
              aria-label="List view"
              aria-pressed={layout === 'list'}
              onClick={() => update({ layout: 'list' })}
            >
              <List />
            </button>
          </div>
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
                </>
              ) : (
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
                onSelect={() => update({ item: item.id, kind: item.kind })}
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
      {search.item ? (
        <PodcastInspector
          id={search.item}
          kind={search.kind ?? (view === 'following' ? 'show' : 'episode')}
          onClose={() => update({ item: undefined, kind: undefined })}
        />
      ) : null}
    </section>
  )
}

function PodcastItem({
  item,
  selected,
  onSelect,
}: {
  item: PodcastCollectionItem
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={`spotify-result ${selected ? 'selected' : ''}`}
      onClick={onSelect}
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
}: {
  id: string
  kind: 'episode' | 'show'
  onClose: () => void
}) {
  const detail = useQuery({
    queryKey: ['podcast', kind, id],
    queryFn: ({ signal }) => fetchPodcast(id, kind, signal),
  })
  const history = useInfiniteQuery({
    queryKey: ['podcast-history', id],
    enabled: kind === 'episode',
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => fetchPodcastHistory(id, pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })
  return (
    <aside className="media-inspector" aria-label="Podcast inspector">
      <header>
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
                  {kind === 'show' ? detail.data.queueEpisodeCount : date(detail.data.publishedAt)}
                </dd>
              </div>
            </dl>
            {detail.data.canonicalUrl ? (
              <a href={detail.data.canonicalUrl} target="_blank" rel="noreferrer">
                Open in Spotify <ExternalLink />
              </a>
            ) : null}
          </section>
          {kind === 'episode' ? (
            <section>
              <h3>History</h3>
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
            </section>
          ) : null}
        </>
      ) : null}
    </aside>
  )
}
