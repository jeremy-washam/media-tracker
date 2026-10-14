import { CollectionEmptyState } from '@/components/collection-empty-state'
import { LibraryToolbar, LibraryFilterPanel } from '@/components/library-controls'
import mediaStyles from '@/components/media-presentation.module.css'
import workspaceStyles from '@/components/library-workspace.module.css'
import controlsStyles from '@/components/library-controls.module.css'
import booksStyles from '@/features/books/books.module.css'
import inspectorStyles from '@/components/inspector.module.css'
import { cn } from '@/lib/utils'
import { CollectionPagination } from '@/components/collection-pagination'
import { useCollectionScroll } from '@/components/collection-scroll'
import { booksQueryOptions } from '../../library-queries'
import { InspectorBackdrop, MediaRowButton } from '@/components/library-controls'
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
import {
  LibraryLayoutToggle,
  LibrarySelect,
  MediaCard,
  RatingStars,
} from '../../components/library-controls'
import {
  useLiveSearch,
  useLibraryLayout,
  useInspectorPresence,
  useLibrarySectionCounts,
} from '../../components/library-hooks'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import {
  ArrowDownWideNarrow,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  ChevronRight,
  ExternalLink,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'

import type { BookCollectionItem, BookDetail, BookHistoryEntry } from '@media-tracker/contracts'

import { fetchBook, fetchBookHistory } from './books-api'
import { normalizedForCollection, type BooksRouteSearch } from './books-route-search'

function formatDate(value: string | null, precision: string | null): string | null {
  if (value === null) return null
  if (precision === 'year' || /^\d{4}$/.test(value)) return value.slice(0, 4)
  const parts = value.slice(0, 10).split('-').map(Number)
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return value
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(parts[0]!, parts[1]! - 1, parts[2]!))
}

function authors(book: BookCollectionItem): string {
  if (book.authors.length === 0) return 'Author unavailable'
  if (book.authors.length === 1) return book.authors[0]!.name
  if (book.authors.length === 2) return `${book.authors[0]!.name} and ${book.authors[1]!.name}`
  return `${book.authors[0]!.name}, ${book.authors[1]!.name} +${book.authors.length - 2}`
}

function Cover({ book, size = 'card' }: { book: BookCollectionItem; size?: 'card' | 'row' }) {
  const [failed, setFailed] = useState(false)
  if (book.coverUrl !== null && !failed) {
    return (
      <img
        className={cn(mediaStyles['book-cover'], mediaStyles[`book-cover-${size}`])}
        src={book.coverUrl}
        alt={`Cover of ${book.title}`}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <span
      className={cn(
        mediaStyles['book-cover'],
        mediaStyles[`book-cover-${size}`],
        mediaStyles['book-cover-fallback'],
      )}
      style={{ '--cover-color': book.coverColor ?? 'var(--muted)' } as CSSProperties}
      role="img"
      aria-label={`No cover available for ${book.title}`}
    >
      <BookOpen aria-hidden="true" />
      <small>{book.title}</small>
    </span>
  )
}

function contextLabel(book: BookCollectionItem, collection: 'archive' | 'queue') {
  return (
    (collection === 'archive'
      ? formatDate(book.latestReadDate, book.latestReadPrecision)
      : formatDate(book.addedToHardcoverDate, 'day')) ?? '—'
  )
}

function activeFilterCount(search: BooksRouteSearch, collection: 'archive' | 'queue') {
  return (
    (search.format?.length ?? 0) +
    (search.series?.length ?? 0) +
    (search.genre?.length ?? 0) +
    (search.publishedMode ? 1 : 0) +
    (collection === 'archive' ? (search.finishedMode ? 1 : 0) + (search.ratingMode ? 1 : 0) : 0) +
    (collection === 'queue' && search.addedMode ? 1 : 0)
  )
}

function sortOptions(collection: 'archive' | 'queue'): [string, string][] {
  return collection === 'archive'
    ? [
        ['recent_read', 'Recently read'],
        ['earliest_read', 'Earliest read'],
        ['title', 'Title'],
        ['author', 'Author'],
        ['personal_rating', 'Personal rating'],
        ['published', 'Published'],
      ]
    : [
        ['added', 'Added to Hardcover'],
        ['title', 'Title'],
        ['author', 'Author'],
        ['published', 'Published'],
      ]
}

function resolvedDirection(sort: string, direction: 'asc' | 'desc' | undefined): 'asc' | 'desc' {
  if (direction !== undefined) return direction
  return sort === 'title' || sort === 'author' || sort === 'earliest_read' ? 'asc' : 'desc'
}

export function BooksCollectionPage({ collection }: { collection: 'archive' | 'queue' }) {
  const routeSearch = useSearch({ strict: false }) as BooksRouteSearch
  const search = normalizedForCollection(routeSearch, collection)
  const navigate = useNavigate()
  const [draftSearch, setDraftSearch] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const selectedResultRef = useRef<HTMLButtonElement>(null)
  const [layout, saveLayout] = useLibraryLayout(search.layout)

  const updateSearch = (patch: Partial<BooksRouteSearch>) => {
    if (patch.layout) saveLayout(patch.layout)
    const next = { ...search, ...patch }
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
        delete next[key as keyof BooksRouteSearch]
      }
    }
    void navigate({
      to: collection === 'archive' ? '/library/books/archive' : '/library/books/queue',
      search: next,
    })
  }

  useLiveSearch(
    draftSearch,
    search.q,
    (q) => updateSearch({ q, item: undefined }),
    () => setDraftSearch(null),
  )
  const inspectorItem = useInspectorPresence(search.item)
  const closeInspector = () => {
    const returnFocus = selectedResultRef.current
    updateSearch({ item: undefined })
    requestAnimationFrame(() => returnFocus?.focus({ preventScroll: true }))
  }

  const queryOptions = booksQueryOptions(collection, search)
  const books = useInfiniteQuery(queryOptions)
  const pages = books.data?.pages ?? []
  const items = pages.flatMap((page) => page.data)
  const collectionRef = useCollectionScroll(queryOptions.queryKey, layout, items.length)
  const summary = pages[0]
  const sectionCounts = useLibrarySectionCounts('books', summary, (page) => page.counts)
  const count = summary?.counts.filteredBooks ?? 0
  const filters = activeFilterCount(search, collection)
  const selectedSort = search.sort ?? (collection === 'archive' ? 'recent_read' : 'added')
  const direction = resolvedDirection(selectedSort, search.direction)

  const toggleValue = (key: 'format' | 'series' | 'genre', value: string) => {
    const current = search[key] ?? []
    updateSearch({
      [key]: current.includes(value)
        ? current.filter((candidate) => candidate !== value)
        : [...current, value],
      item: undefined,
    })
  }

  return (
    <FlatTabs
      value={collection}
      render={<section />}
      data-inspector-open={Boolean(search.item)}
      className={workspaceStyles['books-page']}
      aria-labelledby="books-title"
      data-ui="library-workspace"
      data-layout={layout}
    >
      <FlatTabsContent
        value={collection}
        className={workspaceStyles['books-collection']}
        ref={collectionRef}
        data-ui="library-collection"
      >
        <h1 className="sr-only" id="books-title">
          Books
        </h1>
        <CollectionTabList aria-label="Book collections">
          <Link
            to="/library/books/archive"
            search={normalizedForCollection(search, 'archive')}
            activeProps={{ 'aria-current': 'page' }}
          >
            Archive <span>{sectionCounts?.archive?.toLocaleString() ?? '—'}</span>
          </Link>
          <Link
            to="/library/books/queue"
            search={normalizedForCollection(search, 'queue')}
            activeProps={{ 'aria-current': 'page' }}
          >
            Queue <span>{sectionCounts?.queue?.toLocaleString() ?? '—'}</span>
          </Link>
        </CollectionTabList>
        <LibraryToolbar data-ui="library-toolbar">
          <form
            className={controlsStyles['books-search']}
            role="search"
            onSubmit={(event) => {
              event.preventDefault()
              const value = (draftSearch ?? search.q ?? '').trim()
              setDraftSearch(null)
              updateSearch({ q: value || undefined, item: undefined })
            }}
          >
            <InputGroup>
              <InputGroupInput
                aria-label="Search books"
                placeholder="Search title, author, series, or ISBN"
                value={draftSearch ?? search.q ?? ''}
                onChange={(event) => setDraftSearch(event.target.value)}
              />
              <InputGroupAddon>
                <Search aria-hidden="true" />
              </InputGroupAddon>
              {(draftSearch ?? search.q) ? (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    size="icon-xs"
                    type="button"
                    aria-label="Clear search"
                    onClick={() => {
                      setDraftSearch(null)
                      updateSearch({ q: undefined, item: undefined })
                    }}
                  >
                    <X aria-hidden="true" />
                  </InputGroupButton>
                </InputGroupAddon>
              ) : null}
            </InputGroup>
          </form>
          <Button
            variant={filters > 0 ? 'secondary' : 'outline'}
            type="button"
            className={controlsStyles['toolbar-button']}
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((value) => !value)}
            data-ui="toolbar-button"
          >
            <SlidersHorizontal aria-hidden="true" /> Filters
            {filters > 0 ? <span>{filters}</span> : null}
          </Button>
          <label className={controlsStyles['books-sort']} data-ui="library-sort">
            <ArrowDownWideNarrow aria-hidden="true" />
            <span className="sr-only">Sort books</span>
            <LibrarySelect
              aria-label="Sort books"
              value={selectedSort}
              onValueChange={(value) =>
                updateSearch({ sort: value, direction: undefined, item: undefined })
              }
              options={[
                ...sortOptions(collection).map(([value, label]) => ({
                  value: String(value),
                  label,
                })),
              ]}
            />
          </label>
          <Hint content={direction === 'asc' ? 'Ascending' : 'Descending'}>
            <Button
              variant="outline"
              size="icon"
              type="button"
              className={controlsStyles['sort-direction']}
              aria-label={direction === 'asc' ? 'Sort descending' : 'Sort ascending'}
              onClick={() =>
                updateSearch({ direction: direction === 'asc' ? 'desc' : 'asc', item: undefined })
              }
            >
              {direction === 'asc' ? (
                <ArrowUp aria-hidden="true" />
              ) : (
                <ArrowDown aria-hidden="true" />
              )}
            </Button>
          </Hint>
          <LibraryLayoutToggle
            value={layout}
            onValueChange={(layout) => updateSearch({ layout })}
          />
        </LibraryToolbar>
        {filtersOpen ? (
          <FilterPanel
            collection={collection}
            search={search}
            facets={summary?.facets}
            onToggle={toggleValue}
            onChange={updateSearch}
            onClear={() =>
              updateSearch({
                format: undefined,
                series: undefined,
                genre: undefined,
                finishedMode: undefined,
                finishedFrom: undefined,
                finishedTo: undefined,
                publishedMode: undefined,
                publishedFrom: undefined,
                publishedTo: undefined,
                addedMode: undefined,
                addedFrom: undefined,
                addedTo: undefined,
                ratingMode: undefined,
                minRating: undefined,
                item: undefined,
              })
            }
          />
        ) : null}
        <div
          className={workspaceStyles['books-result-summary']}
          aria-live="polite"
          data-ui="collection-summary"
        >
          {books.isPending ? null : (
            <span>
              {count.toLocaleString()} {count === 1 ? 'book' : 'books'}
              {collection === 'archive' && summary
                ? ` · ${summary.counts.supportedReads.toLocaleString()} supported reads`
                : ''}
            </span>
          )}
          {summary?.freshness.degraded ? <strong>Hardcover sync needs attention</strong> : null}
        </div>
        {books.isPending ? (
          <LoadingState data-ui="collection-loading">Loading books…</LoadingState>
        ) : null}
        {books.isError && !books.isFetchNextPageError ? (
          <Notice className={workspaceStyles['books-state']}>
            <h2>Books could not be loaded</h2>
            <p>{books.error.message}</p>
            <Button variant="outline" type="button" onClick={() => void books.refetch()}>
              Try again
            </Button>
          </Notice>
        ) : null}
        {!books.isPending && !books.isError && items.length === 0 ? (
          <CollectionEmptyState
            icon={BookOpen}
            title={filters || search.q ? 'No matching books' : `No books in ${collection}`}
            description={
              filters || search.q
                ? 'Clear search or filters to broaden this view.'
                : 'Sync Hardcover from Connections to populate this collection.'
            }
            clearLabel="Clear search and facets"
            onClear={
              filters || search.q
                ? () => {
                    setDraftSearch(null)
                    updateSearch({
                      q: undefined,
                      format: undefined,
                      series: undefined,
                      genre: undefined,
                    })
                  }
                : undefined
            }
          />
        ) : null}
        {items.length > 0 ? (
          <div
            className={layout === 'grid' ? mediaStyles['books-grid'] : booksStyles['books-list']}
            data-ui="books-list"
          >
            {layout === 'list' ? (
              <div
                className={booksStyles['book-list-head']}
                aria-hidden="true"
                data-ui="collection-column-headings"
              >
                <span className={booksStyles['book-head-title']}>Title</span>
                <span className={booksStyles['book-head-year']} data-ui="book-head-year">
                  Publish Year
                </span>
                <span className={booksStyles['book-head-context']} data-ui="book-head-context">
                  {collection === 'archive' ? 'Read Date' : 'Added to Hardcover'}
                </span>
                <span className="book-head-rating" data-ui="book-head-rating">
                  Rating
                </span>
                <span />
              </div>
            ) : null}
            {items.map((book) => (
              <BookResult
                key={book.id}
                book={book}
                collection={collection}
                layout={layout}
                selected={search.item === book.id}
                buttonRef={search.item === book.id ? selectedResultRef : undefined}
                onSelect={() =>
                  updateSearch({ item: search.item === book.id ? undefined : book.id })
                }
              />
            ))}
          </div>
        ) : null}
        <CollectionPagination
          query={books}
          scrollRef={collectionRef}
          itemCount={items.length}
          label="books"
        />
      </FlatTabsContent>
      {inspectorItem ? (
        <>
          <InspectorBackdrop
            type="button"
            className={workspaceStyles['inspector-backdrop']}
            aria-label="Close inspector"
            onClick={closeInspector}
            data-ui="inspector-backdrop"
          />
          <BookInspector mediaItemId={inspectorItem} onClose={closeInspector} />
        </>
      ) : null}
    </FlatTabs>
  )
}

function BookResult({
  book,
  collection,
  layout,
  selected,
  buttonRef,
  onSelect,
}: {
  book: BookCollectionItem
  collection: 'archive' | 'queue'
  layout: 'grid' | 'list'
  selected: boolean
  buttonRef?: Ref<HTMLButtonElement> | undefined
  onSelect: () => void
}) {
  if (layout === 'grid') {
    return (
      <MediaCard
        data-collection-item={book.id}
        type="button"
        ref={buttonRef}
        className={
          selected
            ? cn(mediaStyles['book-card'], mediaStyles['selected'])
            : mediaStyles['book-card']
        }
        aria-pressed={selected}
        onClick={onSelect}
      >
        <Cover book={book} />
        <RatingStars rating={book.personalRating} />
        <strong>{book.title}</strong>
        <span>{authors(book)}</span>
      </MediaCard>
    )
  }
  return (
    <MediaRowButton
      data-collection-item={book.id}
      type="button"
      ref={buttonRef}
      className={
        selected ? cn(mediaStyles['book-row'], mediaStyles['selected']) : mediaStyles['book-row']
      }
      aria-pressed={selected}
      onClick={onSelect}
      data-ui="book-row"
    >
      <Cover book={book} size="row" />
      <span className={mediaStyles['book-row-title']}>
        <strong>{book.title}</strong>
        <small>{authors(book)}</small>
      </span>
      <span className={mediaStyles['book-row-year']} data-ui="book-row-year">
        {book.publicationDate?.slice(0, 4) ?? '—'}
      </span>
      <span className={mediaStyles['book-row-context']} data-ui="book-row-context">
        {contextLabel(book, collection)}
      </span>
      <RatingStars rating={book.personalRating} />
      <ChevronRight aria-hidden="true" />
    </MediaRowButton>
  )
}

function FacetGroup({
  title,
  values,
  selected,
  onToggle,
}: {
  title: string
  values: Array<{ value: string; label: string; count: number }>
  selected: string[]
  onToggle: (value: string) => void
}) {
  if (values.length === 0 && selected.length === 0) return null
  const merged = [
    ...values,
    ...selected
      .filter((value) => !values.some((facet) => facet.value === value))
      .map((value) => ({ value, label: value, count: 0 })),
  ]
  return (
    <fieldset className={controlsStyles['filter-group']}>
      <legend>{title}</legend>
      <div>
        {merged.map((facet) => (
          <FieldLabel key={facet.value}>
            <Checkbox
              checked={selected.includes(facet.value)}
              onCheckedChange={() => onToggle(facet.value)}
            />
            <span>{facet.label}</span>
            <small>{facet.count}</small>
          </FieldLabel>
        ))}
      </div>
    </fieldset>
  )
}

function DateFilter({
  label,
  mode,
  from,
  to,
  onChange,
}: {
  label: string
  mode: 'any' | 'range' | 'unavailable'
  from?: string | undefined
  to?: string | undefined
  onChange: (value: {
    mode?: 'range' | 'unavailable' | undefined
    from?: string | undefined
    to?: string | undefined
  }) => void
}) {
  return (
    <fieldset className={controlsStyles['date-filter']} data-ui="date-filter">
      <legend>{label}</legend>
      <LibrarySelect
        aria-label={label}
        value={mode}
        onValueChange={(value) => {
          const next = value as 'any' | 'range' | 'unavailable'
          onChange(next === 'any' ? {} : { mode: next, from, to })
        }}
        options={[
          { value: 'any', label: 'Any time' },
          { value: 'range', label: 'Custom range' },
          { value: 'unavailable', label: 'Date unavailable' },
        ]}
      />
      {mode === 'range' ? (
        <span>
          <Input
            type="date"
            aria-label={`${label} from`}
            value={from ?? ''}
            onChange={(event) =>
              onChange({ mode: 'range', from: event.target.value || undefined, to })
            }
          />
          <Input
            type="date"
            aria-label={`${label} to`}
            value={to ?? ''}
            onChange={(event) =>
              onChange({ mode: 'range', from, to: event.target.value || undefined })
            }
          />
        </span>
      ) : null}
    </fieldset>
  )
}

function FilterPanel({
  collection,
  search,
  facets,
  onToggle,
  onChange,
  onClear,
}: {
  collection: 'archive' | 'queue'
  search: BooksRouteSearch
  facets?:
    | {
        formats: Array<{ value: string; label: string; count: number }>
        series: Array<{ value: string; label: string; count: number }>
        genres: Array<{ value: string; label: string; count: number }>
      }
    | undefined
  onToggle: (key: 'format' | 'series' | 'genre', value: string) => void
  onChange: (patch: Partial<BooksRouteSearch>) => void
  onClear: () => void
}) {
  return (
    <LibraryFilterPanel aria-label="Book filters" data-ui="filter-panel">
      <div className={controlsStyles['filter-panel-heading']}>
        <strong> Filters</strong>
        <Button variant="outline" type="button" onClick={onClear}>
          Clear all
        </Button>
      </div>
      <div className={controlsStyles['filter-panel-grid']}>
        <FacetGroup
          title="Format"
          values={facets?.formats ?? []}
          selected={search.format ?? []}
          onToggle={(value) => onToggle('format', value)}
        />
        <FacetGroup
          title="Series"
          values={facets?.series ?? []}
          selected={search.series ?? []}
          onToggle={(value) => onToggle('series', value)}
        />
        <FacetGroup
          title="Genre"
          values={facets?.genres ?? []}
          selected={search.genre ?? []}
          onToggle={(value) => onToggle('genre', value)}
        />
        {collection === 'archive' ? (
          <DateFilter
            label="Finished"
            mode={search.finishedMode ?? 'any'}
            from={search.finishedFrom}
            to={search.finishedTo}
            onChange={(value) =>
              onChange({
                finishedMode: value.mode,
                finishedFrom: value.from,
                finishedTo: value.to,
                item: undefined,
              })
            }
          />
        ) : (
          <DateFilter
            label="Added to Hardcover"
            mode={search.addedMode ?? 'any'}
            from={search.addedFrom}
            to={search.addedTo}
            onChange={(value) =>
              onChange({
                addedMode: value.mode,
                addedFrom: value.from,
                addedTo: value.to,
                item: undefined,
              })
            }
          />
        )}
        <DateFilter
          label="Published"
          mode={search.publishedMode ?? 'any'}
          from={search.publishedFrom}
          to={search.publishedTo}
          onChange={(value) =>
            onChange({
              publishedMode: value.mode,
              publishedFrom: value.from,
              publishedTo: value.to,
              item: undefined,
            })
          }
        />
        {collection === 'archive' ? (
          <fieldset className={controlsStyles['date-filter']} data-ui="date-filter">
            <legend>Personal rating</legend>
            <LibrarySelect
              aria-label="Personal rating"
              value={search.ratingMode ?? 'any'}
              onValueChange={(value) => {
                const mode = value as 'any' | 'rated' | 'unrated' | 'minimum'
                onChange({
                  ratingMode: mode === 'any' ? undefined : mode,
                  minRating: mode === 'minimum' ? (search.minRating ?? 3) : undefined,
                  item: undefined,
                })
              }}
              options={[
                { value: 'any', label: 'Any rating' },
                { value: 'rated', label: 'Rated' },
                { value: 'unrated', label: 'Unrated' },
                { value: 'minimum', label: 'At least…' },
              ]}
            />
            {search.ratingMode === 'minimum' ? (
              <LibrarySelect
                aria-label="Minimum personal rating"
                value={String(search.minRating ?? 3)}
                onValueChange={(value) => onChange({ minRating: Number(value), item: undefined })}
                options={[
                  ...Array.from({ length: 10 }, (_, index) => (index + 1) / 2).map((rating) => ({
                    value: String(rating),
                    label: [rating, '/5'].join(''),
                  })),
                ]}
              />
            ) : null}
          </fieldset>
        ) : null}
      </div>
    </LibraryFilterPanel>
  )
}

function BookInspector({ mediaItemId, onClose }: { mediaItemId: string; onClose: () => void }) {
  const [tab, setTab] = useState<'details' | 'history'>('details')
  const inspectorRef = useRef<HTMLElement>(null)
  const onCloseRef = useRef(onClose)
  const book = useQuery({
    queryKey: ['book', mediaItemId],
    queryFn: ({ signal }) => fetchBook(mediaItemId, signal),
  })
  const history = useInfiniteQuery({
    queryKey: ['book-history', mediaItemId],
    enabled: tab === 'history',
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => fetchBookHistory(mediaItemId, pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const inspector = inspectorRef.current
    inspector?.querySelector<HTMLElement>('button[aria-label="Close inspector"]')?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || inspector === null) return
      const focusable = Array.from(
        inspector.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0)
      if (focusable.length === 0) return
      const first = focusable[0]!
      const last = focusable.at(-1)!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [mediaItemId])

  return (
    <aside
      ref={inspectorRef}
      className={inspectorStyles['book-inspector']}
      aria-label="Book inspector"
      data-ui="book-inspector"
    >
      <Tabs
        className={inspectorStyles['inspector-tab-root']}
        value={tab}
        onValueChange={(value) => setTab(value as typeof tab)}
      >
        <div className={inspectorStyles['inspector-topbar']} data-ui="inspector-header">
          <TabsList
            variant="line"
            className={inspectorStyles['inspector-tabs']}
            aria-label="Book information"
          >
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 [&_svg]:size-[17px]"
            type="button"
            aria-label="Close inspector"
            onClick={onClose}
            data-ui="inspector-close"
          >
            <X aria-hidden="true" />
          </Button>
        </div>
        {book.isPending ? (
          <LoadingState className={inspectorStyles['inspector-state']}>Loading book…</LoadingState>
        ) : null}
        {book.isError ? (
          <Notice className={inspectorStyles['inspector-state']}>{book.error.message}</Notice>
        ) : null}
        {
          <TabsContent value="details" className={inspectorStyles['inspector-tab-panel']}>
            {book.data ? <BookDetails book={book.data} /> : null}
          </TabsContent>
        }
        {
          <TabsContent value="history" className={inspectorStyles['inspector-tab-panel']}>
            {book.data ? (
              <BookHistory
                entries={history.data?.pages.flatMap((page) => page.data) ?? []}
                pending={history.isPending}
                error={history.isError ? history.error.message : null}
                hasMore={history.hasNextPage}
                loadingMore={history.isFetchingNextPage}
                onLoadMore={() => void history.fetchNextPage()}
              />
            ) : null}
          </TabsContent>
        }
      </Tabs>
    </aside>
  )
}

function BookDetails({ book }: { book: BookDetail }) {
  return (
    <div className={inspectorStyles['inspector-scroll']} data-ui="inspector-scroll">
      <header className={inspectorStyles['inspector-book-heading']}>
        {book.coverUrl ? <img src={book.coverUrl} alt={`Cover of ${book.title}`} /> : <BookOpen />}
        <div>
          <h2>{book.title}</h2>
          {book.subtitle ? <p>{book.subtitle}</p> : null}
          <span>
            {book.memberships.archive ? 'Archive' : ''}
            {book.memberships.archive && book.memberships.queue ? ' · ' : ''}
            {book.memberships.queue
              ? book.memberships.currentlyReading
                ? 'Currently Reading'
                : 'Queue'
              : ''}
          </span>
        </div>
      </header>
      <InspectorSection title="Overview">
        {book.description ? (
          <p className={booksStyles['book-description']}>{book.description}</p>
        ) : (
          <p>Overview unavailable.</p>
        )}
        <dl className={inspectorStyles['detail-list']}>
          {book.publicationDate ? (
            <>
              <dt>Published</dt>
              <dd>{formatDate(book.publicationDate, book.publicationPrecision)}</dd>
            </>
          ) : null}
          {book.pageCount !== null ? (
            <>
              <dt>Length</dt>
              <dd>{book.pageCount.toLocaleString()} pages</dd>
            </>
          ) : null}
          {book.personalRating !== null ? (
            <>
              <dt>Personal rating</dt>
              <dd>{book.personalRating}/5</dd>
            </>
          ) : null}
        </dl>
      </InspectorSection>
      {book.series.length ? (
        <InspectorSection title="Series">
          <div className={inspectorStyles['series-list']}>
            {book.series.map((series) => (
              <div key={series.id}>
                <strong>{series.name}</strong>
                <span>
                  {series.position === null
                    ? 'Position unavailable'
                    : `Position ${series.position}`}
                  {series.totalBooks ? ` of ${series.totalBooks}` : ''}
                </span>
              </div>
            ))}
          </div>
        </InspectorSection>
      ) : null}
      {book.contributors.length ? (
        <InspectorSection title="Contributors">
          <dl className={inspectorStyles['detail-list']}>
            {book.contributors.map((group) => (
              <div key={group.role}>
                <dt>{group.role}</dt>
                <dd>{group.contributors.map((person) => person.name).join(', ')}</dd>
              </div>
            ))}
          </dl>
        </InspectorSection>
      ) : null}
      {book.selectedEdition ? (
        <InspectorSection title="Selected edition">
          <dl className={inspectorStyles['detail-list']}>
            {book.selectedEdition.format ? (
              <>
                <dt>Format</dt>
                <dd>{book.selectedEdition.format}</dd>
              </>
            ) : null}
            {book.selectedEdition.publisher ? (
              <>
                <dt>Publisher</dt>
                <dd>{book.selectedEdition.publisher}</dd>
              </>
            ) : null}
            {book.selectedEdition.language ? (
              <>
                <dt>Language</dt>
                <dd>{book.selectedEdition.language}</dd>
              </>
            ) : null}
            {book.selectedEdition.identifiers.map((identifier) => (
              <div key={`${identifier.type}:${identifier.value}`}>
                <dt>{identifier.type}</dt>
                <dd>{identifier.value}</dd>
              </div>
            ))}
          </dl>
        </InspectorSection>
      ) : null}
      <InspectorSection title="Hardcover community">
        <dl className={inspectorStyles['detail-list']}>
          {book.community.rating !== null ? (
            <>
              <dt>Community rating</dt>
              <dd>
                {book.community.rating.toFixed(2)}/5 ·{' '}
                {book.community.ratingsCount.toLocaleString()} ratings
              </dd>
            </>
          ) : null}
          {book.community.genres.length ? (
            <>
              <dt>Genres</dt>
              <dd>{book.community.genres.join(', ')}</dd>
            </>
          ) : null}
          {book.community.moods.length ? (
            <>
              <dt>Moods</dt>
              <dd>{book.community.moods.join(', ')}</dd>
            </>
          ) : null}
        </dl>
      </InspectorSection>
      <InspectorSection title="Source">
        <p>
          Imported from{' '}
          {book.source.url ? (
            <a href={book.source.url} target="_blank" rel="noreferrer">
              Hardcover <ExternalLink aria-hidden="true" />
            </a>
          ) : (
            'Hardcover'
          )}
          {book.source.refreshedAt
            ? ` · refreshed ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(book.source.refreshedAt))}`
            : ''}
        </p>
      </InspectorSection>
    </div>
  )
}

function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={inspectorStyles['inspector-section']} data-ui="inspector-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function BookHistory({
  entries,
  pending,
  error,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  entries: BookHistoryEntry[]
  pending: boolean
  error: string | null
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
}) {
  if (pending)
    return (
      <LoadingState className={inspectorStyles['inspector-state']}>Loading history…</LoadingState>
    )
  if (error) return <div className={inspectorStyles['inspector-state']}>{error}</div>
  return (
    <div className={inspectorStyles['inspector-scroll']} data-ui="inspector-scroll">
      <div className={inspectorStyles['history-list']}>
        {entries.length === 0 ? <p>No personal activity is available.</p> : null}
        {entries.map((entry) => (
          <article key={entry.id}>
            <span className={inspectorStyles['history-mark']} aria-hidden="true">
              <Check />
            </span>
            <div>
              <strong>{entry.label}</strong>
              <time>
                {formatDate(entry.date, entry.datePrecision) ??
                  (entry.kind === 'read'
                    ? 'Date unavailable'
                    : 'Source does not provide an event date')}
              </time>
              {entry.detail ? <p>{entry.detail}</p> : null}
              {entry.edition?.format ? <small>{entry.edition.format}</small> : null}
            </div>
          </article>
        ))}
      </div>
      {hasMore ? (
        <Button
          variant="outline"
          type="button"
          className={workspaceStyles['load-more']}
          disabled={loadingMore}
          onClick={onLoadMore}
        >
          {loadingMore ? 'Loading…' : 'Load older history'}
        </Button>
      ) : null}
    </div>
  )
}
