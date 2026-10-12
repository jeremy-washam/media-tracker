import { LibrarySelect } from '../../components/library-controls'
import {
  useLiveSearch,
  useLibraryLayout,
  useInspectorPresence,
} from '../../components/library-hooks'
import { useRef, useState } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import {
  Disc3,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  Grid2X2,
  List,
  Music2,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import type { MusicCollectionItem } from '@media-tracker/contracts'
import {
  fetchMusic,
  fetchMusicDetail,
  fetchMusicFilterOptions,
  fetchMusicHistory,
} from './music-api'
import { useSpotifyInspectorFocus } from '../spotify-inspector-focus'
import { musicQuerySearch, normalizeMusicSearch, type MusicRouteSearch } from './music-route-search'

function date(value: string | null | undefined) {
  return value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
    : 'Date unknown'
}
function listened(value: number) {
  if (value < 60_000) {
    if (value > 0 && value < 1000) return '<1 sec'
    return `${Math.round(value / 1000)} sec`
  }
  const hours = value / 3_600_000
  return hours < 1
    ? `${Math.round(value / 60_000)} min`
    : `${hours.toFixed(hours >= 10 ? 0 : 1)} hr`
}

export function MusicCollectionPage({ view }: { view: 'tracks' | 'albums' | 'artists' }) {
  const queryClient = useQueryClient()
  const raw = useSearch({ strict: false }) as MusicRouteSearch
  const search = normalizeMusicSearch(raw, view)
  const navigate = useNavigate()
  const [draft, setDraft] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const selectedResultRef = useRef<HTMLButtonElement | null>(null)
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const [layout, saveLayout] = useLibraryLayout(search.layout, view !== 'tracks')
  const update = (patch: Partial<MusicRouteSearch>) => {
    if (patch.layout) saveLayout(patch.layout)
    const next = { ...search, ...patch }
    for (const key of Object.keys(next) as (keyof MusicRouteSearch)[])
      if (next[key] === undefined || next[key] === '') delete next[key]
    void navigate({ to: `/library/music/${view}`, search: next })
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
    update({ item: undefined })
    requestAnimationFrame(() => target?.focus())
  }
  const request = { view, ...musicQuerySearch(search), limit: 50 }
  const result = useInfiniteQuery({
    queryKey: ['music', request],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      fetchMusic({ ...request, ...(pageParam ? { cursor: pageParam } : {}) }, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })
  const items = result.data?.pages.flatMap((page) => page.data) ?? []
  const summary = result.data?.pages[0]
  const previousCounts = queryClient
    .getQueriesData<{
      pages: Array<{ sectionCounts: NonNullable<typeof summary>['sectionCounts'] }>
    }>({ queryKey: ['music'] })
    .flatMap(([, data]) => data?.pages ?? [])
    .at(-1)?.sectionCounts
  const sectionCounts = summary?.sectionCounts ?? previousCounts
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
  if (search.q) sorts.unshift(['relevance', 'Relevance'])
  const selectedSort = search.sort ?? String(sorts[0]![0])
  const selectedDirection =
    search.direction ??
    (['title', 'artist', 'album', 'relevance'].includes(selectedSort) ? 'asc' : 'desc')
  return (
    <section
      data-inspector-open={Boolean(search.item)}
      className={`books-page spotify-library-page music-page music-${layout}`}
    >
      <div className="books-collection">
        <header className="books-header">
          <div>
            <span className="eyebrow">Library</span>
            <h1 ref={headingRef} tabIndex={-1}>
              Music
            </h1>
          </div>
          <nav className="books-tabs" aria-label="Music sections">
            {(['tracks', 'albums', 'artists'] as const).map((target) => (
              <Link
                key={target}
                to={`/library/music/${target}`}
                search={normalizeMusicSearch(
                  target === view ? search : { ...search, item: undefined },
                  target,
                )}
                activeProps={{ className: 'active', 'aria-current': 'page' }}
              >
                {target[0]!.toUpperCase() + target.slice(1)}{' '}
                <span>{sectionCounts?.[target] ?? '—'}</span>
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
            <LibrarySelect
              aria-label="Sort music"
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
            aria-label={selectedDirection === 'asc' ? 'Sort descending' : 'Sort ascending'}
            title={selectedDirection === 'asc' ? 'Ascending' : 'Descending'}
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
          <button
            type="button"
            className="toolbar-button"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((value) => !value)}
          >
            <SlidersHorizontal aria-hidden="true" /> Filters
          </button>
          {view !== 'tracks' ? (
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
              {view !== 'artists' ? (
                <MusicFacetPicker
                  view={view}
                  facet="artist"
                  search={search}
                  selected={search.artist ?? []}
                  onChange={(value) =>
                    update({
                      artist: toggleValue(search.artist, value),
                      item: undefined,
                    })
                  }
                />
              ) : null}
              {view === 'tracks' ? (
                <MusicFacetPicker
                  view="tracks"
                  facet="album"
                  search={search}
                  selected={search.album ?? []}
                  onChange={(value) =>
                    update({
                      album: toggleValue(search.album, value),
                      item: undefined,
                    })
                  }
                />
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
        {summary?.coverage?.possibleRecentGap ? (
          <p className="library-coverage-note" role="status">
            Recent playback coverage may have a gap between Spotify polls. Imported history is
            retained.
          </p>
        ) : !summary?.coverage?.recentPollAt && !result.isPending ? (
          <p className="library-coverage-note">
            Recently Played has not completed a checkpointed poll; imported listening history
            remains available.
          </p>
        ) : null}
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
                onSelect={(element) => {
                  selectedResultRef.current = element
                  update({ item: search.item === item.id ? undefined : item.id })
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
        <MusicInspector
          id={inspectorItem}
          view={view}
          onClose={closeInspector}
          matchingItem={
            search.from || search.to || (search.source && search.source !== 'all')
              ? (items.find((item) => item.id === search.item) ?? null)
              : null
          }
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

function MusicFacetPicker({
  view,
  facet,
  search,
  selected,
  onChange,
}: {
  view: 'tracks' | 'albums'
  facet: 'artist' | 'album'
  search: MusicRouteSearch
  selected: string[]
  onChange: (value: string) => void
}) {
  const [optionQ, setOptionQ] = useState('')
  const request = { ...musicQuerySearch(search), view, facet, optionQ, optionLimit: 30 }
  const options = useInfiniteQuery({
    queryKey: ['music-filter-options', request],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      fetchMusicFilterOptions(
        { ...request, ...(pageParam ? { optionCursor: pageParam } : {}) },
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })
  const label = facet === 'artist' ? 'Artists' : 'Albums'
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

function MusicItem({
  item,
  selected,
  onSelect,
}: {
  item: MusicCollectionItem
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
          {item.observedDurationKnown ? (
            listened(item.observedMs)
          ) : (
            <span
              aria-label="Listening time unavailable from Spotify recent history"
              title="Spotify recent history does not include listening duration"
            >
              —
            </span>
          )}
          {item.observedDurationKnown && item.durationUnknownCount > 0
            ? ` · ${item.durationUnknownCount.toLocaleString()} without duration`
            : ''}
          {item.kind !== 'track'
            ? ` · ${item.trackCount} ${item.trackCount === 1 ? 'track' : 'tracks'}`
            : ''}
        </small>
      </span>
    </button>
  )
}

function MusicInspector({
  id,
  view,
  onClose,
  matchingItem,
}: {
  id: string
  view: 'tracks' | 'albums' | 'artists'
  onClose: () => void
  matchingItem: MusicCollectionItem | null
}) {
  const [tab, setTab] = useState<'details' | 'history'>('details')
  const inspectorRef = useSpotifyInspectorFocus(onClose, id)
  const detail = useQuery({
    queryKey: ['music-detail', view, id],
    queryFn: ({ signal }) => fetchMusicDetail(id, view, signal),
  })
  const history = useInfiniteQuery({
    queryKey: ['music-history', view, id],
    enabled: tab === 'history',
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => fetchMusicHistory(id, view, pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })
  return (
    <aside ref={inspectorRef} className="media-inspector" aria-label="Music inspector">
      <header className="spotify-inspector-topbar">
        <div className="inspector-tabs" role="tablist" aria-label="Music information">
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
            History{detail.data ? ` (${detail.data.playbackCount.toLocaleString()})` : ''}
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
                <Music2 />
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
              <dl>
                {matchingItem ? (
                  <>
                    <div>
                      <dt>Matching observations</dt>
                      <dd>{matchingItem.playbackCount.toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt>Matching observed time</dt>
                      <dd>
                        {matchingItem.observedDurationKnown
                          ? listened(matchingItem.observedMs)
                          : 'Unavailable'}
                      </dd>
                    </div>
                  </>
                ) : null}
                <div>
                  <dt>{matchingItem ? 'Lifetime observations' : 'Playback observations'}</dt>
                  <dd>{detail.data.playbackCount.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>{matchingItem ? 'Lifetime observed time' : 'Observed time'}</dt>
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
                <div>
                  <dt>First activity</dt>
                  <dd>{date(detail.data.firstPlayedAt)}</dd>
                </div>
                {detail.data.album ? (
                  <div>
                    <dt>Album</dt>
                    <dd>
                      {detail.data.albumId ? (
                        <Link to="/library/music/albums" search={{ item: detail.data.albumId }}>
                          {detail.data.album}
                        </Link>
                      ) : (
                        detail.data.album
                      )}
                    </dd>
                  </div>
                ) : null}
                {detail.data.albumType ? (
                  <div>
                    <dt>Album type</dt>
                    <dd>{detail.data.albumType}</dd>
                  </div>
                ) : null}
                {detail.data.releaseDate ? (
                  <div>
                    <dt>Released</dt>
                    <dd>{detail.data.releaseDate}</dd>
                  </div>
                ) : null}
                {detail.data.durationMs !== null ? (
                  <div>
                    <dt>Track length</dt>
                    <dd>{listened(detail.data.durationMs)}</dd>
                  </div>
                ) : null}
                {detail.data.isrc ? (
                  <div>
                    <dt>ISRC</dt>
                    <dd>{detail.data.isrc}</dd>
                  </div>
                ) : null}
              </dl>
              {detail.data.artists?.length ? (
                <div className="inspector-related-links">
                  {detail.data.artists.map((artist) => (
                    <Link key={artist.id} to="/library/music/artists" search={{ item: artist.id }}>
                      {artist.name}
                    </Link>
                  ))}
                </div>
              ) : null}
              {detail.data.relatedTracks?.length ? (
                <div className="inspector-related-list">
                  <h3>Heard tracks</h3>
                  {detail.data.relatedTracks.map((track) => (
                    <Link key={track.id} to="/library/music/tracks" search={{ item: track.id }}>
                      <span>{track.title}</span>
                      <small>
                        {track.playbackCount.toLocaleString()}{' '}
                        {track.playbackCount === 1 ? 'observation' : 'observations'}
                      </small>
                    </Link>
                  ))}
                </div>
              ) : null}
              {detail.data.relatedAlbums?.length ? (
                <div className="inspector-related-list">
                  <h3>Albums</h3>
                  {detail.data.relatedAlbums.map((album) => (
                    <Link key={album.id} to="/library/music/albums" search={{ item: album.id }}>
                      <span>{album.title}</span>
                      <small>
                        {album.playbackCount.toLocaleString()}{' '}
                        {album.playbackCount === 1 ? 'observation' : 'observations'}
                      </small>
                    </Link>
                  ))}
                </div>
              ) : null}
              {detail.data.canonicalUrl ? (
                <a href={detail.data.canonicalUrl} target="_blank" rel="noreferrer">
                  Open in Spotify <ExternalLink />
                </a>
              ) : null}
            </section>
          ) : (
            <section>
              <h3>History</h3>
              {history.isPending ? <p>Loading history…</p> : null}
              {history.isError ? <p role="alert">{history.error.message}</p> : null}
              {history.data?.pages[0]?.totalCount === 0 ? <p>No playback observations.</p> : null}
              <ol
                className={`history-list spotify-history-list ${view === 'tracks' ? '' : 'music-entity-history'}`}
              >
                {history.data?.pages
                  .flatMap((page) => page.data)
                  .map((entry, index) => (
                    <li key={`${entry.occurredAt}:${index}`}>
                      <strong>
                        {view === 'tracks' ? (
                          date(entry.occurredAt)
                        ) : (
                          <Link to="/library/music/tracks" search={{ item: entry.trackId }}>
                            {entry.trackTitle}
                          </Link>
                        )}
                      </strong>
                      <span>
                        {entry.source === 'export' && entry.observedMs !== null
                          ? `${view === 'tracks' ? '' : `${date(entry.occurredAt)} · `}${listened(entry.observedMs)} observed`
                          : `${view === 'tracks' ? '' : `${date(entry.occurredAt)} · `}Recent API`}
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
          )}
        </>
      ) : null}
    </aside>
  )
}
