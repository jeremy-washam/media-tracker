import { CollectionPagination } from '@/components/collection-pagination'
import { useCollectionScroll } from '@/components/collection-scroll'
import { articlesQueryOptions } from '../../library-queries'
import { InspectorBackdrop, MediaRowButton } from '@/components/library-controls'
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
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { LibrarySelect } from '../../components/library-controls'
import {
  useLiveSearch,
  useInspectorPresence,
  useLibrarySectionCounts,
} from '../../components/library-hooks'
import { useEffect, useRef, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import {
  ArrowDown,
  ArrowDownWideNarrow,
  ArrowUp,
  ChevronRight,
  ExternalLink,
  FileText,
  ListFilter,
  Search,
  X,
} from 'lucide-react'
import type { ArticleCollectionItem, ArticleDetail } from '@media-tracker/contracts'
import {
  fetchArticle,
  fetchArticleHighlights,
  fetchArticleHistory,
  fetchArticles,
} from './articles-api'
import { normalizedForArticleSection, type ArticlesRouteSearch } from './articles-route-search'

type Section = 'archive' | 'queue' | 'feed'

function displayPublication(value: string | null): string | null {
  return value === 'readwise-upload-pdf' ? 'PDF upload' : value
}

function formatDate(value: string | null): string | null {
  if (!value) return null
  if (/^\d{4}$/.test(value)) return value
  if (/^\d{4}-\d{2}$/.test(value))
    return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short' }).format(
      new Date(`${value}-01T12:00:00`),
    )
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(date)
}
function fact(item: ArticleCollectionItem, section: Section): string {
  if (section === 'archive')
    return item.archive.latestAt
      ? `Archived ${formatDate(item.archive.latestAt)}`
      : 'Archived — date unknown'
  if (section === 'queue')
    return `${item.queue.state ? item.queue.state[0]!.toUpperCase() + item.queue.state.slice(1) : 'Queue'}${item.queue.addedAt ? ` · ${formatDate(item.queue.addedAt)}` : ''}`
  return item.feed.arrivedAt ? `Arrived ${formatDate(item.feed.arrivedAt)}` : 'Arrival date unknown'
}
function defaultSort(section: Section, search: ArticlesRouteSearch) {
  return (
    search.sort ??
    (search.q
      ? 'relevance'
      : section === 'archive'
        ? 'archivedAt'
        : section === 'queue'
          ? 'addedAt'
          : 'arrivedAt')
  )
}
function defaultDirection(sort: string, direction?: 'asc' | 'desc') {
  if (sort === 'relevance') return 'asc'
  return (
    direction ?? (['title', 'author', 'publication', 'queueState'].includes(sort) ? 'asc' : 'desc')
  )
}

export function ArticlesCollectionPage({ section }: { section: Section }) {
  const raw = useSearch({ strict: false }) as ArticlesRouteSearch
  const search = normalizedForArticleSection(raw, section)
  const navigate = useNavigate()
  const [draft, setDraft] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const selectedRef = useRef<HTMLButtonElement>(null)
  const update = (patch: Partial<ArticlesRouteSearch>) => {
    const next = { ...search, ...patch }
    for (const [key, value] of Object.entries(next))
      if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0))
        delete next[key as keyof ArticlesRouteSearch]
    void navigate({ to: `/library/articles/${section}`, search: next })
  }
  useLiveSearch(
    draft,
    search.q,
    (q) => update({ q, item: undefined }),
    () => setDraft(null),
  )
  const inspectorItem = useInspectorPresence(search.item)
  const queryOptions = articlesQueryOptions(section, search)
  const articles = useInfiniteQuery(queryOptions)
  const pages = articles.data?.pages ?? []
  const items = pages.flatMap((page) => page.data)
  const collectionRef = useCollectionScroll(queryOptions.queryKey, 'list', items.length)
  const summary = pages[0]
  const sectionCounts = useLibrarySectionCounts('articles', summary, (page) => page.sectionCounts)
  const sort = defaultSort(section, search),
    direction = defaultDirection(sort, search.direction)
  const activeFilters = [
    Boolean(search.type?.length),
    Boolean(search.author?.length),
    Boolean(search.publication?.length),
    Boolean(search.publishedFrom || search.publishedTo || search.publishedUnknown),
    Boolean(search.readingTime?.length),
    Boolean(search.progress?.length),
    section === 'archive'
      ? Boolean(search.archivedFrom || search.archivedTo || search.archivedUnknown)
      : section === 'queue'
        ? Boolean(search.addedFrom || search.addedTo || search.addedUnknown)
        : Boolean(search.arrivedFrom || search.arrivedTo || search.arrivedUnknown),
    section === 'archive'
      ? Boolean(search.currentState?.length)
      : section === 'queue'
        ? Boolean(search.queueState?.length)
        : Boolean(search.opened?.length),
    section === 'feed' && Boolean(search.history?.length),
  ].filter(Boolean).length
  const close = () => {
    const target = selectedRef.current
    update({ item: undefined })
    requestAnimationFrame(() => target?.focus({ preventScroll: true }))
  }
  return (
    <FlatTabs
      value={section}
      render={<section />}
      data-inspector-open={Boolean(search.item)}
      className={`books-page articles-page articles-density-expanded`}
      aria-labelledby="articles-title"
    >
      <FlatTabsContent value={section} className="books-collection" ref={collectionRef}>
        <h1 className="sr-only" id="articles-title">
          Articles
        </h1>
        <CollectionTabList aria-label="Article sections">
          {(['archive', 'queue', 'feed'] as const).map((target) => (
            <Link
              key={target}
              to={`/library/articles/${target}`}
              search={normalizedForArticleSection(search, target)}
              activeProps={{ 'aria-current': 'page', className: 'active' }}
            >
              {target[0]!.toUpperCase() + target.slice(1)}{' '}
              <span>{sectionCounts?.[target]?.toLocaleString() ?? '—'}</span>
            </Link>
          ))}
        </CollectionTabList>
        <div className="books-toolbar">
          <form
            className="books-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault()
              const value = (draft ?? search.q ?? '').trim()
              setDraft(null)
              update({
                q: value || undefined,
                sort: undefined,
                direction: undefined,
                item: undefined,
              })
            }}
          >
            <InputGroup>
              <InputGroupInput
                aria-label="Search articles"
                placeholder="Search title, author, publication, notes, or highlights"
                value={draft ?? search.q ?? ''}
                onChange={(event) => setDraft(event.target.value)}
              />
              <InputGroupAddon>
                <Search aria-hidden="true" />
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
                        sort: undefined,
                        direction: undefined,
                        item: undefined,
                      })
                    }}
                  >
                    <X aria-hidden="true" />
                  </InputGroupButton>
                </InputGroupAddon>
              ) : null}
            </InputGroup>
          </form>
          <Button
            variant={activeFilters ? 'secondary' : 'outline'}
            type="button"
            className="toolbar-button"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((value) => !value)}
          >
            <ListFilter aria-hidden="true" /> Filters{' '}
            {activeFilters ? <span>{activeFilters}</span> : null}
          </Button>
          <label className="books-sort">
            <ArrowDownWideNarrow aria-hidden="true" />
            <span className="sr-only">Sort articles</span>
            <LibrarySelect
              aria-label="Sort articles"
              value={sort}
              onValueChange={(value) =>
                update({ sort: value, direction: undefined, item: undefined })
              }
              options={[
                ...sortOptions(section, Boolean(search.q)).map(([value, label]) => ({
                  value: String(value),
                  label,
                })),
              ]}
            />
          </label>
          <Button
            variant="outline"
            size="icon"
            type="button"
            className="sort-direction"
            disabled={sort === 'relevance'}
            aria-label={direction === 'asc' ? 'Sort descending' : 'Sort ascending'}
            onClick={() =>
              update({ sort, direction: direction === 'asc' ? 'desc' : 'asc', item: undefined })
            }
          >
            {direction === 'asc' ? (
              <ArrowUp aria-hidden="true" />
            ) : (
              <ArrowDown aria-hidden="true" />
            )}
          </Button>
        </div>
        {filtersOpen ? (
          <ArticleFilters section={section} search={search} summary={summary} onChange={update} />
        ) : null}
        <div className="books-result-summary" aria-live="polite">
          <span>
            {articles.isPending
              ? null
              : `${(summary?.filteredCount ?? 0).toLocaleString()} of ${(summary?.totalCount ?? 0).toLocaleString()} ${(summary?.totalCount ?? 0) === 1 ? 'article' : 'articles'}${section === 'archive' && summary?.occurrenceCount != null ? ` · ${summary.occurrenceCount.toLocaleString()} archive ${summary.occurrenceCount === 1 ? 'occurrence' : 'occurrences'}` : ''}`}
          </span>
          {summary?.coverage.lastSuccessfulSyncAt ? (
            <small>Reader synced {formatDate(summary.coverage.lastSuccessfulSyncAt)}</small>
          ) : null}
        </div>
        {articles.isPending ? (
          <LoadingState className="books-loading">Loading articles…</LoadingState>
        ) : null}
        {articles.isError && !articles.isFetchNextPageError ? (
          <Notice className="books-state books-state-error">
            <h2>Articles could not be loaded</h2>
            <p>{articles.error.message}</p>
            <Button variant="outline" type="button" onClick={() => void articles.refetch()}>
              Try again
            </Button>
          </Notice>
        ) : null}
        {!articles.isPending && !articles.isError && !items.length ? (
          <div className="books-state">
            <FileText aria-hidden="true" />
            <h2>
              {activeFilters || search.q ? 'No matching articles' : `No articles in ${section}`}
            </h2>
            <p>
              {activeFilters || search.q
                ? 'Clear search or filters to broaden this view.'
                : 'Sync Readwise from Connections to populate this section.'}
            </p>
            {activeFilters || search.q ? (
              <Button variant="outline" type="button" onClick={() => update(clearFilters())}>
                Clear search and filters
              </Button>
            ) : (
              <Link to="/connections">Open Connections</Link>
            )}
          </div>
        ) : null}
        {items.length ? (
          <div className="articles-list">
            {items.map((item) => (
              <ArticleRow
                key={item.id}
                item={item}
                section={section}
                expanded={true}
                selected={search.item === item.id}
                ref={search.item === item.id ? selectedRef : undefined}
                onClick={() => update({ item: search.item === item.id ? undefined : item.id })}
              />
            ))}
          </div>
        ) : null}
        <CollectionPagination
          query={articles}
          scrollRef={collectionRef}
          itemCount={items.length}
          label="articles"
        />
      </FlatTabsContent>
      {inspectorItem ? (
        <>
          <InspectorBackdrop
            type="button"
            className="inspector-backdrop"
            aria-label="Close inspector"
            onClick={close}
          />
          <ArticleInspector id={inspectorItem} onClose={close} />
        </>
      ) : null}
    </FlatTabs>
  )
}

function ArticleRow({
  item,
  section,
  expanded,
  selected,
  onClick,
  ref,
}: {
  item: ArticleCollectionItem
  section: Section
  expanded: boolean
  selected: boolean
  onClick: () => void
  ref?: React.Ref<HTMLButtonElement> | undefined
}) {
  return (
    <MediaRowButton
      data-collection-item={item.id}
      ref={ref}
      type="button"
      className={selected ? 'article-row selected' : 'article-row'}
      aria-pressed={selected}
      onClick={onClick}
    >
      {item.imageUrl ? (
        <img src={item.imageUrl} alt="" loading="lazy" />
      ) : (
        <span className="article-thumbnail">
          <FileText aria-hidden="true" />
        </span>
      )}
      <span className="article-row-copy">
        <strong>{item.title}</strong>
        <small>
          {[item.author, displayPublication(item.publication)].filter(Boolean).join(' · ') ||
            'Source unavailable'}
        </small>
        {expanded ? (
          <em>
            {[
              item.readingTime.minutes == null
                ? null
                : `${Math.round(item.readingTime.minutes)} min`,
              item.publishedAt ? `Published ${formatDate(item.publishedAt.value)}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </em>
        ) : null}
        {item.searchExcerpt?.text ? (
          <span className="article-search-excerpt">
            <b>{item.searchExcerpt.source}</b> ·{item.searchExcerpt.text}
          </span>
        ) : null}
      </span>
      <span className="article-row-fact">{fact(item, section)}</span>
      <ChevronRight aria-hidden="true" />
    </MediaRowButton>
  )
}

function sortOptions(section: Section, search: boolean): Array<[string, string]> {
  const result: Array<[string, string]> = [
    [
      section === 'archive' ? 'archivedAt' : section === 'queue' ? 'addedAt' : 'arrivedAt',
      section === 'archive' ? 'Archived date' : section === 'queue' ? 'Added date' : 'Arrival date',
    ],
    ['publishedAt', 'Published date'],
    ['title', 'Title'],
    ['author', 'Author'],
    ['publication', 'Publication'],
    ['readingTime', 'Reading time'],
  ]
  if (section === 'archive') result.splice(1, 0, ['addedAt', 'Date added to Reader'])
  if (section === 'queue') result.splice(1, 0, ['queueState', 'Queue state'])
  if (search) result.unshift(['relevance', 'Relevance'])
  return result
}
function clearFilters(): Partial<ArticlesRouteSearch> {
  return {
    q: undefined,
    type: undefined,
    author: undefined,
    publication: undefined,
    publishedFrom: undefined,
    publishedTo: undefined,
    publishedUnknown: undefined,
    readingTime: undefined,
    progress: undefined,
    archivedFrom: undefined,
    archivedTo: undefined,
    archivedUnknown: undefined,
    currentState: undefined,
    queueState: undefined,
    addedFrom: undefined,
    addedTo: undefined,
    addedUnknown: undefined,
    arrivedFrom: undefined,
    arrivedTo: undefined,
    arrivedUnknown: undefined,
    opened: undefined,
    history: undefined,
    item: undefined,
  }
}

function toggled<T extends string>(selected: T[] | undefined, value: T): T[] | undefined {
  const current = selected ?? []
  const next = current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value]
  return next.length > 0 ? next : undefined
}

function ArticleFilters({
  section,
  search,
  summary,
  onChange,
}: {
  section: Section
  search: ArticlesRouteSearch
  summary: Awaited<ReturnType<typeof fetchArticles>> | undefined
  onChange: (patch: Partial<ArticlesRouteSearch>) => void
}) {
  return (
    <section className="filter-panel" aria-label="Article filters">
      <div className="filter-panel-heading">
        <strong> Filters</strong>
        <Button variant="outline" type="button" onClick={() => onChange(clearFilters())}>
          Clear all
        </Button>
      </div>
      <div className="filter-panel-grid">
        <FacetGroup
          title="Type"
          values={summary?.facets.types ?? []}
          selected={search.type ?? []}
          onToggle={(value) =>
            onChange({
              type: toggled(search.type, value as NonNullable<ArticlesRouteSearch['type']>[number]),
              item: undefined,
            })
          }
        />
        <FacetGroup
          title="Author"
          values={summary?.facets.authors ?? []}
          selected={search.author ?? []}
          searchable
          onToggle={(value) => onChange({ author: toggled(search.author, value), item: undefined })}
        />
        <FacetGroup
          title="Publication"
          values={summary?.facets.publications ?? []}
          selected={search.publication ?? []}
          searchable
          onToggle={(value) =>
            onChange({ publication: toggled(search.publication, value), item: undefined })
          }
        />
        <FacetGroup
          title="Reading time"
          values={summary?.facets.readingTimes ?? []}
          selected={search.readingTime ?? []}
          onToggle={(value) =>
            onChange({
              readingTime: toggled(
                search.readingTime,
                value as NonNullable<ArticlesRouteSearch['readingTime']>[number],
              ),
              item: undefined,
            })
          }
        />
        <FacetGroup
          title="Progress"
          values={summary?.facets.progress ?? []}
          selected={search.progress ?? []}
          onToggle={(value) =>
            onChange({
              progress: toggled(
                search.progress,
                value as NonNullable<ArticlesRouteSearch['progress']>[number],
              ),
              item: undefined,
            })
          }
        />
        <DateSelect
          label="Published date"
          from={search.publishedFrom}
          to={search.publishedTo}
          includeUnknown={search.publishedUnknown}
          onChange={(publishedFrom, publishedTo, publishedUnknown) =>
            onChange({ publishedFrom, publishedTo, publishedUnknown, item: undefined })
          }
        />
        {section === 'archive' ? (
          <>
            <DateSelect
              label="Archived date"
              from={search.archivedFrom}
              to={search.archivedTo}
              includeUnknown={search.archivedUnknown}
              onChange={(archivedFrom, archivedTo, archivedUnknown) =>
                onChange({ archivedFrom, archivedTo, archivedUnknown, item: undefined })
              }
            />
            <FacetGroup
              title="Current Reader state"
              values={summary?.facets.currentStates ?? []}
              selected={search.currentState ?? []}
              onToggle={(value) =>
                onChange({
                  currentState: toggled(
                    search.currentState,
                    value as NonNullable<ArticlesRouteSearch['currentState']>[number],
                  ),
                  item: undefined,
                })
              }
            />
          </>
        ) : null}
        {section === 'queue' ? (
          <>
            <DateSelect
              label="Added date"
              from={search.addedFrom}
              to={search.addedTo}
              includeUnknown={search.addedUnknown}
              onChange={(addedFrom, addedTo, addedUnknown) =>
                onChange({ addedFrom, addedTo, addedUnknown, item: undefined })
              }
            />
            <FacetGroup
              title="Queue state"
              values={summary?.facets.queueStates ?? []}
              selected={search.queueState ?? []}
              onToggle={(value) =>
                onChange({
                  queueState: toggled(
                    search.queueState,
                    value as NonNullable<ArticlesRouteSearch['queueState']>[number],
                  ),
                  item: undefined,
                })
              }
            />
          </>
        ) : null}
        {section === 'feed' ? (
          <>
            <DateSelect
              label="Arrival date"
              from={search.arrivedFrom}
              to={search.arrivedTo}
              includeUnknown={search.arrivedUnknown}
              onChange={(arrivedFrom, arrivedTo, arrivedUnknown) =>
                onChange({ arrivedFrom, arrivedTo, arrivedUnknown, item: undefined })
              }
            />
            <FacetGroup
              title="Opened"
              values={summary?.facets.opened ?? []}
              selected={search.opened ?? []}
              onToggle={(value) =>
                onChange({
                  opened: toggled(
                    search.opened,
                    value as NonNullable<ArticlesRouteSearch['opened']>[number],
                  ),
                  item: undefined,
                })
              }
            />
            <FacetGroup
              title="Archive history"
              values={summary?.facets.history ?? []}
              selected={search.history ?? []}
              onToggle={(value) =>
                onChange({
                  history: toggled(
                    search.history,
                    value as NonNullable<ArticlesRouteSearch['history']>[number],
                  ),
                  item: undefined,
                })
              }
            />
          </>
        ) : null}
      </div>
    </section>
  )
}
function FacetGroup({
  title,
  values,
  selected,
  searchable = false,
  onToggle,
}: {
  title: string
  values: Array<{ value: string; label: string; count?: number }>
  selected: string[]
  searchable?: boolean
  onToggle: (value: string) => void
}) {
  const [query, setQuery] = useState('')
  const merged: Array<{ value: string; label: string; count?: number }> = [
    ...values,
    ...selected
      .filter((value) => !values.some((facet) => facet.value === value))
      .map((value) => ({ value, label: value })),
  ]
  const visible = merged.filter((facet) =>
    facet.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  )
  return (
    <fieldset className="filter-group">
      <legend>{title}</legend>
      {searchable ? (
        <Input
          className="facet-search"
          type="search"
          aria-label={`Search ${title.toLocaleLowerCase()}`}
          placeholder={`Search ${title.toLocaleLowerCase()}`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      ) : null}
      <div>
        {visible.map((facet) => (
          <FieldLabel key={facet.value}>
            <Checkbox
              checked={selected.includes(facet.value)}
              onCheckedChange={() => onToggle(facet.value)}
            />
            <span>{facet.label}</span>
            {facet.count === undefined ? null : <small>{facet.count}</small>}
          </FieldLabel>
        ))}
      </div>
    </fieldset>
  )
}
function DateSelect({
  label,
  from,
  to,
  includeUnknown,
  onChange,
}: {
  label: string
  from: string | undefined
  to: string | undefined
  includeUnknown: boolean | undefined
  onChange: (from?: string, to?: string, includeUnknown?: true) => void
}) {
  return (
    <fieldset className="date-filter">
      <legend>{label}</legend>
      <span>
        <Input
          type="date"
          aria-label={`${label} from`}
          value={from ?? ''}
          onChange={(event) =>
            onChange(event.target.value || undefined, to, includeUnknown ? true : undefined)
          }
        />
        <Input
          type="date"
          aria-label={`${label} to`}
          value={to ?? ''}
          onChange={(event) =>
            onChange(from, event.target.value || undefined, includeUnknown ? true : undefined)
          }
        />
      </span>
      <FieldLabel className="movie-filter-check">
        <Checkbox
          checked={includeUnknown ?? false}
          onCheckedChange={(checked) => onChange(from, to, checked ? true : undefined)}
        />{' '}
        Include unknown
      </FieldLabel>
    </fieldset>
  )
}

function ArticleInspector({ id, onClose }: { id: string; onClose: () => void }) {
  const [tab, setTab] = useState<'details' | 'history'>('details')
  const ref = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  const article = useQuery({
    queryKey: ['article', id],
    queryFn: ({ signal }) => fetchArticle(id, signal),
  })
  const history = useInfiniteQuery({
    queryKey: ['article-history', id],
    enabled: tab === 'history',
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => fetchArticleHistory(id, pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })
  const highlights = useInfiniteQuery({
    queryKey: ['article-highlights', id],
    enabled: tab === 'history',
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => fetchArticleHighlights(id, pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('.inspector-close')?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current()
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [id])
  return (
    <aside ref={ref} className="book-inspector article-inspector" aria-label="Article inspector">
      <Tabs
        className="inspector-tab-root"
        value={tab}
        onValueChange={(value) => setTab(value as typeof tab)}
      >
        <div className="inspector-topbar">
          <TabsList variant="line" className="inspector-tabs">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
          <Button
            variant="ghost"
            size="icon"
            className="inspector-close"
            type="button"
            aria-label="Close inspector"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
        {article.isPending ? (
          <LoadingState className="inspector-state">Loading article…</LoadingState>
        ) : null}
        {article.isError ? (
          <Notice className="inspector-state">{article.error.message}</Notice>
        ) : null}
        {
          <TabsContent value="details" className="inspector-tab-panel">
            {article.data ? <ArticleDetails article={article.data} /> : null}
          </TabsContent>
        }
        {
          <TabsContent value="history" className="inspector-tab-panel">
            {article.data ? (
              <div className="inspector-scroll">
                <section className="inspector-section">
                  <h3>Reader activity</h3>
                  <dl className="detail-list">
                    <dt>Current state</dt>
                    <dd>
                      {article.data.currentAvailable
                        ? article.data.currentLocation
                        : `Unavailable · last known ${article.data.currentLocation}`}
                    </dd>
                    <dt>First opened</dt>
                    <dd>{formatDate(article.data.dates.firstOpenedAt) ?? 'Not observed'}</dd>
                    <dt>Last opened</dt>
                    <dd>{formatDate(article.data.dates.lastOpenedAt) ?? 'Not observed'}</dd>
                    <dt>Progress</dt>
                    <dd>
                      {article.data.progress.valid && article.data.progress.value != null
                        ? `${Math.round(article.data.progress.value * 100)}%`
                        : 'Unknown'}
                    </dd>
                    <dt>Observed</dt>
                    <dd>{formatDate(article.data.dates.observedAt) ?? 'Unknown'}</dd>
                  </dl>
                  {article.data.documentNote ? (
                    <div className="article-note">
                      <strong>Document note</strong>
                      <p>{article.data.documentNote}</p>
                    </div>
                  ) : null}
                  {article.data.highlightDocumentNote ? (
                    <div className="article-note">
                      <strong>Highlight note</strong>
                      <p>{article.data.highlightDocumentNote}</p>
                    </div>
                  ) : null}
                </section>
                <section className="inspector-section">
                  <h3>Archive history</h3>
                  {history.isPending ? (
                    <LoadingState>Loading history…</LoadingState>
                  ) : history.isError ? (
                    <Notice>History could not be loaded: {history.error.message}</Notice>
                  ) : history.data?.pages.every((page) => page.data.length === 0) ? (
                    <p>No archive history.</p>
                  ) : (
                    history.data?.pages
                      .flatMap((page) => page.data)
                      .map((entry) => (
                        <article className="article-history-entry" key={entry.archiveEntryId}>
                          <strong>
                            {entry.archivedAt
                              ? `Archived ${formatDate(entry.archivedAt.value)}`
                              : 'Archived — date unknown'}
                          </strong>
                          <span>
                            {entry.disposition === 'current'
                              ? 'Currently in Archive'
                              : 'Retained history'}{' '}
                            · {entry.connection.label}
                            {entry.sourceRecordedAt
                              ? ` · Source recorded ${formatDate(entry.sourceRecordedAt.value)}`
                              : ''}
                          </span>
                        </article>
                      ))
                  )}
                  {history.hasNextPage ? (
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => void history.fetchNextPage()}
                    >
                      Load more
                    </Button>
                  ) : null}
                </section>
                <section className="inspector-section">
                  <h3>Highlights and notes</h3>
                  {highlights.isPending ? (
                    <LoadingState>Loading highlights…</LoadingState>
                  ) : highlights.isError ? (
                    <Notice>Highlights could not be loaded: {highlights.error.message}</Notice>
                  ) : (
                    highlights.data?.pages
                      .flatMap((page) => page.data)
                      .map((item) => (
                        <blockquote key={item.id}>
                          {item.text ? <p>{item.text}</p> : null}
                          {item.note ? <footer>{item.note}</footer> : null}
                        </blockquote>
                      ))
                  )}
                  {!highlights.isPending &&
                  !highlights.isError &&
                  !highlights.data?.pages.some((page) => page.data.length) ? (
                    <p>No active highlights.</p>
                  ) : null}
                  {highlights.hasNextPage ? (
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => void highlights.fetchNextPage()}
                    >
                      Load more
                    </Button>
                  ) : null}
                </section>
              </div>
            ) : null}
          </TabsContent>
        }
      </Tabs>
    </aside>
  )
}
function ArticleDetails({ article }: { article: ArticleDetail }) {
  return (
    <div className="inspector-scroll">
      <header className="inspector-book-heading article-inspector-heading">
        {article.imageUrl ? <img src={article.imageUrl} alt="" /> : <FileText aria-hidden="true" />}
        <div>
          <h2>{article.title}</h2>
          <p>
            {[article.author, displayPublication(article.publication)]
              .filter(Boolean)
              .join(' · ') || 'Source unavailable'}
          </p>
          <span>
            {[
              article.archive.active ? 'Archive history' : null,
              article.queue.active ? article.queue.state : null,
              article.feed.active ? 'Feed' : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            {!article.currentAvailable ? ' · Reader state unavailable' : ''}
          </span>
        </div>
      </header>
      {article.summary ? (
        <section className="inspector-section">
          <h3>Summary</h3>
          <p className="book-description">{article.summary}</p>
        </section>
      ) : null}
      <section className="inspector-section">
        <h3>Article facts</h3>
        <dl className="detail-list">
          <dt>Type</dt>
          <dd>{article.subtype}</dd>
          <dt>Author</dt>
          <dd>{article.author ?? 'Unknown'}</dd>
          <dt>Publication</dt>
          <dd>{displayPublication(article.publication) ?? 'Unknown'}</dd>
          <dt>Published</dt>
          <dd>{article.publishedAt ? formatDate(article.publishedAt.value) : 'Unknown'}</dd>
          <dt>Reading time</dt>
          <dd>
            {article.readingTime.raw ??
              (article.readingTime.minutes == null
                ? 'Unknown'
                : `${article.readingTime.minutes} min`)}
          </dd>
          <dt>Word count</dt>
          <dd>{article.wordCount?.toLocaleString() ?? 'Unknown'}</dd>
          <dt>Progress</dt>
          <dd>
            {article.progress.valid && article.progress.value != null
              ? `${Math.round(article.progress.value * 100)}%`
              : 'Unknown'}
          </dd>
          <dt>Saved</dt>
          <dd>{formatDate(article.dates.savedAt) ?? 'Unknown'}</dd>
          <dt>First opened</dt>
          <dd>{formatDate(article.dates.firstOpenedAt) ?? 'Not opened'}</dd>
          <dt>Last opened</dt>
          <dd>{formatDate(article.dates.lastOpenedAt) ?? 'Not observed'}</dd>
        </dl>
      </section>
      {article.tags.length ? (
        <section className="inspector-section">
          <h3>Tags</h3>
          <div className="article-tags">
            {article.tags.map((tag) => (
              <span key={tag.key}>{tag.name}</span>
            ))}
          </div>
        </section>
      ) : null}
      <section className="inspector-section">
        <h3>Content status</h3>
        <p>
          {article.content.available
            ? `${article.content.coverage ?? 'Full'} text available`
            : article.content.state === 'failed'
              ? `Text unavailable${article.content.failureClass ? ` · ${article.content.failureClass}` : ''}`
              : article.content.state === 'pending'
                ? 'Text acquisition pending'
                : 'Full text not acquired'}
        </p>
      </section>
      <section className="inspector-section">
        <h3>Source</h3>
        <p>
          {article.source.connectionLabel} ·{' '}
          {article.currentAvailable
            ? article.currentLocation
            : `Unavailable · last known ${article.currentLocation}`}
        </p>
        <dl className="detail-list">
          <dt>Category</dt>
          <dd>{article.sourceCategory}</dd>
          <dt>Added via</dt>
          <dd>{article.acquisitionSource ?? 'Unknown'}</dd>
          <dt>Coverage</dt>
          <dd>{article.source.coverage}</dd>
          <dt>Last observed</dt>
          <dd>{formatDate(article.source.sourceRefreshedAt) ?? 'Unknown'}</dd>
        </dl>
        <Collapsible className="article-source-details">
          <CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>
            Reader source details <ChevronRight aria-hidden="true" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="article-relationships">
              {article.readerRelationships.map((relationship) => (
                <li key={relationship.documentId}>
                  <span>
                    {relationship.available
                      ? relationship.location
                      : `Unavailable · last known ${relationship.location}`}
                  </span>
                  <small>Reader ID: {relationship.documentId}</small>
                  {relationship.readerUrl && relationship.readerUrl !== article.links.reader ? (
                    <a href={relationship.readerUrl} target="_blank" rel="noopener noreferrer">
                      Open in Reader <ExternalLink aria-hidden="true" />
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
        <div className="article-source-links">
          {article.links.original ? (
            <a href={article.links.original} target="_blank" rel="noopener noreferrer">
              Open original <ExternalLink aria-hidden="true" />
            </a>
          ) : null}
          {article.links.reader ? (
            <a href={article.links.reader} target="_blank" rel="noopener noreferrer">
              Open in Reader <ExternalLink aria-hidden="true" />
            </a>
          ) : null}
        </div>
      </section>
    </div>
  )
}
