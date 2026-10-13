import {
  CollectionTabList,
  FlatTabs,
  FlatTabsContent,
  FlatTabsList,
  FlatTabsTrigger,
} from '@/components/flat-tabs'
import { LibrarySelect } from '../../components/library-controls'
import {
  useLiveSearch,
  useLibraryLayout,
  useInspectorPresence,
  useLibrarySectionCounts,
} from '../../components/library-hooks'
import { useMemo, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import {
  ArrowUp,
  ArrowDown,
  ExternalLink,
  Grid2X2,
  List,
  PlaySquare,
  Search,
  SlidersHorizontal,
  UserRound,
  X,
} from 'lucide-react'
import type { VideoCollectionItem, VideosResponse } from '@media-tracker/contracts'
import {
  fetchChannelVideos,
  fetchVideo,
  fetchVideoChannel,
  fetchVideoHistory,
  fetchVideos,
} from './videos-api'
import {
  normalizeVideoSearch,
  videoQuerySearch,
  type VideosRouteSearch,
} from './videos-route-search'

type View = 'archive' | 'queue' | 'channels'

function date(value: string | null | undefined) {
  return value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
    : 'Date unknown'
}

function duration(value: number | null) {
  if (value === null) return 'Duration unavailable'
  if (value > 0 && value < 60_000) return '<1 min'
  const minutes = Math.round(value / 60_000)
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes} min`
}

function countLabel(value: number, singular: string) {
  const plural = singular.endsWith('watch')
    ? `${singular.slice(0, -'watch'.length)}watches`
    : `${singular}s`
  return `${value.toLocaleString()} ${value === 1 ? singular : plural}`
}

export function VideosCollectionPage({ view }: { view: View }) {
  const raw = useSearch({ strict: false }) as VideosRouteSearch
  const search = normalizeVideoSearch(raw, view)
  const navigate = useNavigate()
  const [draft, setDraft] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [layout, saveLayout] = useLibraryLayout(search.layout, view !== 'channels')
  const update = (patch: Partial<VideosRouteSearch>) => {
    if (patch.layout) saveLayout(patch.layout)
    const next = normalizeVideoSearch({ ...search, ...patch }, view)
    for (const key of Object.keys(next) as (keyof VideosRouteSearch)[])
      if (next[key] === undefined || next[key] === '') delete next[key]
    void navigate({ to: `/library/videos/${view}`, search: next })
  }
  useLiveSearch(
    draft,
    search.q,
    (q) => update({ q, item: undefined, channelItem: undefined }),
    () => setDraft(null),
  )
  const inspectorItem = useInspectorPresence(search.item)
  const channelInspectorItem = useInspectorPresence(search.channelItem)
  const request = useMemo(() => ({ view, ...videoQuerySearch(search), limit: 50 }), [view, search])
  const result = useInfiniteQuery({
    queryKey: ['videos', request],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      fetchVideos({ ...request, ...(pageParam ? { cursor: pageParam } : {}) }, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })
  const items = result.data?.pages.flatMap((page) => page.data) ?? []
  const summary = result.data?.pages[0]
  const sectionCounts = useLibrarySectionCounts('videos', summary, (page) => page.sectionCounts)
  const sorts =
    view === 'archive'
      ? [
          ['watchedAt', 'Recently watched'],
          ['watchCount', 'Most watched'],
          ['title', 'Title'],
          ['channel', 'Channel'],
          ['publishedAt', 'Published'],
          ['duration', 'Duration'],
        ]
      : view === 'queue'
        ? [
            ['addedAt', 'Recently added'],
            ['title', 'Title'],
            ['channel', 'Channel'],
            ['publishedAt', 'Published'],
            ['duration', 'Duration'],
          ]
        : [
            ['watchCount', 'Most viewed'],
            ['channel', 'Channel A–Z'],
            ['watchedAt', 'Recently watched'],
            ['queueCount', 'Most queued'],
          ]
  if (search.q) sorts.push(['relevance', 'Relevance'])
  const selectedSort = search.sort ?? String(sorts[0]![0])
  const selectedDirection =
    search.direction ?? (['title', 'channel', 'relevance'].includes(selectedSort) ? 'asc' : 'desc')

  return (
    <FlatTabs
      value={view}
      render={<section />}
      data-inspector-open={Boolean(search.item || search.channelItem)}
      className={`books-page videos-page videos-${layout}`}
    >
      <FlatTabsContent value={view} className="books-collection">
        <h1 className="sr-only">Videos</h1>
        <CollectionTabList aria-label="Video sections">
          {(['archive', 'queue', 'channels'] as const).map((target) => (
            <Link
              key={target}
              to={`/library/videos/${target}`}
              search={normalizeVideoSearch(search, target)}
              activeProps={{ className: 'active', 'aria-current': 'page' }}
            >
              {target[0]!.toUpperCase() + target.slice(1)}{' '}
              <span>{sectionCounts?.[target] ?? '—'}</span>
            </Link>
          ))}
        </CollectionTabList>

        <div className="books-toolbar">
          <form
            className="books-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault()
              update({
                q: (draft ?? search.q ?? '').trim() || undefined,
                item: undefined,
                channelItem: undefined,
                sort: undefined,
              })
              setDraft(null)
            }}
          >
            <Search />
            <input
              aria-label="Search videos"
              placeholder={view === 'channels' ? 'Search channels' : 'Search videos or channels'}
              value={draft ?? search.q ?? ''}
              onChange={(event) => setDraft(event.target.value)}
            />
            {(draft ?? search.q) ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setDraft(null)
                  update({ q: undefined, item: undefined, channelItem: undefined, sort: undefined })
                }}
              >
                <X />
              </button>
            ) : null}
          </form>
          <label className="books-sort">
            <span className="sr-only">Sort videos</span>
            <LibrarySelect
              aria-label="Sort videos"
              value={selectedSort}
              onChange={(event) =>
                update({
                  sort: event.target.value,
                  direction: undefined,
                  item: undefined,
                  channelItem: undefined,
                })
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
            onClick={() =>
              update({
                direction: selectedDirection === 'asc' ? 'desc' : 'asc',
                item: undefined,
                channelItem: undefined,
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
          {view !== 'channels' ? (
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
          <VideoFilters view={view} search={search} summary={summary} update={update} />
        ) : null}

        <div className="books-result-summary" aria-live="polite">
          <span>
            {result.isPending
              ? null
              : `${(summary?.filteredCount ?? 0).toLocaleString()} ${view === 'channels' ? 'channels' : 'videos'}`}
          </span>
          {view === 'archive' && summary ? (
            <small>{countLabel(summary.occurrenceCount, 'supported watch')}</small>
          ) : null}
        </div>
        {result.isPending ? (
          <div className="books-state books-loading" role="status">
            Loading videos…
          </div>
        ) : null}
        {summary && summary.coverage.watchLater !== 'complete' ? (
          <p className="library-coverage-note">
            Takeout coverage: Watch Later {summary.coverage.watchLater}.
          </p>
        ) : null}
        {result.isError ? (
          <div className="books-state books-state-error" role="alert">
            <h2>Videos could not be loaded</h2>
            <p>{result.error.message}</p>
          </div>
        ) : null}
        {!result.isPending && !result.isError && items.length === 0 ? (
          <div className="books-state">
            <PlaySquare />
            <h2>No {view} yet</h2>
            <p>Import YouTube Takeout from Connections.</p>
          </div>
        ) : null}
        {items.length ? (
          <div className={view === 'channels' ? 'video-channel-list' : 'video-result-grid'}>
            {items.map((item) => (
              <VideoItem
                key={`${item.kind}:${item.id}`}
                item={item}
                view={view}
                selected={
                  view === 'channels' ? search.channelItem === item.id : search.item === item.id
                }
                onSelect={() =>
                  update(
                    view === 'channels'
                      ? { channelItem: search.channelItem === item.id ? undefined : item.id }
                      : { item: search.item === item.id ? undefined : item.id },
                  )
                }
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
      </FlatTabsContent>
      {inspectorItem ? (
        <VideoInspector id={inspectorItem} onClose={() => update({ item: undefined })} />
      ) : null}
      {channelInspectorItem ? (
        <ChannelInspector
          id={channelInspectorItem}
          onClose={() => update({ channelItem: undefined })}
        />
      ) : null}
    </FlatTabs>
  )
}

function VideoChannelPicker({
  search,
  summary,
  update,
}: {
  search: VideosRouteSearch
  summary: VideosResponse | undefined
  update: (patch: Partial<VideosRouteSearch>) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [query, setQuery] = useState<string | undefined>(undefined)
  useLiveSearch(draft, query, setQuery, () => setDraft(null))
  const channels = useInfiniteQuery({
    queryKey: ['video-channel-options', query],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      fetchVideos(
        {
          view: 'channels',
          sort: query ? 'relevance' : 'channel',
          direction: 'asc',
          limit: 50,
          ...(query ? { q: query } : {}),
          ...(pageParam ? { cursor: pageParam } : {}),
        },
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })
  const options = channels.data?.pages.flatMap((page) => page.data) ?? []
  const selected = search.channel?.[0] ?? ''
  const selectedFacet = summary?.facets.channels.find((option) => option.value === selected)
  return (
    <fieldset className="filter-group video-channel-picker">
      <legend>Channel</legend>
      <input
        type="search"
        aria-label="Search channel options"
        placeholder="Search all channels"
        value={draft ?? query ?? ''}
        onChange={(event) => setDraft(event.target.value)}
      />
      <select
        aria-label="Channel"
        value={selected}
        onChange={(event) =>
          update({
            channel: event.target.value ? [event.target.value] : undefined,
            item: undefined,
          })
        }
      >
        <option value="">All channels</option>
        {selected && !options.some((item) => item.id === selected) ? (
          <option value={selected}>
            {selectedFacet?.label ??
              (selected === '__unknown__' ? 'Channel unavailable' : selected)}
          </option>
        ) : null}
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {item.title}
          </option>
        ))}
        {selected !== '__unknown__' &&
        summary?.facets.channels.some((item) => item.value === '__unknown__') ? (
          <option value="__unknown__">Channel unavailable</option>
        ) : null}
      </select>
      {channels.isPending ? <small>Loading channels…</small> : null}
      {channels.isError ? <p role="alert">{channels.error.message}</p> : null}
      {channels.isSuccess && options.length === 0 ? <small>No matching channels.</small> : null}
      {channels.hasNextPage ? (
        <button
          type="button"
          className="facet-load-more"
          disabled={channels.isFetchingNextPage}
          onClick={() => void channels.fetchNextPage()}
        >
          {channels.isFetchingNextPage ? 'Loading…' : 'Load more channels'}
        </button>
      ) : null}
    </fieldset>
  )
}

function VideoFilters({
  view,
  search,
  summary,
  update,
}: {
  view: View
  search: VideosRouteSearch
  summary: VideosResponse | undefined
  update: (patch: Partial<VideosRouteSearch>) => void
}) {
  if (view === 'channels') {
    return null
  }
  return (
    <section className="filter-panel" aria-label="Video filters">
      <div className="filter-panel-heading">
        <strong>Filters</strong>
        <button
          type="button"
          onClick={() =>
            update({
              account: undefined,
              channel: undefined,
              watchedFrom: undefined,
              watchedTo: undefined,
              watchedUnknown: undefined,
              addedFrom: undefined,
              addedTo: undefined,
              addedUnknown: undefined,
              published: undefined,
              publishedFrom: undefined,
              publishedTo: undefined,
              duration: undefined,
              durationUnknown: undefined,
              watchCount: undefined,
              overlap: undefined,
              format: undefined,
              availability: undefined,
              category: undefined,
              item: undefined,
            })
          }
        >
          Clear
        </button>
      </div>
      <div className="filter-panel-grid">
        <fieldset className="date-filter">
          <legend>{view === 'archive' ? 'Watched date' : 'Added to Watch Later'}</legend>
          <label>
            From
            <input
              type="date"
              value={(view === 'archive' ? search.watchedFrom : search.addedFrom) ?? ''}
              onChange={(event) =>
                update(
                  view === 'archive'
                    ? { watchedFrom: event.target.value || undefined, item: undefined }
                    : { addedFrom: event.target.value || undefined, item: undefined },
                )
              }
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={(view === 'archive' ? search.watchedTo : search.addedTo) ?? ''}
              onChange={(event) =>
                update(
                  view === 'archive'
                    ? { watchedTo: event.target.value || undefined, item: undefined }
                    : { addedTo: event.target.value || undefined, item: undefined },
                )
              }
            />
          </label>
          <label className="unknown-toggle">
            <input
              type="checkbox"
              checked={
                view === 'archive'
                  ? (search.watchedUnknown ?? false)
                  : (search.addedUnknown ?? false)
              }
              onChange={(event) =>
                update(
                  view === 'archive'
                    ? { watchedUnknown: event.target.checked || undefined, item: undefined }
                    : { addedUnknown: event.target.checked || undefined, item: undefined },
                )
              }
            />
            Include unknown dates
          </label>
        </fieldset>
        <fieldset className="date-filter">
          <legend>Published</legend>
          <label>
            From
            <input
              type="date"
              disabled={search.published === 'unknown'}
              value={search.publishedFrom ?? ''}
              onChange={(event) =>
                update({
                  published: event.target.value || search.publishedTo ? 'range' : undefined,
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
              disabled={search.published === 'unknown'}
              value={search.publishedTo ?? ''}
              onChange={(event) =>
                update({
                  published: event.target.value || search.publishedFrom ? 'range' : undefined,
                  publishedTo: event.target.value || undefined,
                  item: undefined,
                })
              }
            />
          </label>
          <label className="unknown-toggle">
            <input
              type="checkbox"
              checked={search.published === 'unknown'}
              onChange={(event) =>
                update({
                  published: event.target.checked ? 'unknown' : undefined,
                  publishedFrom: undefined,
                  publishedTo: undefined,
                  item: undefined,
                })
              }
            />
            Unknown date only
          </label>
        </fieldset>
        <label className="library-inline-filter">
          <span>Account</span>
          <select
            value={search.account?.[0] ?? ''}
            onChange={(event) =>
              update({
                account: event.target.value ? [event.target.value] : undefined,
                item: undefined,
              })
            }
          >
            <option value="">All accounts</option>
            {summary?.facets.accounts.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({option.count})
              </option>
            ))}
          </select>
        </label>
        <VideoChannelPicker search={search} summary={summary} update={update} />
        {view === 'archive' ? (
          <label className="library-inline-filter">
            <span>Watches</span>
            <select
              value={search.watchCount ?? 'all'}
              onChange={(event) =>
                update({
                  watchCount: event.target.value as VideosRouteSearch['watchCount'],
                  item: undefined,
                })
              }
            >
              <option value="all">Any count</option>
              <option value="once">Watched once</option>
              <option value="rewatched">Rewatched</option>
            </select>
          </label>
        ) : null}
        <label className="library-inline-filter">
          <span>{view === 'archive' ? 'Queue status' : 'Archive status'}</span>
          <select
            value={search.overlap ?? 'all'}
            onChange={(event) =>
              update({
                overlap: event.target.value as VideosRouteSearch['overlap'],
                item: undefined,
              })
            }
          >
            <option value="all">Any</option>
            <option value="overlap">Also {view === 'archive' ? 'queued' : 'watched'}</option>
            <option value="not_overlap">Not {view === 'archive' ? 'queued' : 'watched'}</option>
          </select>
        </label>
        <label className="library-inline-filter">
          <span>Duration</span>
          <select
            value={search.duration ?? ''}
            onChange={(event) =>
              update({
                duration: (event.target.value || undefined) as VideosRouteSearch['duration'],
                item: undefined,
              })
            }
          >
            <option value="">Any duration</option>
            <option value="under5">Under 5 minutes</option>
            <option value="5to19">5–19 minutes</option>
            <option value="20to59">20–59 minutes</option>
            <option value="60plus">60+ minutes</option>
          </select>
          <span className="unknown-toggle">
            <input
              type="checkbox"
              checked={search.durationUnknown ?? false}
              onChange={(event) =>
                update({ durationUnknown: event.target.checked || undefined, item: undefined })
              }
            />
            Include unknown
          </span>
        </label>
        <label className="library-inline-filter">
          <span>Availability</span>
          <select
            value={search.availability ?? ''}
            onChange={(event) =>
              update({
                availability: (event.target.value ||
                  undefined) as VideosRouteSearch['availability'],
                item: undefined,
              })
            }
          >
            <option value="">Any state</option>
            <option value="available">Available</option>
            <option value="unavailable">Unavailable</option>
            <option value="unchecked">Unchecked</option>
          </select>
        </label>
        <label className="library-inline-filter">
          <span>Format</span>
          <select
            value={search.format?.[0] ?? ''}
            onChange={(event) =>
              update({
                format: event.target.value
                  ? [event.target.value as NonNullable<VideosRouteSearch['format']>[number]]
                  : undefined,
                item: undefined,
              })
            }
          >
            <option value="">All formats</option>
            <option value="live">Live</option>
            <option value="upcoming">Upcoming</option>
            <option value="recorded_live">Recorded live</option>
            <option value="youtube_music">YouTube Music</option>
          </select>
        </label>
        {summary?.facets.categories.length ? (
          <label className="library-inline-filter">
            <span>Category</span>
            <select
              value={search.category?.[0] ?? ''}
              onChange={(event) =>
                update({
                  category: event.target.value ? [event.target.value] : undefined,
                  item: undefined,
                })
              }
            >
              <option value="">All categories</option>
              {summary.facets.categories.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} ({option.count})
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </section>
  )
}

function VideoItem({
  item,
  view,
  selected,
  onSelect,
}: {
  item: VideoCollectionItem
  view: View
  selected: boolean
  onSelect: () => void
}) {
  if (item.kind === 'channel') {
    return (
      <button
        type="button"
        className={`video-channel-row ${selected ? 'selected' : ''}`}
        onClick={onSelect}
      >
        <span className="video-channel-avatar">
          {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : <UserRound />}
        </span>
        <span className="video-result-copy">
          <strong>{item.title}</strong>
          <small>
            {countLabel(item.archiveVideoCount, 'archived video')} ·{' '}
            {countLabel(item.watchCount, 'watch')} ·{' '}
            {countLabel(item.queueVideoCount, 'queued video')}
          </small>
        </span>
        <span className="video-result-date">
          {item.date ? `Latest watch ${date(item.date)}` : 'No supported watches'}
        </span>
      </button>
    )
  }
  return (
    <button
      type="button"
      className={`video-result ${selected ? 'selected' : ''}`}
      onClick={onSelect}
    >
      <span className="video-thumbnail">
        {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : <PlaySquare />}
      </span>
      <span className="video-result-copy">
        <strong>{item.title}</strong>
        <span>{item.channelTitle ?? 'Channel unavailable'}</span>
        <small>
          {view === 'archive'
            ? `Watched ${date(item.date)} · ${item.matchingWatchCount === item.watchCount ? countLabel(item.watchCount, 'watch') : `${item.matchingWatchCount.toLocaleString()} of ${countLabel(item.watchCount, 'watch')}`}${item.inQueue ? ' · In Queue' : ''}`
            : `Added ${date(item.date)} · ${countLabel(item.matchingQueueAccountCount, 'account')}${item.inArchive ? ` · ${countLabel(item.watchCount, 'watch')}` : ''}`}
        </small>
        {item.durationMs !== null || item.publishedAt !== null ? (
          <small className="video-list-extra">
            {duration(item.durationMs)} ·{' '}
            {item.publishedAt ? `Published ${date(item.publishedAt)}` : 'Publish date unavailable'}
          </small>
        ) : null}
      </span>
    </button>
  )
}

function VideoInspector({ id, onClose }: { id: string; onClose: () => void }) {
  const [tab, setTab] = useState<'details' | 'history' | 'channel'>('details')
  const detail = useQuery({
    queryKey: ['video-detail', id],
    queryFn: ({ signal }) => fetchVideo(id, signal),
  })
  const history = useInfiniteQuery({
    queryKey: ['video-history', id],
    enabled: tab === 'history',
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => fetchVideoHistory(id, pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })
  const channel = useQuery({
    queryKey: ['video-channel-from-video', detail.data?.channelId],
    enabled: tab === 'channel' && Boolean(detail.data?.channelId),
    queryFn: ({ signal }) => fetchVideoChannel(detail.data!.channelId!, signal),
  })
  const channelArchive = useQuery({
    queryKey: ['video-channel-preview', detail.data?.channelId, 'archive'],
    enabled: tab === 'channel' && Boolean(detail.data?.channelId),
    queryFn: ({ signal }) =>
      fetchChannelVideos(detail.data!.channelId!, 'archive', undefined, signal),
  })
  const channelQueue = useQuery({
    queryKey: ['video-channel-preview', detail.data?.channelId, 'queue'],
    enabled: tab === 'channel' && Boolean(detail.data?.channelId),
    queryFn: ({ signal }) =>
      fetchChannelVideos(detail.data!.channelId!, 'queue', undefined, signal),
  })
  return (
    <aside className="media-inspector" aria-label="Video inspector">
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
          <div className="inspector-hero video-inspector-hero">
            <span className="video-thumbnail">
              {detail.data.imageUrl ? <img src={detail.data.imageUrl} alt="" /> : <PlaySquare />}
            </span>
            <div>
              <span className="eyebrow">Video</span>
              <h2>{detail.data.title}</h2>
              <p>{detail.data.channelTitle ?? 'Channel unavailable'}</p>
            </div>
          </div>
          <FlatTabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
            <FlatTabsList aria-label="Video details">
              <FlatTabsTrigger value="details">Details</FlatTabsTrigger>
              <FlatTabsTrigger value="history">Watch history</FlatTabsTrigger>
              <FlatTabsTrigger value="channel">Channel</FlatTabsTrigger>
            </FlatTabsList>
            <FlatTabsContent value="details" className="inspector-tab-panel">
              <section>
                <h3>Activity</h3>
                <dl>
                  <div>
                    <dt>Latest watch</dt>
                    <dd>
                      {detail.data.inArchive ? date(detail.data.date) : 'No supported watches'}
                    </dd>
                  </div>
                  <div>
                    <dt>Supported watches</dt>
                    <dd>{detail.data.watchCount.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Watch Later</dt>
                    <dd>
                      {detail.data.inQueue
                        ? `${detail.data.queueAccountCount} account${detail.data.queueAccountCount === 1 ? '' : 's'}`
                        : 'Not in Queue'}
                    </dd>
                  </div>
                  <div>
                    <dt>Format</dt>
                    <dd>
                      {detail.data.formats.length
                        ? detail.data.formats.map((value) => value.replaceAll('_', ' ')).join(', ')
                        : 'Unknown'}
                    </dd>
                  </div>
                  <div>
                    <dt>Published</dt>
                    <dd>{date(detail.data.publishedAt)}</dd>
                  </div>
                  <div>
                    <dt>Category</dt>
                    <dd>{detail.data.categoryTitle ?? 'Unknown'}</dd>
                  </div>
                  <div>
                    <dt>Captions</dt>
                    <dd>
                      {detail.data.captionAvailable === null
                        ? 'Unknown'
                        : detail.data.captionAvailable
                          ? 'Available'
                          : 'Not reported'}
                    </dd>
                  </div>
                </dl>
                {detail.data.description ? <p>{detail.data.description}</p> : null}
                {detail.data.metadataMessage ? <p>{detail.data.metadataMessage}</p> : null}
                {detail.data.queueRelationships.length ? (
                  <div>
                    <h3>Watch Later</h3>
                    <ul className="history-list">
                      {detail.data.queueRelationships.map((relationship) => (
                        <li
                          key={`${relationship.connectionLabel}:${relationship.addedAt ?? 'unknown'}`}
                        >
                          <strong>{relationship.connectionLabel}</strong>
                          <span>Added {date(relationship.addedAt)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <a href={detail.data.canonicalUrl} target="_blank" rel="noreferrer">
                  Open on YouTube <ExternalLink />
                </a>
              </section>
            </FlatTabsContent>
            <FlatTabsContent value="history" className="inspector-tab-panel">
              <section>
                <h3>Watch history</h3>
                <ol className="history-list">
                  {history.data?.pages
                    .flatMap((page) => page.data)
                    .map((entry) => (
                      <li key={entry.id}>
                        <strong>{date(entry.occurredAt)}</strong>
                        <span>
                          {entry.connectionLabel}
                          {entry.product === 'youtube_music' ? ' · YouTube Music' : ''}
                        </span>
                      </li>
                    ))}
                </ol>
                {history.hasNextPage ? (
                  <button
                    className="load-more"
                    type="button"
                    onClick={() => void history.fetchNextPage()}
                  >
                    Load more history
                  </button>
                ) : null}
              </section>
            </FlatTabsContent>
            <FlatTabsContent value="channel" className="inspector-tab-panel">
              <section>
                <h3>Channel</h3>
                {detail.data.channelId === null ? (
                  <p>This Takeout record did not provide an exact channel identity.</p>
                ) : channel.isPending ? (
                  <p>Loading…</p>
                ) : channel.data ? (
                  <>
                    <p>{channel.data.title}</p>
                    <p>
                      {countLabel(channel.data.archiveVideoCount, 'archived video')} ·{' '}
                      {countLabel(channel.data.watchCount, 'watch')}
                    </p>
                    <ChannelPreview
                      title="Recently watched"
                      items={channelArchive.data?.data.slice(0, 5) ?? []}
                      pending={channelArchive.isPending}
                    />
                    <ChannelPreview
                      title="Recently queued"
                      items={channelQueue.data?.data.slice(0, 5) ?? []}
                      pending={channelQueue.isPending}
                    />
                    <a href={channel.data.canonicalUrl} target="_blank" rel="noreferrer">
                      Open channel <ExternalLink />
                    </a>
                  </>
                ) : (
                  <p>Channel details are unavailable.</p>
                )}
              </section>
            </FlatTabsContent>
          </FlatTabs>
        </>
      ) : null}
    </aside>
  )
}

function ChannelPreview({
  title,
  items,
  pending,
}: {
  title: string
  items: VideoCollectionItem[]
  pending: boolean
}) {
  return (
    <div>
      <h3>{title}</h3>
      {pending ? (
        <p>Loading…</p>
      ) : items.length ? (
        <ol className="history-list">
          {items.map((item) => (
            <li key={item.id}>
              <strong>{item.title}</strong>
              <span>{date(item.date)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p>None in this channel.</p>
      )}
    </div>
  )
}

function ChannelInspector({ id, onClose }: { id: string; onClose: () => void }) {
  const [tab, setTab] = useState<'details' | 'library'>('details')
  const [membership, setMembership] = useState<'archive' | 'queue'>('archive')
  const detail = useQuery({
    queryKey: ['video-channel-detail', id],
    queryFn: ({ signal }) => fetchVideoChannel(id, signal),
  })
  const library = useInfiniteQuery({
    queryKey: ['video-channel-library', id, membership],
    enabled: tab === 'library',
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => fetchChannelVideos(id, membership, pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })
  return (
    <aside className="media-inspector" aria-label="Channel inspector">
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
            <span className="video-channel-avatar">
              {detail.data.imageUrl ? <img src={detail.data.imageUrl} alt="" /> : <UserRound />}
            </span>
            <div>
              <span className="eyebrow">Channel</span>
              <h2>{detail.data.title}</h2>
              <p>{countLabel(detail.data.archiveVideoCount, 'archived video')}</p>
            </div>
          </div>
          <FlatTabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
            <FlatTabsList aria-label="Channel details">
              <FlatTabsTrigger value="details">Details</FlatTabsTrigger>
              <FlatTabsTrigger value="library">Library</FlatTabsTrigger>
            </FlatTabsList>
            <FlatTabsContent value="details" className="inspector-tab-panel">
              <section>
                <h3>Activity</h3>
                <dl>
                  <div>
                    <dt>Archived videos</dt>
                    <dd>{detail.data.archiveVideoCount.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Supported watches</dt>
                    <dd>{detail.data.watchCount.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Queued videos</dt>
                    <dd>{detail.data.queueVideoCount.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Latest watch</dt>
                    <dd>{date(detail.data.date)}</dd>
                  </div>
                </dl>
                {detail.data.description ? <p>{detail.data.description}</p> : null}
                {detail.data.country ? <p>Country: {detail.data.country}</p> : null}
                {detail.data.metadataMessage ? <p>{detail.data.metadataMessage}</p> : null}
                <a href={detail.data.canonicalUrl} target="_blank" rel="noreferrer">
                  Open on YouTube <ExternalLink />
                </a>
              </section>
            </FlatTabsContent>
            <FlatTabsContent value="library" className="inspector-tab-panel">
              <section>
                <h3>Library</h3>
                <FlatTabs
                  value={membership}
                  onValueChange={(value) => setMembership(value as typeof membership)}
                >
                  <FlatTabsList aria-label="Inspector information">
                    <FlatTabsTrigger value="archive">Archive</FlatTabsTrigger>
                    <FlatTabsTrigger value="queue">Queue</FlatTabsTrigger>
                  </FlatTabsList>
                  <FlatTabsContent value={membership} className="contents">
                    {library.isPending ? <p>Loading videos…</p> : null}
                    {library.isError ? <p role="alert">{library.error.message}</p> : null}
                    {library.isSuccess &&
                    library.data.pages.every((page) => page.data.length === 0) ? (
                      <p>{membership === 'queue' ? 'No queued videos.' : 'No archived videos.'}</p>
                    ) : null}
                    <ol className="history-list">
                      {library.data?.pages
                        .flatMap((page) => page.data)
                        .map((item) => (
                          <li key={item.id} className="channel-library-video">
                            <span className="video-thumbnail">
                              {item.imageUrl ? (
                                <img src={item.imageUrl} alt="" loading="lazy" />
                              ) : (
                                <PlaySquare aria-hidden="true" />
                              )}
                            </span>
                            <strong>{item.title}</strong>
                            <span>
                              {membership === 'archive'
                                ? `Watched ${date(item.date)}`
                                : `Added ${date(item.date)}`}
                            </span>
                          </li>
                        ))}
                    </ol>
                    {library.hasNextPage ? (
                      <button
                        className="load-more"
                        type="button"
                        onClick={() => void library.fetchNextPage()}
                      >
                        Load more videos
                      </button>
                    ) : null}
                  </FlatTabsContent>
                </FlatTabs>
              </section>
            </FlatTabsContent>
          </FlatTabs>
        </>
      ) : null}
    </aside>
  )
}
