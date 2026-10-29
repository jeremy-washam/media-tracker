import {
  LibraryCollectionHeader,
  LibraryFiltersTrigger,
} from '@/components/library-collection-header'
import { LibraryAppliedFilters } from '@/components/library-applied-filters'
import { CollectionSummaryStatus } from '../../components/collection-summary-status'
import { useDebouncedValue } from '../../components/library-hooks'
import { CollectionEmptyState } from '@/components/collection-empty-state'
import { hasCollectionFilters, clearedCollectionSearch } from '../../library-search'
import { LibraryToolbar, LibraryFilterPanel } from '@/components/library-controls'
import workspaceStyles from '@/components/library-workspace.module.css'
import controlsStyles from '@/components/library-controls.module.css'
import mediaStyles from '@/components/media-presentation.module.css'
import inspectorStyles from '@/components/inspector.module.css'
import contentStyles from '@/components/page-content.module.css'
import { cn } from '@/lib/utils'
import { InspectorHeader, InspectorStatePanels } from '@/components/inspector-header'
import { CollectionPagination } from '@/components/collection-pagination'
import { useCollectionScroll } from '@/components/collection-scroll'
import { podcastsQueryOptions, podcastsSummaryQueryOptions } from '../../library-queries'
import { MediaRowButton } from '@/components/library-controls'
import { CollectionTabList, FlatTabs, FlatTabsContent } from '@/components/flat-tabs'
import { Notice, LoadingState } from '@/components/ui-patterns'
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
  ArrowSquareOut,
  ArrowUp,
  ArrowDown,
  Microphone,
  MagnifyingGlass,
  Funnel,
  X,
} from '@/components/icons'
import type { PodcastCollectionItem } from '@media-tracker/contracts'
import { fetchPodcast, fetchPodcastFilterOptions, fetchPodcastHistory } from './podcasts-api'
import { useInspectorFocus } from '../inspector-focus'
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
  const filtered = hasCollectionFilters(search)
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
    requestAnimationFrame(() => target?.focus({ preventScroll: true }))
  }
  const queryOptions = podcastsQueryOptions(view, search)
  const result = useInfiniteQuery(queryOptions)
  const summaryQuery = useQuery(podcastsSummaryQueryOptions(view, search))
  const items = result.data?.pages.flatMap((page) => page.data) ?? []
  const collectionRef = useCollectionScroll(queryOptions.queryKey, layout, items.length)
  const summary = summaryQuery.data
  const sectionCounts = useLibrarySectionCounts('podcasts', summary, (page) => page.sectionCounts)
  const sorts: [string, string][] =
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
    <FlatTabs
      value={view}
      render={<section />}
      data-inspector-open={Boolean(search.item)}
      data-layout={layout}
      className={cn(
        workspaceStyles['books-page'],
        workspaceStyles['spotify-library-page'],
        layout === 'list' ? mediaStyles['podcasts-list'] : undefined,
      )}
      data-ui={cn('library-workspace spotify-library-page', `podcasts-${layout}`)}
    >
      <FlatTabsContent value={view} className={workspaceStyles['collection-pane']}>
        <h1 className="sr-only" ref={headingRef} tabIndex={-1}>
          Podcasts
        </h1>
        <CollectionTabList aria-label="Podcast sections">
          {(['archive', 'queue', 'following'] as const).map((target) => (
            <Link
              key={target}
              to={`/library/podcasts/${target}`}
              search={normalizePodcastSearch(search, target)}
              activeProps={{ 'aria-current': 'page' }}
            >
              {target[0]!.toUpperCase() + target.slice(1)}{' '}
              <span>{sectionCounts?.[target]?.toLocaleString() ?? '—'}</span>
            </Link>
          ))}
        </CollectionTabList>
        <LibraryCollectionHeader
          filtersOpen={filtersOpen}
          onFiltersOpenChange={setFiltersOpen}
          filters={
            <>
              {filtersOpen ? (
                <LibraryFilterPanel aria-label="Podcast filters" data-ui="filter-panel">
                  <div className={controlsStyles['filter-panel-heading']}>
                    <strong> Filters</strong>
                    <Button
                      variant="outline"
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
                    </Button>
                  </div>
                  <div className={controlsStyles['filter-panel-grid']}>
                    <fieldset className={controlsStyles['date-filter']} data-ui="date-filter">
                      <legend>{view === 'archive' ? 'Activity date' : 'Saved date'}</legend>
                      <label>
                        From
                        <Input
                          type="date"
                          value={search.dateFrom ?? ''}
                          onChange={(event) =>
                            update({ dateFrom: event.target.value || undefined, item: undefined })
                          }
                        />
                      </label>
                      <label>
                        To
                        <Input
                          type="date"
                          value={search.dateTo ?? ''}
                          onChange={(event) =>
                            update({ dateTo: event.target.value || undefined, item: undefined })
                          }
                        />
                      </label>
                      <FieldLabel>
                        <Checkbox
                          checked={search.dateUnknown ?? false}
                          onCheckedChange={(checked) =>
                            update({ dateUnknown: checked || undefined, item: undefined })
                          }
                        />{' '}
                        Date unavailable
                      </FieldLabel>
                    </fieldset>
                    {view !== 'following' ? (
                      <>
                        <fieldset className={controlsStyles['date-filter']} data-ui="date-filter">
                          <legend>Published</legend>
                          <label>
                            From
                            <Input
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
                            <Input
                              type="date"
                              value={search.publishedTo ?? ''}
                              onChange={(event) =>
                                update({
                                  publishedTo: event.target.value || undefined,
                                  item: undefined,
                                })
                              }
                            />
                          </label>
                          <FieldLabel>
                            <Checkbox
                              checked={search.publishedUnknown ?? false}
                              onCheckedChange={(checked) =>
                                update({
                                  publishedUnknown: checked || undefined,
                                  item: undefined,
                                })
                              }
                            />{' '}
                            Date unavailable
                          </FieldLabel>
                        </fieldset>
                        <label className={controlsStyles['library-inline-filter']}>
                          <span>Duration</span>
                          <LibrarySelect
                            value={search.duration?.[0] ?? ''}
                            onValueChange={(value) =>
                              update({
                                duration: value
                                  ? [value as NonNullable<PodcastsRouteSearch['duration']>[number]]
                                  : undefined,
                                item: undefined,
                              })
                            }
                            aria-label="Duration"
                            options={[
                              { value: '', label: 'Any duration' },
                              { value: 'under30', label: 'Under 30 min' },
                              { value: '30to59', label: '30–59 min' },
                              { value: '1to2hours', label: '1–2 hr' },
                              { value: 'over2hours', label: 'Over 2 hr' },
                              { value: 'unknown', label: 'Duration unavailable' },
                            ]}
                          />
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
                        <label className={controlsStyles['library-inline-filter']}>
                          <span>Library episodes</span>
                          <LibrarySelect
                            value={search.libraryEpisodes?.[0] ?? ''}
                            onValueChange={(value) =>
                              update({
                                libraryEpisodes: value
                                  ? [
                                      value as NonNullable<
                                        PodcastsRouteSearch['libraryEpisodes']
                                      >[number],
                                    ]
                                  : undefined,
                                item: undefined,
                              })
                            }
                            aria-label="Library episodes"
                            options={[
                              { value: '', label: 'Any' },
                              { value: 'archive', label: 'Has Archive episodes' },
                              { value: 'queue', label: 'Has Queue episodes' },
                              { value: 'none', label: 'No Library episodes' },
                            ]}
                          />
                        </label>
                        <PodcastFacetPicker
                          view="following"
                          facet="publisher"
                          search={search}
                          selected={search.publisher ?? []}
                          onChange={(value) =>
                            update({
                              publisher: toggleValue(search.publisher, value),
                              item: undefined,
                            })
                          }
                        />
                        <PodcastFacetPicker
                          view="following"
                          facet="language"
                          search={search}
                          selected={search.language ?? []}
                          onChange={(value) =>
                            update({
                              language: toggleValue(search.language, value),
                              item: undefined,
                            })
                          }
                        />
                      </>
                    )}
                  </div>
                </LibraryFilterPanel>
              ) : null}
            </>
          }
        >
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
                  aria-label="Search podcasts"
                  placeholder={
                    view === 'following' ? 'Search shows or publishers' : 'Search episodes or shows'
                  }
                  value={draft ?? search.q ?? ''}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <InputGroupAddon>
                  <MagnifyingGlass aria-hidden="true" />
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
                      <X aria-hidden="true" />
                    </InputGroupButton>
                  </InputGroupAddon>
                ) : null}
              </InputGroup>
            </form>
            {view !== 'following' ? (
              <label className={controlsStyles['library-inline-filter']}>
                <span>Show</span>
                <LibrarySelect
                  value={search.following ?? 'all'}
                  onValueChange={(value) =>
                    update({
                      following: value as PodcastsRouteSearch['following'],
                      item: undefined,
                    })
                  }
                  aria-label="Show"
                  options={[
                    { value: 'all', label: 'All shows' },
                    { value: 'following', label: 'Following' },
                    { value: 'not_following', label: 'Not following' },
                  ]}
                />
              </label>
            ) : null}
            <LibraryFiltersTrigger
              variant="outline"
              type="button"
              className={controlsStyles['toolbar-button']}
              data-ui="toolbar-button"
            >
              <Funnel aria-hidden="true" /> Filters
            </LibraryFiltersTrigger>
            <label className={controlsStyles['books-sort']} data-ui="library-sort">
              <span className="sr-only">Sort podcasts</span>
              <LibrarySelect
                aria-label="Sort podcasts"
                value={selectedSort}
                onValueChange={(value) =>
                  update({ sort: value, direction: undefined, item: undefined })
                }
                options={[...sorts.map(([value, label]) => ({ value, label }))]}
              />
            </label>
            <Button
              variant="outline"
              size="icon"
              type="button"
              className={controlsStyles['sort-direction']}
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
            </Button>
            {view === 'following' ? (
              <LibraryLayoutToggle value={layout} onValueChange={(layout) => update({ layout })} />
            ) : null}
          </LibraryToolbar>
          <div
            className={workspaceStyles['books-result-summary']}
            aria-live="polite"
            data-ui="collection-summary"
          >
            <span>
              {result.isPending || !summary
                ? null
                : `${(summary?.filteredCount ?? 0).toLocaleString()} ${view === 'following' ? ((summary?.filteredCount ?? 0) === 1 ? 'show' : 'shows') : (summary?.filteredCount ?? 0) === 1 ? 'episode' : 'episodes'}`}
            </span>
          </div>
          <LibraryAppliedFilters media="podcasts" search={search} onChange={update} />
        </LibraryCollectionHeader>
        <div
          className={workspaceStyles['books-collection']}
          ref={collectionRef}
          data-ui="library-collection"
        >
          <CollectionSummaryStatus query={summaryQuery} />
          {result.isPending ? (
            <LoadingState data-ui="collection-loading">Loading podcasts…</LoadingState>
          ) : null}
          {!result.isPending &&
          summary?.coverage &&
          (view === 'following'
            ? !summary.coverage.savedShowsAt
            : !summary.coverage.savedEpisodesAt) ? (
            <p className={workspaceStyles['library-coverage-note']}>
              {view === 'following'
                ? 'Following has not completed a checkpointed Spotify show sync.'
                : 'Saved episodes have not completed a checkpointed Spotify sync; Queue may be incomplete.'}
            </p>
          ) : null}
          {result.isError && !result.isFetchNextPageError ? (
            <Notice className={workspaceStyles['books-state']}>
              <h2>Podcasts could not be loaded</h2>
              <p>{result.error.message}</p>
            </Notice>
          ) : null}
          {!result.isPending && !result.isError && items.length === 0 ? (
            <CollectionEmptyState
              icon={Microphone}
              title={
                filtered
                  ? `No matching ${view === 'following' ? 'shows' : 'episodes'}`
                  : `No ${view === 'following' ? 'followed shows' : `episodes in ${view}`}`
              }
              description={
                filtered
                  ? 'Try another search or clear the filters.'
                  : 'Sync Spotify from Connections to populate this section.'
              }
              onClear={
                filtered
                  ? () => {
                      setDraft(null)
                      update(clearedCollectionSearch(search))
                    }
                  : undefined
              }
            />
          ) : null}
          {items.length ? (
            <div className={mediaStyles['spotify-result-grid']}>
              {items.map((item) => (
                <PodcastItem
                  key={`${item.kind}:${item.id}`}
                  item={item}
                  selected={search.item === item.id}
                  onSelect={(element) => {
                    selectedResultRef.current = element
                    update({ item: search.item === item.id ? undefined : item.id, kind: item.kind })
                  }}
                />
              ))}
            </div>
          ) : null}
          <CollectionPagination
            query={result}
            scrollRef={collectionRef}
            itemCount={items.length}
            label={view === 'following' ? 'shows' : 'episodes'}
          />
        </div>
      </FlatTabsContent>
      {inspectorItem ? (
        <PodcastInspector
          id={inspectorItem}
          kind={search.kind ?? (view === 'following' ? 'show' : 'episode')}
          onClose={closeInspector}
          onOpenShow={(id) => update({ item: id, kind: 'show' })}
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
  const debouncedOptionQ = useDebouncedValue(optionQ, 250)
  const request = {
    ...podcastQuerySearch(search),
    section: view,
    facet,
    optionQ: debouncedOptionQ,
    optionLimit: 30,
  }
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
          <Microphone />
        </span>
      )}
      <span className={mediaStyles['spotify-result-copy']} data-ui="media-item-copy">
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
    </MediaRowButton>
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
  const inspectorRef = useInspectorFocus(onClose, id)
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
    <aside
      ref={inspectorRef}
      className={inspectorStyles['media-inspector']}
      aria-label="Podcast inspector"
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
            aria-label="Podcast information"
          >
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="history">
              History
              {kind === 'episode' && detail.data
                ? ` (${detail.data.playbackCount.toLocaleString()})`
                : ''}
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
                    <Microphone />
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
                        <Button
                          variant="outline"
                          type="button"
                          className={inspectorStyles['inspector-related-link']}
                          onClick={() => onOpenShow(detail.data!.showId!)}
                        >
                          Show details: {detail.data.subtitle ?? 'Show'}
                        </Button>
                      ) : null}
                      {kind === 'show' ? (
                        <div className={inspectorStyles['inspector-related-links']}>
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
                          Open in Spotify <ArrowSquareOut />
                        </a>
                      ) : null}
                    </section>
                  </TabsContent>
                  <TabsContent value="history" className={inspectorStyles['inspector-tab-panel']}>
                    {kind === 'episode' ? (
                      <section>
                        <h3>History</h3>
                        {history.isPending ? <LoadingState>Loading history…</LoadingState> : null}
                        {history.isError ? <Notice>{history.error.message}</Notice> : null}
                        {history.data?.pages[0]?.totalCount === 0 ? (
                          <p>No supported history.</p>
                        ) : null}
                        <ol className={inspectorStyles['history-list']}>
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
