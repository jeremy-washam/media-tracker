import { useMemo, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import {
  Disc3,
  ArrowUpDown,
  ExternalLink,
  Grid2X2,
  List,
  Music2,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import type { MusicCollectionItem } from '@media-tracker/contracts'
import { fetchMusic, fetchMusicDetail, fetchMusicHistory } from './music-api'
import { musicQuerySearch, normalizeMusicSearch, type MusicRouteSearch } from './music-route-search'

function date(value: string | null | undefined) {
  return value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
    : 'Date unknown'
}
function listened(value: number) {
  const hours = value / 3_600_000
  return hours < 1
    ? `${Math.round(value / 60_000)} min`
    : `${hours.toFixed(hours >= 10 ? 0 : 1)} hr`
}

export function MusicCollectionPage({ view }: { view: 'tracks' | 'albums' | 'artists' }) {
  const raw = useSearch({ strict: false }) as MusicRouteSearch
  const search = normalizeMusicSearch(raw, view)
  const navigate = useNavigate()
  const [draft, setDraft] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const layout = search.layout ?? (view === 'tracks' ? 'list' : 'grid')
  const update = (patch: Partial<MusicRouteSearch>) => {
    const next = { ...search, ...patch }
    for (const key of Object.keys(next) as (keyof MusicRouteSearch)[])
      if (next[key] === undefined || next[key] === '') delete next[key]
    void navigate({ to: `/library/music/${view}`, search: next })
  }
  const request = useMemo(() => ({ view, ...musicQuerySearch(search), limit: 50 }), [view, search])
  const result = useInfiniteQuery({
    queryKey: ['music', request],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      fetchMusic({ ...request, ...(pageParam ? { cursor: pageParam } : {}) }, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })
  const items = result.data?.pages.flatMap((page) => page.data) ?? []
  const summary = result.data?.pages[0]
  const sorts =
    view === 'tracks'
      ? [
          ['playedAt', 'Recently played'],
          ['playbackCount', 'Most playbacks'],
          ['observedTime', 'Observed time'],
          ['title', 'Track'],
          ['artist', 'Artist'],
          ['album', 'Album'],
        ]
      : view === 'albums'
        ? [
            ['playbackCount', 'Most playbacks'],
            ['playedAt', 'Recently played'],
            ['title', 'Album'],
            ['artist', 'Artist'],
            ['trackCount', 'Track count'],
            ['observedTime', 'Observed time'],
            ['releasedAt', 'Release date'],
          ]
        : [
            ['playbackCount', 'Most playbacks'],
            ['playedAt', 'Recently played'],
            ['title', 'Artist'],
            ['trackCount', 'Track count'],
            ['releaseCount', 'Release count'],
            ['observedTime', 'Observed time'],
          ]
  const selectedSort = search.sort ?? String(sorts[0]![0])
  const selectedDirection =
    search.direction ?? (['title', 'artist', 'album'].includes(selectedSort) ? 'asc' : 'desc')
  return (
    <section className={`books-page spotify-library-page music-page music-${layout}`}>
      <div className="books-collection">
        <header className="books-header">
          <div>
            <span className="eyebrow">Library</span>
            <h1>Music</h1>
          </div>
          <nav className="books-tabs" aria-label="Music sections">
            {(['tracks', 'albums', 'artists'] as const).map((target) => (
              <Link
                key={target}
                to={`/library/music/${target}`}
                search={normalizeMusicSearch(search, target)}
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
            <Search />
            <input
              aria-label="Search music"
              placeholder={`Search ${view}`}
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
                <X />
              </button>
            ) : null}
          </form>
          <label className="library-inline-filter">
            <span>Source</span>
            <select
              value={search.source ?? 'all'}
              onChange={(event) =>
                update({
                  source: event.target.value as MusicRouteSearch['source'],
                  item: undefined,
                })
              }
            >
              <option value="all">All history</option>
              <option value="export">Extended history</option>
              <option value="recent_api">Recent API</option>
            </select>
          </label>
          <label className="books-sort">
            <span className="sr-only">Sort music</span>
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
            aria-label="Reverse music sort"
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
          <button
            type="button"
            className="toolbar-button"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((value) => !value)}
          >
            <SlidersHorizontal aria-hidden="true" /> Filters
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
          <section className="filter-panel" aria-label="Music filters">
            <div className="filter-panel-heading">
              <strong>Filters</strong>
              <button
                type="button"
                onClick={() =>
                  update({
                    from: undefined,
                    to: undefined,
                    playbackCount: undefined,
                    metadata: undefined,
                    explicit: undefined,
                    albumType: undefined,
                    artist: undefined,
                    album: undefined,
                    item: undefined,
                  })
                }
              >
                Clear
              </button>
            </div>
            <div className="filter-panel-grid">
              <fieldset className="date-filter">
                <legend>Playback date</legend>
                <label>
                  From
                  <input
                    type="date"
                    value={search.from ?? ''}
                    onChange={(event) =>
                      update({ from: event.target.value || undefined, item: undefined })
                    }
                  />
                </label>
                <label>
                  To
                  <input
                    type="date"
                    value={search.to ?? ''}
                    onChange={(event) =>
                      update({ to: event.target.value || undefined, item: undefined })
                    }
                  />
                </label>
              </fieldset>
              <label className="library-inline-filter">
                <span>Playback observations</span>
                <select
                  value={search.playbackCount ?? 'any'}
                  onChange={(event) =>
                    update({
                      playbackCount: event.target.value as MusicRouteSearch['playbackCount'],
                      item: undefined,
                    })
                  }
                >
                  <option value="any">Any count</option>
                  <option value="once">1</option>
                  <option value="2to9">2–9</option>
                  <option value="10to49">10–49</option>
                  <option value="50plus">50+</option>
                </select>
              </label>
              <label className="library-inline-filter">
                <span>Metadata</span>
                <select
                  value={search.metadata ?? 'any'}
                  onChange={(event) =>
                    update({
                      metadata: event.target.value as MusicRouteSearch['metadata'],
                      item: undefined,
                    })
                  }
                >
                  <option value="any">Any state</option>
                  <option value="current">Current catalog data</option>
                  <option value="export_only">Export only</option>
                  <option value="unavailable">Unavailable</option>
                </select>
              </label>
              {view === 'tracks' ? (
                <label className="library-inline-filter">
                  <span>Explicit</span>
                  <select
                    value={search.explicit ?? 'any'}
                    onChange={(event) =>
                      update({
                        explicit: event.target.value as MusicRouteSearch['explicit'],
                        item: undefined,
                      })
                    }
                  >
                    <option value="any">Any</option>
                    <option value="yes">Explicit</option>
                    <option value="no">Not explicit</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </label>
              ) : null}
              {view === 'albums' ? (
                <label className="library-inline-filter">
                  <span>Album type</span>
                  <select
                    value={search.albumType ?? 'any'}
                    onChange={(event) =>
                      update({
                        albumType: event.target.value as MusicRouteSearch['albumType'],
                        item: undefined,
                      })
                    }
                  >
                    <option value="any">Any type</option>
                    <option value="album">Album</option>
                    <option value="single">Single</option>
                    <option value="compilation">Compilation</option>
                    <option value="other">Other</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </label>
              ) : null}
            </div>
          </section>
        ) : null}
        <div className="books-result-summary" aria-live="polite">
          <span>
            {result.isPending
              ? 'Loading music…'
              : `${(summary?.filteredCount ?? 0).toLocaleString()} ${view}`}
          </span>
        </div>
        {result.isError ? (
          <div className="books-state books-state-error" role="alert">
            <h2>Music could not be loaded</h2>
            <p>{result.error.message}</p>
          </div>
        ) : null}
        {!result.isPending && !result.isError && items.length === 0 ? (
          <div className="books-state">
            <Music2 />
            <h2>No {view} yet</h2>
            <p>Import Spotify Extended Streaming History or sync Spotify from Connections.</p>
          </div>
        ) : null}
        {items.length ? (
          <div className="spotify-result-grid">
            {items.map((item) => (
              <MusicItem
                key={`${item.kind}:${item.id}`}
                item={item}
                selected={search.item === item.id}
                onSelect={() => update({ item: item.id })}
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
        <MusicInspector id={search.item} view={view} onClose={() => update({ item: undefined })} />
      ) : null}
    </section>
  )
}

function MusicItem({
  item,
  selected,
  onSelect,
}: {
  item: MusicCollectionItem
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
          {item.kind === 'track' ? <Music2 /> : <Disc3 />}
        </span>
      )}
      <span className="spotify-result-copy">
        <strong>{item.title}</strong>
        <span>
          {item.subtitle ?? item.album ?? (item.kind === 'artist' ? 'Artist' : 'Metadata pending')}
        </span>
        <small>
          {item.playbackCount.toLocaleString()} playback{' '}
          {item.playbackCount === 1 ? 'observation' : 'observations'} ·{' '}
          {item.observedDurationKnown ? listened(item.observedMs) : 'time unavailable'}
          {item.observedDurationKnown && item.durationUnknownCount > 0
            ? ` · ${item.durationUnknownCount.toLocaleString()} without duration`
            : ''}
          {item.kind !== 'track' ? ` · ${item.trackCount} tracks` : ''}
        </small>
      </span>
    </button>
  )
}

function MusicInspector({
  id,
  view,
  onClose,
}: {
  id: string
  view: 'tracks' | 'albums' | 'artists'
  onClose: () => void
}) {
  const detail = useQuery({
    queryKey: ['music-detail', view, id],
    queryFn: ({ signal }) => fetchMusicDetail(id, view, signal),
  })
  const history = useInfiniteQuery({
    queryKey: ['music-history', id],
    enabled: view === 'tracks',
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => fetchMusicHistory(id, pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })
  return (
    <aside className="media-inspector" aria-label="Music inspector">
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
                <Music2 />
              </span>
            )}
            <div>
              <span className="eyebrow">{detail.data.kind}</span>
              <h2>{detail.data.title}</h2>
              <p>{detail.data.subtitle}</p>
            </div>
          </div>
          <section>
            <h3>Listening</h3>
            <dl>
              <div>
                <dt>Playback observations</dt>
                <dd>{detail.data.playbackCount.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Observed time</dt>
                <dd>
                  {detail.data.observedDurationKnown
                    ? listened(detail.data.observedMs)
                    : 'Unavailable'}
                  {detail.data.observedDurationKnown && detail.data.durationUnknownCount > 0
                    ? ` · ${detail.data.durationUnknownCount.toLocaleString()} without duration`
                    : ''}
                </dd>
              </div>
              <div>
                <dt>Latest activity</dt>
                <dd>{date(detail.data.latestPlayedAt)}</dd>
              </div>
            </dl>
            {detail.data.canonicalUrl ? (
              <a href={detail.data.canonicalUrl} target="_blank" rel="noreferrer">
                Open in Spotify <ExternalLink />
              </a>
            ) : null}
          </section>
          {view === 'tracks' ? (
            <section>
              <h3>History</h3>
              <ol className="history-list">
                {history.data?.pages
                  .flatMap((page) => page.data)
                  .map((entry, index) => (
                    <li key={`${entry.occurredAt}:${index}`}>
                      <strong>{date(entry.occurredAt)}</strong>
                      <span>
                        {entry.source === 'export' && entry.observedMs !== null
                          ? `${listened(entry.observedMs)} listened`
                          : 'Recent playback'}
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
