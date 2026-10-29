import { LibrarySortDirection } from '@/components/library-controls'
import {
  LibraryCollectionHeader,
  LibraryFiltersTrigger,
} from '@/components/library-collection-header'
import { LibraryAppliedFilters } from '@/components/library-applied-filters'
import { CollectionSummaryStatus } from '../../components/collection-summary-status'
import {
  videoChannelQueryOptions,
  channelVideosQueryOptions,
  channelPickerQueryOptions,
} from './videos-api'
import { CollectionEmptyState } from '@/components/collection-empty-state'
import { hasCollectionFilters, clearedCollectionSearch } from '../../library-search'
import { LibraryToolbar, LibraryFilterPanel } from '@/components/library-controls'
import workspaceStyles from '@/components/library-workspace.module.css'
import videosStyles from '@/features/videos/videos.module.css'
import controlsStyles from '@/components/library-controls.module.css'
import mediaStyles from '@/components/media-presentation.module.css'
import inspectorStyles from '@/components/inspector.module.css'
import contentStyles from '@/components/page-content.module.css'
import { cn } from '@/lib/utils'
import { InspectorHeader, InspectorStatePanels } from '@/components/inspector-header'
import { CollectionPagination } from '@/components/collection-pagination'
import { useCollectionScroll } from '@/components/collection-scroll'
import { videosQueryOptions, videosSummaryQueryOptions } from '../../library-queries'
import { MediaRowButton } from '@/components/library-controls'
import { CollectionTabList, FlatTabs, FlatTabsContent } from '@/components/flat-tabs'
import { Notice, LoadingState } from '@/components/ui-patterns'
import {
  FlatTabs as Tabs,
  FlatTabsList as TabsList,
  FlatTabsTrigger as TabsTrigger,
  FlatTabsContent as TabsContent,
} from '@/components/flat-tabs'
import { Field, FieldLabel } from '@/components/ui/field'
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
import { useInspectorFocus } from '../inspector-focus'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { ArrowSquareOut, YoutubeLogo, MagnifyingGlass, Funnel, User, X } from '@/components/icons'
import type { VideoCollectionItem, VideosSummary } from '@media-tracker/contracts'
import { fetchVideo, fetchVideoHistory } from './videos-api'
import { normalizeVideoSearch, type VideosRouteSearch } from './videos-route-search'

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
  const filtered = hasCollectionFilters(search)
  const navigate = useNavigate()
  const [draft, setDraft] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const selectedResultRef = useRef<HTMLButtonElement | null>(null)
  const headingRef = useRef<HTMLHeadingElement | null>(null)
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
  const closeInspector = () => {
    const target = selectedResultRef.current?.isConnected
      ? selectedResultRef.current
      : headingRef.current
    update({ item: undefined, channelItem: undefined })
    requestAnimationFrame(() => target?.focus({ preventScroll: true }))
  }
  const inspectorItem = useInspectorPresence(search.item)
  const channelInspectorItem = useInspectorPresence(search.channelItem)
  const queryOptions = videosQueryOptions(view, search)
  const result = useInfiniteQuery(queryOptions)
  const summaryQuery = useQuery(videosSummaryQueryOptions(view, search))
  const items = result.data?.pages.flatMap((page) => page.data) ?? []
  const collectionRef = useCollectionScroll(queryOptions.queryKey, layout, items.length)
  const summary = summaryQuery.data
  const sectionCounts = useLibrarySectionCounts('videos', summary, (page) => page.sectionCounts)
  const sorts: [string, string][] =
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
      data-layout={layout}
      className={cn(
        workspaceStyles['books-page'],
        workspaceStyles['videos-page'],
        videosStyles[`videos-${layout}`],
      )}
      data-ui={cn('library-workspace videos-page', `videos-${layout}`)}
    >
      <FlatTabsContent value={view} className={workspaceStyles['collection-pane']}>
        <h1 className="sr-only" ref={headingRef} tabIndex={-1}>
          Videos
        </h1>
        <CollectionTabList aria-label="Video sections">
          {(['archive', 'queue', 'channels'] as const).map((target) => (
            <Link
              key={target}
              to={`/library/videos/${target}`}
              search={normalizeVideoSearch(search, target)}
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
                <VideoFilters view={view} search={search} summary={summary} update={update} />
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
                  channelItem: undefined,
                  sort: undefined,
                })
                setDraft(null)
              }}
            >
              <InputGroup>
                <InputGroupInput
                  aria-label="Search videos"
                  placeholder={
                    view === 'channels' ? 'Search channels' : 'Search videos or channels'
                  }
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
                        update({
                          q: undefined,
                          item: undefined,
                          channelItem: undefined,
                          sort: undefined,
                        })
                      }}
                    >
                      <X />
                    </InputGroupButton>
                  </InputGroupAddon>
                ) : null}
              </InputGroup>
            </form>
            <LibraryFiltersTrigger
              variant="outline"
              type="button"
              className={controlsStyles['toolbar-button']}
              data-ui="toolbar-button"
            >
              <Funnel aria-hidden="true" /> Filters
            </LibraryFiltersTrigger>
            <label className={controlsStyles['books-sort']} data-ui="library-sort">
              <span className="sr-only">Sort videos</span>
              <LibrarySelect
                aria-label="Sort videos"
                value={selectedSort}
                onValueChange={(value) =>
                  update({
                    sort: value,
                    direction: undefined,
                    item: undefined,
                    channelItem: undefined,
                  })
                }
                options={[...sorts.map(([value, label]) => ({ value, label }))]}
              />
            </label>
            <LibrarySortDirection
              direction={selectedDirection}
              onClick={() =>
                update({
                  direction: selectedDirection === 'asc' ? 'desc' : 'asc',
                  item: undefined,
                  channelItem: undefined,
                })
              }
            />

            {view !== 'channels' ? (
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
                : `${(summary?.filteredCount ?? 0).toLocaleString()} ${view === 'channels' ? 'channels' : 'videos'}`}
            </span>
            {view === 'archive' && summary ? (
              <small>{countLabel(summary.occurrenceCount, 'supported watch')}</small>
            ) : null}
          </div>
          <LibraryAppliedFilters media="videos" search={search} onChange={update} />
        </LibraryCollectionHeader>
        <div
          className={workspaceStyles['books-collection']}
          ref={collectionRef}
          data-ui="library-collection"
        >
          <CollectionSummaryStatus query={summaryQuery} />
          {result.isPending ? (
            <LoadingState data-ui="collection-loading">Loading videos…</LoadingState>
          ) : null}
          {summary && summary.coverage.watchLater !== 'complete' ? (
            <p className={workspaceStyles['library-coverage-note']}>
              Takeout coverage: Watch Later {summary.coverage.watchLater}.
            </p>
          ) : null}
          {result.isError && !result.isFetchNextPageError ? (
            <Notice className={workspaceStyles['books-state']}>
              <h2>Videos could not be loaded</h2>
              <p>{result.error.message}</p>
            </Notice>
          ) : null}
          {!result.isPending && !result.isError && items.length === 0 ? (
            <CollectionEmptyState
              icon={YoutubeLogo}
              title={
                filtered
                  ? `No matching ${view === 'channels' ? 'channels' : 'videos'}`
                  : `No ${view} yet`
              }
              description={
                filtered
                  ? 'Try another search or clear the filters.'
                  : 'Import YouTube Takeout from Connections.'
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
            <div
              className={
                view === 'channels'
                  ? videosStyles['video-channel-list']
                  : videosStyles['video-result-grid']
              }
            >
              {items.map((item) => (
                <VideoItem
                  key={`${item.kind}:${item.id}`}
                  item={item}
                  view={view}
                  selected={
                    view === 'channels' ? search.channelItem === item.id : search.item === item.id
                  }
                  onSelect={(element) => {
                    selectedResultRef.current = element
                    update(
                      view === 'channels'
                        ? { channelItem: search.channelItem === item.id ? undefined : item.id }
                        : { item: search.item === item.id ? undefined : item.id },
                    )
                  }}
                />
              ))}
            </div>
          ) : null}
          <CollectionPagination
            query={result}
            scrollRef={collectionRef}
            itemCount={items.length}
            label={view === 'channels' ? 'channels' : 'videos'}
          />
        </div>
      </FlatTabsContent>
      {inspectorItem ? <VideoInspector id={inspectorItem} onClose={closeInspector} /> : null}
      {channelInspectorItem ? (
        <ChannelInspector id={channelInspectorItem} onClose={closeInspector} />
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
  summary: VideosSummary | undefined
  update: (patch: Partial<VideosRouteSearch>) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [query, setQuery] = useState<string | undefined>(undefined)
  useLiveSearch(draft, query, setQuery, () => setDraft(null))
  const channels = useInfiniteQuery(channelPickerQueryOptions(query))
  const options = channels.data?.pages.flatMap((page) => page.data) ?? []
  const selected = search.channel?.[0] ?? ''
  const selectedFacet = summary?.facets.channels.find((option) => option.value === selected)
  return (
    <fieldset
      className={cn(controlsStyles['filter-group'], videosStyles['video-channel-picker'])}
      data-ui="video-channel-picker"
    >
      <legend>Channel</legend>
      <Input
        type="search"
        aria-label="Search channel options"
        placeholder="Search all channels"
        value={draft ?? query ?? ''}
        onChange={(event) => setDraft(event.target.value)}
      />
      <LibrarySelect
        aria-label="Channel"
        value={selected}
        onValueChange={(value) =>
          update({
            channel: value ? [value] : undefined,
            item: undefined,
          })
        }
        options={[
          { value: '', label: 'All channels' },
          ...(selected && !options.some((item) => item.id === selected)
            ? [
                {
                  value: selected,
                  label:
                    selectedFacet?.label ??
                    (selected === '__unknown__' ? 'Channel unavailable' : selected),
                },
              ]
            : []),
          ...options.map((item) => ({ value: item.id, label: item.title })),
          ...(selected !== '__unknown__' &&
          summary?.facets.channels.some((item) => item.value === '__unknown__')
            ? [{ value: '__unknown__', label: 'Channel unavailable' }]
            : []),
        ]}
      />
      {channels.isPending ? <LoadingState>Loading channels…</LoadingState> : null}
      {channels.isError ? <Notice>{channels.error.message}</Notice> : null}
      {channels.isSuccess && options.length === 0 ? <small>No matching channels.</small> : null}
      {channels.hasNextPage ? (
        <Button
          variant="outline"
          type="button"
          className="facet-load-more"
          disabled={channels.isFetchingNextPage}
          onClick={() => void channels.fetchNextPage()}
        >
          {channels.isFetchingNextPage ? 'Loading…' : 'Load more channels'}
        </Button>
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
  summary: VideosSummary | undefined
  update: (patch: Partial<VideosRouteSearch>) => void
}) {
  if (view === 'channels') {
    return null
  }
  return (
    <LibraryFilterPanel aria-label="Video filters" data-ui="filter-panel">
      <div className={controlsStyles['filter-panel-heading']}>
        <strong> Filters</strong>
        <Button
          variant="outline"
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
        </Button>
      </div>
      <div className={controlsStyles['filter-panel-grid']}>
        <fieldset className={controlsStyles['date-filter']} data-ui="date-filter">
          <legend>{view === 'archive' ? 'Watched date' : 'Added to Watch Later'}</legend>
          <label>
            From
            <Input
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
            <Input
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
          <FieldLabel className={controlsStyles['unknown-toggle']}>
            <Checkbox
              checked={
                view === 'archive'
                  ? (search.watchedUnknown ?? false)
                  : (search.addedUnknown ?? false)
              }
              onCheckedChange={(checked) =>
                update(
                  view === 'archive'
                    ? { watchedUnknown: checked || undefined, item: undefined }
                    : { addedUnknown: checked || undefined, item: undefined },
                )
              }
            />
            Include unknown dates
          </FieldLabel>
        </fieldset>
        <fieldset className={controlsStyles['date-filter']} data-ui="date-filter">
          <legend>Published</legend>
          <label>
            From
            <Input
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
            <Input
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
          <FieldLabel className={controlsStyles['unknown-toggle']}>
            <Checkbox
              checked={search.published === 'unknown'}
              onCheckedChange={(checked) =>
                update({
                  published: checked ? 'unknown' : undefined,
                  publishedFrom: undefined,
                  publishedTo: undefined,
                  item: undefined,
                })
              }
            />
            Unknown date only
          </FieldLabel>
        </fieldset>
        <label className={controlsStyles['library-inline-filter']}>
          <span>Account</span>
          <LibrarySelect
            value={search.account?.[0] ?? ''}
            onValueChange={(value) =>
              update({
                account: value ? [value] : undefined,
                item: undefined,
              })
            }
            aria-label="Account"
            options={[
              { value: '', label: 'All accounts' },
              ...(summary?.facets.accounts ?? []).map((option) => ({
                value: option.value,
                label: [option.label, ' (', option.count, ')'].join(''),
              })),
            ]}
          />
        </label>
        <VideoChannelPicker search={search} summary={summary} update={update} />
        {view === 'archive' ? (
          <label className={controlsStyles['library-inline-filter']}>
            <span>Watches</span>
            <LibrarySelect
              value={search.watchCount ?? 'all'}
              onValueChange={(value) =>
                update({
                  watchCount: value as VideosRouteSearch['watchCount'],
                  item: undefined,
                })
              }
              aria-label="Watches"
              options={[
                { value: 'all', label: 'Any count' },
                { value: 'once', label: 'Watched once' },
                { value: 'rewatched', label: 'Rewatched' },
              ]}
            />
          </label>
        ) : null}
        <label className={controlsStyles['library-inline-filter']}>
          <span>{view === 'archive' ? 'Queue status' : 'Archive status'}</span>
          <LibrarySelect
            value={search.overlap ?? 'all'}
            onValueChange={(value) =>
              update({
                overlap: value as VideosRouteSearch['overlap'],
                item: undefined,
              })
            }
            aria-label={view === 'archive' ? 'Queue status' : 'Archive status'}
            options={[
              { value: 'all', label: 'Any' },
              {
                value: 'overlap',
                label: ['Also ', view === 'archive' ? 'queued' : 'watched'].join(''),
              },
              {
                value: 'not_overlap',
                label: ['Not ', view === 'archive' ? 'queued' : 'watched'].join(''),
              },
            ]}
          />
        </label>
        <Field
          orientation="horizontal"
          className={controlsStyles['library-inline-filter']}
          aria-label="Duration filter"
        >
          <span>Duration</span>
          <LibrarySelect
            value={search.duration ?? ''}
            onValueChange={(value) =>
              update({
                duration: (value || undefined) as VideosRouteSearch['duration'],
                item: undefined,
              })
            }
            aria-label="Duration"
            options={[
              { value: '', label: 'Any duration' },
              { value: 'under5', label: 'Under 5 minutes' },
              { value: '5to19', label: '5–19 minutes' },
              { value: '20to59', label: '20–59 minutes' },
              { value: '60plus', label: '60+ minutes' },
            ]}
          />
          <FieldLabel className={cn(controlsStyles['unknown-toggle'], 'whitespace-nowrap')}>
            <Checkbox
              checked={search.durationUnknown ?? false}
              onCheckedChange={(checked) =>
                update({ durationUnknown: checked || undefined, item: undefined })
              }
            />
            Include unknown
          </FieldLabel>
        </Field>
        <label className={controlsStyles['library-inline-filter']}>
          <span>Availability</span>
          <LibrarySelect
            value={search.availability ?? ''}
            onValueChange={(value) =>
              update({
                availability: (value || undefined) as VideosRouteSearch['availability'],
                item: undefined,
              })
            }
            aria-label="Availability"
            options={[
              { value: '', label: 'Any state' },
              { value: 'available', label: 'Available' },
              { value: 'unavailable', label: 'Unavailable' },
              { value: 'unchecked', label: 'Unchecked' },
            ]}
          />
        </label>
        <label className={controlsStyles['library-inline-filter']}>
          <span>Format</span>
          <LibrarySelect
            value={search.format?.[0] ?? ''}
            onValueChange={(value) =>
              update({
                format: value
                  ? [value as NonNullable<VideosRouteSearch['format']>[number]]
                  : undefined,
                item: undefined,
              })
            }
            aria-label="Format"
            options={[
              { value: '', label: 'All formats' },
              { value: 'live', label: 'Live' },
              { value: 'upcoming', label: 'Upcoming' },
              { value: 'recorded_live', label: 'Recorded live' },
              { value: 'youtube_music', label: 'YouTube Music' },
            ]}
          />
        </label>
        {summary?.facets.categories.length ? (
          <label className={controlsStyles['library-inline-filter']}>
            <span>Category</span>
            <LibrarySelect
              value={search.category?.[0] ?? ''}
              onValueChange={(value) =>
                update({
                  category: value ? [value] : undefined,
                  item: undefined,
                })
              }
              aria-label="Category"
              options={[
                { value: '', label: 'All categories' },
                ...summary.facets.categories.map((option) => ({
                  value: option.value,
                  label: [option.label, ' (', option.count, ')'].join(''),
                })),
              ]}
            />
          </label>
        ) : null}
      </div>
    </LibraryFilterPanel>
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
  onSelect: (element: HTMLButtonElement) => void
}) {
  if (item.kind === 'channel') {
    return (
      <MediaRowButton
        data-collection-item={item.id}
        type="button"
        className={cn(
          mediaStyles['video-channel-row'],
          selected ? mediaStyles['selected'] : undefined,
        )}
        onClick={(event) => onSelect(event.currentTarget)}
        aria-pressed={selected}
      >
        <span className={videosStyles['video-channel-avatar']}>
          {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : <User />}
        </span>
        <span className={mediaStyles['video-result-copy']} data-ui="video-result-copy">
          <strong>{item.title}</strong>
          <small>
            {countLabel(item.archiveVideoCount, 'archived video')} ·{' '}
            {countLabel(item.watchCount, 'watch')} ·{' '}
            {countLabel(item.queueVideoCount, 'queued video')}
          </small>
        </span>
        <span className={mediaStyles['video-result-date']} data-ui="video-result-date">
          {item.date ? `Latest watch ${date(item.date)}` : 'No supported watches'}
        </span>
      </MediaRowButton>
    )
  }
  return (
    <MediaRowButton
      data-collection-item={item.id}
      type="button"
      className={cn(mediaStyles['video-result'], selected ? mediaStyles['selected'] : undefined)}
      onClick={(event) => onSelect(event.currentTarget)}
      data-ui="video-result"
      aria-pressed={selected}
    >
      <span className={videosStyles['video-thumbnail']}>
        {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : <YoutubeLogo />}
      </span>
      <span className={mediaStyles['video-result-copy']} data-ui="video-result-copy">
        <strong>{item.title}</strong>
        <span>{item.channelTitle ?? 'Channel unavailable'}</span>
        <small>
          {view === 'archive'
            ? `Watched ${date(item.date)} · ${item.matchingWatchCount === item.watchCount ? countLabel(item.watchCount, 'watch') : `${item.matchingWatchCount.toLocaleString()} of ${countLabel(item.watchCount, 'watch')}`}${item.inQueue ? ' · In Queue' : ''}`
            : `Added ${date(item.date)} · ${countLabel(item.matchingQueueAccountCount, 'account')}${item.inArchive ? ` · ${countLabel(item.watchCount, 'watch')}` : ''}`}
        </small>
        {item.durationMs !== null || item.publishedAt !== null ? (
          <small className={videosStyles['video-list-extra']}>
            {duration(item.durationMs)} ·{' '}
            {item.publishedAt ? `Published ${date(item.publishedAt)}` : 'Publish date unavailable'}
          </small>
        ) : null}
      </span>
    </MediaRowButton>
  )
}

function VideoInspector({ id, onClose }: { id: string; onClose: () => void }) {
  const inspectorRef = useInspectorFocus(onClose, id)
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
  const channelId = detail.data?.channelId ?? ''
  const channel = useQuery({
    ...videoChannelQueryOptions(channelId),
    enabled: tab === 'channel' && Boolean(channelId),
  })
  const channelArchive = useInfiniteQuery({
    ...channelVideosQueryOptions(channelId, 'archive'),
    enabled: tab === 'channel' && Boolean(channelId),
  })
  const channelQueue = useInfiniteQuery({
    ...channelVideosQueryOptions(channelId, 'queue'),
    enabled: tab === 'channel' && Boolean(channelId),
  })

  return (
    <aside
      ref={inspectorRef}
      className={inspectorStyles['media-inspector']}
      aria-label="Video inspector"
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
            aria-label="Video details"
          >
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="history">Watch history</TabsTrigger>
            <TabsTrigger value="channel">Channel</TabsTrigger>
          </TabsList>
        </InspectorHeader>
        <div className={inspectorStyles['inspector-scroll']} data-ui="inspector-scroll">
          {detail.isPending ? (
            <InspectorStatePanels values={['details', 'history', 'channel']}>
              <LoadingState>Loading…</LoadingState>
            </InspectorStatePanels>
          ) : detail.isError ? (
            <InspectorStatePanels values={['details', 'history', 'channel']}>
              <Notice>
                <p>{detail.error.message}</p>
                <Button variant="outline" onClick={() => void detail.refetch()}>
                  Try again
                </Button>
              </Notice>
            </InspectorStatePanels>
          ) : detail.data ? (
            <>
              <div
                className={cn(
                  inspectorStyles['inspector-hero'],
                  videosStyles['video-inspector-hero'],
                )}
                data-ui="inspector-hero"
              >
                <span className={videosStyles['video-thumbnail']}>
                  {detail.data.imageUrl ? (
                    <img src={detail.data.imageUrl} alt="" />
                  ) : (
                    <YoutubeLogo />
                  )}
                </span>
                <div>
                  <span className={contentStyles['eyebrow']} data-ui="eyebrow">
                    Video
                  </span>
                  <h2>{detail.data.title}</h2>
                  <p>{detail.data.channelTitle ?? 'Channel unavailable'}</p>
                </div>
              </div>

              {
                <TabsContent value="details" className={inspectorStyles['inspector-tab-panel']}>
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
                            ? detail.data.formats
                                .map((value) => value.replaceAll('_', ' '))
                                .join(', ')
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
                        <ul className={inspectorStyles['history-list']}>
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
                      Open on YouTube <ArrowSquareOut />
                    </a>
                  </section>
                </TabsContent>
              }
              {
                <TabsContent value="history" className={inspectorStyles['inspector-tab-panel']}>
                  <section>
                    <h3>Watch history</h3>
                    {history.isPending ? <LoadingState>Loading watch history…</LoadingState> : null}
                    {history.isError ? (
                      <Notice>
                        <p>Watch history could not be loaded.</p>
                        <Button
                          variant="outline"
                          disabled={history.isFetching}
                          onClick={() =>
                            void (history.isFetchNextPageError
                              ? history.fetchNextPage()
                              : history.refetch())
                          }
                        >
                          Try again
                        </Button>
                      </Notice>
                    ) : null}
                    {history.isSuccess &&
                    history.data.pages.every((page) => page.data.length === 0) ? (
                      <p>No supported watches.</p>
                    ) : null}
                    <ol className={inspectorStyles['history-list']}>
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
                      <Button
                        variant="outline"
                        className={workspaceStyles['load-more']}
                        type="button"
                        disabled={history.isFetching}
                        onClick={() => void history.fetchNextPage()}
                      >
                        Load more history
                      </Button>
                    ) : null}
                  </section>
                </TabsContent>
              }
              {
                <TabsContent value="channel" className={inspectorStyles['inspector-tab-panel']}>
                  <section>
                    <h3>Channel</h3>
                    {detail.data.channelId === null ? (
                      <p>This Takeout record did not provide an exact channel identity.</p>
                    ) : channel.isPending ? (
                      <LoadingState>Loading…</LoadingState>
                    ) : channel.data ? (
                      <>
                        <p>{channel.data.title}</p>
                        <p>
                          {countLabel(channel.data.archiveVideoCount, 'archived video')} ·{' '}
                          {countLabel(channel.data.watchCount, 'watch')}
                        </p>
                        <ChannelPreview
                          title="Recently watched"
                          items={channelArchive.data?.pages[0]?.data.slice(0, 5) ?? []}
                          pending={channelArchive.isPending}
                          error={channelArchive.isError}
                          onRetry={() => void channelArchive.refetch()}
                        />
                        <ChannelPreview
                          title="Recently queued"
                          items={channelQueue.data?.pages[0]?.data.slice(0, 5) ?? []}
                          pending={channelQueue.isPending}
                          error={channelQueue.isError}
                          onRetry={() => void channelQueue.refetch()}
                        />
                        <a href={channel.data.canonicalUrl} target="_blank" rel="noreferrer">
                          Open channel <ArrowSquareOut />
                        </a>
                      </>
                    ) : (
                      <Notice>
                        <p>Channel details are unavailable.</p>
                        <Button variant="outline" onClick={() => void channel.refetch()}>
                          Try again
                        </Button>
                      </Notice>
                    )}
                  </section>
                </TabsContent>
              }
            </>
          ) : null}
        </div>
      </Tabs>
    </aside>
  )
}

function ChannelPreview({
  title,
  items,
  pending,
  error,
  onRetry,
}: {
  title: string
  items: VideoCollectionItem[]
  pending: boolean
  error: boolean
  onRetry: () => void
}) {
  return (
    <div>
      <h3>{title}</h3>
      {pending ? (
        <LoadingState>Loading…</LoadingState>
      ) : error ? (
        <Notice>
          <p>{title} videos could not be loaded.</p>
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </Notice>
      ) : items.length ? (
        <ol className={inspectorStyles['history-list']}>
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
  const inspectorRef = useInspectorFocus(onClose, id)
  const [tab, setTab] = useState<'details' | 'library'>('details')
  const [membership, setMembership] = useState<'archive' | 'queue'>('archive')
  const detail = useQuery(videoChannelQueryOptions(id))
  return (
    <aside
      ref={inspectorRef}
      className={inspectorStyles['media-inspector']}
      aria-label="Channel inspector"
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
            aria-label="Channel details"
          >
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="library">Library</TabsTrigger>
          </TabsList>
        </InspectorHeader>
        <div className={inspectorStyles['inspector-scroll']} data-ui="inspector-scroll">
          {detail.isPending ? (
            <InspectorStatePanels values={['details', 'library']}>
              <LoadingState>Loading…</LoadingState>
            </InspectorStatePanels>
          ) : detail.isError ? (
            <InspectorStatePanels values={['details', 'library']}>
              <Notice>
                <p>{detail.error.message}</p>
                <Button variant="outline" onClick={() => void detail.refetch()}>
                  Try again
                </Button>
              </Notice>
            </InspectorStatePanels>
          ) : detail.data ? (
            <>
              <div className={inspectorStyles['inspector-hero']} data-ui="inspector-hero">
                <span className={videosStyles['video-channel-avatar']}>
                  {detail.data.imageUrl ? <img src={detail.data.imageUrl} alt="" /> : <User />}
                </span>
                <div>
                  <span className={contentStyles['eyebrow']} data-ui="eyebrow">
                    Channel
                  </span>
                  <h2>{detail.data.title}</h2>
                  <p>{countLabel(detail.data.archiveVideoCount, 'archived video')}</p>
                </div>
              </div>

              {
                <TabsContent value="details" className={inspectorStyles['inspector-tab-panel']}>
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
                      Open on YouTube <ArrowSquareOut />
                    </a>
                  </section>
                </TabsContent>
              }
              {
                <TabsContent value="library" className={inspectorStyles['inspector-tab-panel']}>
                  <section>
                    <h3>Library</h3>
                    <Tabs
                      value={membership}
                      onValueChange={(value) => setMembership(value as typeof membership)}
                    >
                      <TabsList variant="line" className={inspectorStyles['inspector-tabs']}>
                        <TabsTrigger value="archive">Archive</TabsTrigger>
                        <TabsTrigger value="queue">Queue</TabsTrigger>
                      </TabsList>
                      {(['archive', 'queue'] as const).map((value) => (
                        <TabsContent
                          key={value}
                          value={value}
                          className={inspectorStyles['inspector-tab-panel']}
                        >
                          <ChannelLibraryPanel
                            id={id}
                            membership={value}
                            enabled={tab === 'library' && membership === value}
                          />
                        </TabsContent>
                      ))}
                    </Tabs>
                  </section>
                </TabsContent>
              }
            </>
          ) : null}
        </div>
      </Tabs>
    </aside>
  )
}

function ChannelLibraryPanel({
  id,
  membership,
  enabled,
}: {
  id: string
  membership: 'archive' | 'queue'
  enabled: boolean
}) {
  const library = useInfiniteQuery({
    ...channelVideosQueryOptions(id, membership),
    enabled,
  })
  return (
    <>
      {library.isPending ? <LoadingState>Loading videos…</LoadingState> : null}
      {library.isError ? (
        <Notice>
          <p>{library.error.message}</p>
          <Button
            variant="outline"
            disabled={library.isFetching}
            onClick={() =>
              void (library.isFetchNextPageError ? library.fetchNextPage() : library.refetch())
            }
          >
            Try again
          </Button>
        </Notice>
      ) : null}
      {library.isSuccess && library.data.pages.every((page) => page.data.length === 0) ? (
        <p>{membership === 'queue' ? 'No queued videos.' : 'No archived videos.'}</p>
      ) : null}
      <ol className={inspectorStyles['history-list']}>
        {library.data?.pages
          .flatMap((page) => page.data)
          .map((item) => (
            <li
              key={item.id}
              className={inspectorStyles['channel-library-video']}
              data-ui="channel-library-video"
            >
              <span className={videosStyles['video-thumbnail']}>
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" loading="lazy" />
                ) : (
                  <YoutubeLogo aria-hidden="true" />
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
        <Button
          variant="outline"
          className={workspaceStyles['load-more']}
          type="button"
          disabled={library.isFetching}
          onClick={() => void library.fetchNextPage()}
        >
          Load more videos
        </Button>
      ) : null}
    </>
  )
}
