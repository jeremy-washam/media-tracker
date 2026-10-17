import { CollectionSummaryStatus } from '../../components/collection-summary-status'
import { useDebouncedValue } from '../../components/library-hooks'
import { CollectionEmptyState } from '@/components/collection-empty-state'
import { LibraryToolbar, LibraryFilterPanel } from '@/components/library-controls'
import workspaceStyles from '@/components/library-workspace.module.css'
import inspectorStyles from '@/components/inspector.module.css'
import musicStyles from '@/features/music/music.module.css'
import controlsStyles from '@/components/library-controls.module.css'
import mediaStyles from '@/components/media-presentation.module.css'
import contentStyles from '@/components/page-content.module.css'
import { cn } from '@/lib/utils'
import { InspectorHeader, InspectorStatePanels } from '@/components/inspector-header'
import { CollectionPagination } from '@/components/collection-pagination'
import { useCollectionScroll } from '@/components/collection-scroll'
import { musicQueryOptions, musicSummaryQueryOptions } from '../../library-queries'
import { MediaRowButton } from '@/components/library-controls'
import { CollectionTabList, FlatTabs, FlatTabsContent } from '@/components/flat-tabs'
import { Notice, LoadingState, Hint } from '@/components/ui-patterns'
import {
  FlatTabs as Tabs,
  FlatTabsList as TabsList,
  FlatTabsTrigger as TabsTrigger,
  FlatTabsContent as TabsContent,
} from '@/components/flat-tabs'
import { FieldLabel } from '@/components/ui/field'
import { Checkbox } from '@/components/ui/checkbox'
import { AppInput as Input } from '@/components/ui-patterns'
import { AppButton as Button } from '@/components/ui-patterns'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { LibraryLayoutToggle, LibrarySelect } from '../../components/library-controls'
import {
  useLiveSearch,
  useLibraryLayout,
  useInspectorPresence,
  useLibrarySectionCounts,
} from '../../components/library-hooks'
import { useRef, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import {
  Disc,
  User,
  ArrowUp,
  ArrowDown,
  ArrowSquareOut,
  MusicNotes,
  MagnifyingGlass,
  Funnel,
  X,
} from '@/components/icons'
import type { MusicCollectionItem } from '@media-tracker/contracts'
import { fetchMusicDetail, fetchMusicFilterOptions, fetchMusicHistory } from './music-api'
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
    requestAnimationFrame(() => target?.focus({ preventScroll: true }))
  }
  const queryOptions = musicQueryOptions(view, search)
  const result = useInfiniteQuery(queryOptions)
  const summaryQuery = useQuery(musicSummaryQueryOptions(view, search))
  const items = result.data?.pages.flatMap((page) => page.data) ?? []
  const collectionRef = useCollectionScroll(queryOptions.queryKey, layout, items.length)
  const summary = summaryQuery.data
  const sectionCounts = useLibrarySectionCounts('music', summary, (page) => page.sectionCounts)
  const sorts: [string, string][] =
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
    <FlatTabs
      value={view}
      render={<section />}
      data-inspector-open={Boolean(search.item)}
      data-layout={layout}
      className={cn(
        workspaceStyles['books-page'],
        workspaceStyles['spotify-library-page'],
        layout === 'grid' ? musicStyles['music-grid'] : mediaStyles['music-list'],
      )}
      data-ui={cn('library-workspace spotify-library-page music-page', `music-${layout}`)}
    >
      <FlatTabsContent
        value={view}
        className={workspaceStyles['books-collection']}
        ref={collectionRef}
        data-ui="library-collection"
      >
        <h1 className="sr-only" ref={headingRef} tabIndex={-1}>
          Music
        </h1>
        <CollectionTabList aria-label="Music sections">
          {(['tracks', 'albums', 'artists'] as const).map((target) => (
            <Link
              key={target}
              to={`/library/music/${target}`}
              search={normalizeMusicSearch(
                target === view ? search : { ...search, item: undefined },
                target,
              )}
              activeProps={{ 'aria-current': 'page' }}
            >
              {target[0]!.toUpperCase() + target.slice(1)}{' '}
              <span>{sectionCounts?.[target]?.toLocaleString() ?? '—'}</span>
            </Link>
          ))}
        </CollectionTabList>
        <LibraryToolbar data-ui="library-toolbar">
          <form
            className={controlsStyles['books-search']}
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
            <InputGroup>
              <InputGroupInput
                aria-label="Search music"
                placeholder={`Search ${view}`}
                value={draft ?? search.q ?? ''}
                onChange={(event) => setDraft(event.target.value)}
              />
              <InputGroupAddon>
                <MagnifyingGlass />
              </InputGroupAddon>
              {(draft ?? search.q) ? (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    size="icon-xs"
                    type="button"
                    aria-label="Clear search"
                    onClick={() => {
                      setDraft(null)
                      update({ q: undefined, item: undefined, sort: undefined })
                    }}
                  >
                    <X />
                  </InputGroupButton>
                </InputGroupAddon>
              ) : null}
            </InputGroup>
          </form>
          <label className={controlsStyles['library-inline-filter']}>
            <span>Source</span>
            <LibrarySelect
              value={search.source ?? 'all'}
              onValueChange={(value) =>
                update({
                  source: value as MusicRouteSearch['source'],
                  item: undefined,
                })
              }
              aria-label="Source"
              options={[
                { value: 'all', label: 'All history' },
                { value: 'export', label: 'Extended history' },
                { value: 'recent_api', label: 'Recent API' },
              ]}
            />
          </label>
          <Button
            variant="outline"
            type="button"
            className={controlsStyles['toolbar-button']}
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((value) => !value)}
            data-ui="toolbar-button"
          >
            <Funnel aria-hidden="true" /> Filters
          </Button>
          <label className={controlsStyles['books-sort']} data-ui="library-sort">
            <span className="sr-only">Sort music</span>
            <LibrarySelect
              aria-label="Sort music"
              value={selectedSort}
              onValueChange={(value) =>
                update({ sort: value, direction: undefined, item: undefined })
              }
              options={[...sorts.map(([value, label]) => ({ value, label }))]}
            />
          </label>
          <Hint content={selectedDirection === 'asc' ? 'Ascending' : 'Descending'}>
            <Button
              variant="outline"
              size="icon"
              type="button"
              className={controlsStyles['sort-direction']}
              aria-label={selectedDirection === 'asc' ? 'Sort descending' : 'Sort ascending'}
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
            </Button>
          </Hint>

          {view !== 'tracks' ? (
            <LibraryLayoutToggle value={layout} onValueChange={(layout) => update({ layout })} />
          ) : null}
        </LibraryToolbar>
        {filtersOpen ? (
          <LibraryFilterPanel aria-label="Music filters" data-ui="filter-panel">
            <div className={controlsStyles['filter-panel-heading']}>
              <strong> Filters</strong>
              <Button
                variant="outline"
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
              </Button>
            </div>
            <div className={controlsStyles['filter-panel-grid']}>
              <fieldset className={controlsStyles['date-filter']} data-ui="date-filter">
                <legend>Playback date</legend>
                <label>
                  From
                  <Input
                    type="date"
                    value={search.from ?? ''}
                    onChange={(event) =>
                      update({ from: event.target.value || undefined, item: undefined })
                    }
                  />
                </label>
                <label>
                  To
                  <Input
                    type="date"
                    value={search.to ?? ''}
                    onChange={(event) =>
                      update({ to: event.target.value || undefined, item: undefined })
                    }
                  />
                </label>
              </fieldset>
              <label className={controlsStyles['library-inline-filter']}>
                <span>Playback observations</span>
                <LibrarySelect
                  value={search.playbackCount ?? 'any'}
                  onValueChange={(value) =>
                    update({
                      playbackCount: value as MusicRouteSearch['playbackCount'],
                      item: undefined,
                    })
                  }
                  aria-label="Playback observations"
                  options={[
                    { value: 'any', label: 'Any count' },
                    { value: 'once', label: '1' },
                    { value: '2to9', label: '2–9' },
                    { value: '10to49', label: '10–49' },
                    { value: '50plus', label: '50+' },
                  ]}
                />
              </label>
              <label className={controlsStyles['library-inline-filter']}>
                <span>Metadata</span>
                <LibrarySelect
                  value={search.metadata ?? 'any'}
                  onValueChange={(value) =>
                    update({
                      metadata: value as MusicRouteSearch['metadata'],
                      item: undefined,
                    })
                  }
                  aria-label="Metadata"
                  options={[
                    { value: 'any', label: 'Any state' },
                    { value: 'current', label: 'Current catalog data' },
                    { value: 'export_only', label: 'Export only' },
                    { value: 'unavailable', label: 'Unavailable' },
                  ]}
                />
              </label>
              {view === 'tracks' ? (
                <label className={controlsStyles['library-inline-filter']}>
                  <span>Explicit</span>
                  <LibrarySelect
                    value={search.explicit ?? 'any'}
                    onValueChange={(value) =>
                      update({
                        explicit: value as MusicRouteSearch['explicit'],
                        item: undefined,
                      })
                    }
                    aria-label="Explicit"
                    options={[
                      { value: 'any', label: 'Any' },
                      { value: 'yes', label: 'Explicit' },
                      { value: 'no', label: 'Not explicit' },
                      { value: 'unknown', label: 'Unknown' },
                    ]}
                  />
                </label>
              ) : null}
              {view === 'albums' ? (
                <label className={controlsStyles['library-inline-filter']}>
                  <span>Album type</span>
                  <LibrarySelect
                    value={search.albumType ?? 'any'}
                    onValueChange={(value) =>
                      update({
                        albumType: value as MusicRouteSearch['albumType'],
                        item: undefined,
                      })
                    }
                    aria-label="Album type"
                    options={[
                      { value: 'any', label: 'Any type' },
                      { value: 'album', label: 'Album' },
                      { value: 'single', label: 'Single' },
                      { value: 'compilation', label: 'Compilation' },
                      { value: 'other', label: 'Other' },
                      { value: 'unknown', label: 'Unknown' },
                    ]}
                  />
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
          </LibraryFilterPanel>
        ) : null}
        <div
          className={workspaceStyles['books-result-summary']}
          aria-live="polite"
          data-ui="collection-summary"
        >
          <span>
            {result.isPending || !summary
              ? null
              : `${(summary?.filteredCount ?? 0).toLocaleString()} ${view}`}
          </span>
        </div>
        <CollectionSummaryStatus query={summaryQuery} />
        {result.isPending ? (
          <LoadingState data-ui="collection-loading">Loading music…</LoadingState>
        ) : null}
        {summary?.coverage?.possibleRecentGap ? (
          <p className={workspaceStyles['library-coverage-note']} role="status">
            Recent playback coverage may have a gap between Spotify polls. Imported history is
            retained.
          </p>
        ) : !summary?.coverage?.recentPollAt && !result.isPending ? (
          <p className={workspaceStyles['library-coverage-note']}>
            Recently Played has not completed a checkpointed poll; imported listening history
            remains available.
          </p>
        ) : null}
        {result.isError && !result.isFetchNextPageError ? (
          <Notice className={workspaceStyles['books-state']}>
            <h2>Music could not be loaded</h2>
            <p>{result.error.message}</p>
          </Notice>
        ) : null}
        {!result.isPending && !result.isError && items.length === 0 ? (
          <CollectionEmptyState
            icon={MusicNotes}
            title={`No ${view} yet`}
            description="Import Spotify Extended Streaming History or sync Spotify from Connections."
          />
        ) : null}
        {items.length ? (
          <div className={mediaStyles['spotify-result-grid']}>
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
        <CollectionPagination
          query={result}
          scrollRef={collectionRef}
          itemCount={items.length}
          label={view}
        />
      </FlatTabsContent>
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
    </FlatTabs>
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
  const debouncedOptionQ = useDebouncedValue(optionQ, 250)
  const request = {
    ...musicQuerySearch(search),
    section: view,
    facet,
    optionQ: debouncedOptionQ,
    optionLimit: 30,
  }
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
    <fieldset className={controlsStyles['library-facet-picker']}>
      <legend>
        {label}
        {selected.length ? ` (${selected.length} selected)` : ''}
      </legend>
      <Input
        aria-label={`Search ${label.toLowerCase()} options`}
        type="search"
        placeholder={`Find ${facet}`}
        value={optionQ}
        onChange={(event) => setOptionQ(event.target.value)}
      />
      <div className={controlsStyles['library-facet-options']}>
        {options.isPending ? <LoadingState>Loading options…</LoadingState> : null}
        {options.isError ? <Notice>Options unavailable</Notice> : null}
        {options.data?.pages
          .flatMap((page) => page.data)
          .map((option) => (
            <FieldLabel key={option.value}>
              <Checkbox
                checked={selected.includes(option.value)}
                onCheckedChange={() => onChange(option.value)}
              />
              <span>{option.label}</span>
              <small>{option.count.toLocaleString()}</small>
            </FieldLabel>
          ))}
        {options.data?.pages[0]?.data.length === 0 ? <span>No matching options</span> : null}
      </div>
      {options.hasNextPage ? (
        <Button
          variant="outline"
          type="button"
          disabled={options.isFetchingNextPage}
          onClick={() => void options.fetchNextPage()}
        >
          {options.isFetchingNextPage ? 'Loading…' : 'More options'}
        </Button>
      ) : null}
    </fieldset>
  )
}

function MusicArtworkIcon({ kind }: { kind: MusicCollectionItem['kind'] }) {
  const Icon = kind === 'artist' ? User : kind === 'album' ? Disc : MusicNotes
  return <Icon aria-hidden="true" />
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
    <MediaRowButton
      data-collection-item={item.id}
      type="button"
      className={cn(mediaStyles['spotify-result'], selected ? mediaStyles['selected'] : undefined)}
      onClick={(event) => onSelect(event.currentTarget)}
      data-ui="spotify-result"
      aria-pressed={selected}
    >
      {item.imageUrl ? (
        <img src={item.imageUrl} alt="" loading="lazy" />
      ) : (
        <span className={mediaStyles['spotify-art-fallback']}>
          <MusicArtworkIcon kind={item.kind} />
        </span>
      )}
      <span className={mediaStyles['spotify-result-copy']} data-ui="media-item-copy">
        <strong>{item.title}</strong>
        <span>
          {item.subtitle ?? item.album ?? (item.kind === 'artist' ? 'Artist' : 'Metadata pending')}
        </span>
        <small className={musicStyles['music-list-summary']}>
          {item.playbackCount.toLocaleString()} playback{' '}
          {item.playbackCount === 1 ? 'observation' : 'observations'} ·{' '}
          {item.observedDurationKnown ? (
            listened(item.observedMs)
          ) : (
            <Hint content="Spotify recent history does not include listening duration">
              <span
                aria-label="Listening time unavailable from Spotify recent history"
                tabIndex={0}
              >
                —
              </span>
            </Hint>
          )}
          {item.observedDurationKnown && item.durationUnknownCount > 0
            ? ` · ${item.durationUnknownCount.toLocaleString()} without duration`
            : ''}
          {item.kind !== 'track'
            ? ` · ${item.trackCount} ${item.trackCount === 1 ? 'track' : 'tracks'}`
            : ''}
        </small>
        <small className={musicStyles['music-grid-summary']} data-ui="music-grid-summary">
          {item.playbackCount.toLocaleString()} observations ·{' '}
          {item.observedDurationKnown ? listened(item.observedMs) : 'Time unavailable'}
        </small>
      </span>
    </MediaRowButton>
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
    <aside
      ref={inspectorRef}
      className={inspectorStyles['media-inspector']}
      aria-label="Music inspector"
      data-ui="media-inspector"
    >
      <Tabs
        className={inspectorStyles['inspector-tab-root']}
        value={tab}
        onValueChange={(value) => setTab(value as typeof tab)}
      >
        <InspectorHeader onClose={onClose}>
          <TabsList
            variant="line"
            className={inspectorStyles['inspector-tabs']}
            aria-label="Music information"
          >
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="history">
              History{detail.data ? ` (${detail.data.playbackCount.toLocaleString()})` : ''}
            </TabsTrigger>
          </TabsList>
        </InspectorHeader>
        <div className={inspectorStyles['inspector-scroll']} data-ui="inspector-scroll">
          {detail.isPending ? (
            <InspectorStatePanels values={['details', 'history']}>
              <LoadingState>Loading…</LoadingState>
            </InspectorStatePanels>
          ) : detail.isError ? (
            <InspectorStatePanels values={['details', 'history']}>
              <Notice>{detail.error.message}</Notice>
            </InspectorStatePanels>
          ) : detail.data ? (
            <>
              <div className={inspectorStyles['inspector-hero']} data-ui="inspector-hero">
                {detail.data.imageUrl ? (
                  <img src={detail.data.imageUrl} alt="" />
                ) : (
                  <span className={mediaStyles['spotify-art-fallback']}>
                    <MusicArtworkIcon kind={detail.data.kind} />
                  </span>
                )}
                <div>
                  <span className={contentStyles['eyebrow']} data-ui="eyebrow">
                    {detail.data.kind}
                  </span>
                  <h2>{detail.data.title}</h2>
                  <p>{detail.data.subtitle}</p>
                </div>
              </div>
              {
                <>
                  <TabsContent value="details" className={inspectorStyles['inspector-tab-panel']}>
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
                          <dt>
                            {matchingItem ? 'Lifetime observations' : 'Playback observations'}
                          </dt>
                          <dd>{detail.data.playbackCount.toLocaleString()}</dd>
                        </div>
                        <div>
                          <dt>{matchingItem ? 'Lifetime observed time' : 'Observed time'}</dt>
                          <dd>
                            {detail.data.observedDurationKnown
                              ? listened(detail.data.observedMs)
                              : 'Unavailable'}
                            {detail.data.observedDurationKnown &&
                            detail.data.durationUnknownCount > 0
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
                                <Link
                                  to="/library/music/albums"
                                  search={{ item: detail.data.albumId }}
                                >
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
                        <div className={inspectorStyles['inspector-related-links']}>
                          {detail.data.artists.map((artist) => (
                            <Link
                              key={artist.id}
                              to="/library/music/artists"
                              search={{ item: artist.id }}
                            >
                              {artist.name}
                            </Link>
                          ))}
                        </div>
                      ) : null}
                      {detail.data.relatedTracks?.length ? (
                        <div className={inspectorStyles['inspector-related-list']}>
                          <h3>Heard tracks</h3>
                          {detail.data.relatedTracks.map((track) => (
                            <Link
                              key={track.id}
                              to="/library/music/tracks"
                              search={{ item: track.id }}
                            >
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
                        <div className={inspectorStyles['inspector-related-list']}>
                          <h3>Albums</h3>
                          {detail.data.relatedAlbums.map((album) => (
                            <Link
                              key={album.id}
                              to="/library/music/albums"
                              search={{ item: album.id }}
                            >
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
                          Open in Spotify <ArrowSquareOut />
                        </a>
                      ) : null}
                    </section>
                  </TabsContent>
                  <TabsContent value="history" className={inspectorStyles['inspector-tab-panel']}>
                    <section>
                      <h3>History</h3>
                      {history.isPending ? <LoadingState>Loading history…</LoadingState> : null}
                      {history.isError ? <Notice>{history.error.message}</Notice> : null}
                      {history.data?.pages[0]?.totalCount === 0 ? (
                        <p>No playback observations.</p>
                      ) : null}
                      <ol
                        className={cn(
                          inspectorStyles['history-list'],
                          inspectorStyles['spotify-history-list'],
                          view === 'tracks' ? undefined : inspectorStyles['music-entity-history'],
                        )}
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
                        <Button
                          variant="outline"
                          type="button"
                          className={workspaceStyles['load-more']}
                          disabled={history.isFetchingNextPage}
                          onClick={() => void history.fetchNextPage()}
                        >
                          {history.isFetchingNextPage ? 'Loading…' : 'Load more history'}
                        </Button>
                      ) : null}
                    </section>
                  </TabsContent>
                </>
              }
            </>
          ) : null}
        </div>
      </Tabs>
    </aside>
  )
}
