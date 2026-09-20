import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from 'react'
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
  Grid2X2,
  List,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'

import type { BookCollectionItem, BookDetail, BookHistoryEntry } from '@media-tracker/contracts'

import { fetchBook, fetchBookHistory, fetchBooks, type BooksRequest } from './books-api'
import {
  collectionQuerySearch,
  normalizedForCollection,
  type BooksRouteSearch,
} from './books-route-search'

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
        className={`book-cover book-cover-${size}`}
        src={book.coverUrl}
        alt={`Cover of ${book.title}`}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <span
      className={`book-cover book-cover-${size} book-cover-fallback`}
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
  if (collection === 'archive') {
    const date = formatDate(book.latestReadDate, book.latestReadPrecision)
    return `${date === null ? 'Read — date unavailable' : `Read ${date}`}${book.latestReadFormat ? ` · ${book.latestReadFormat}` : ''}`
  }
  const date = formatDate(book.addedToHardcoverDate, 'day')
  return date === null ? 'Added date unavailable' : `Added to Hardcover ${date}`
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

function sortOptions(collection: 'archive' | 'queue') {
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
  const layout = search.layout ?? 'grid'

  const updateSearch = (patch: Partial<BooksRouteSearch>) => {
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

  const closeInspector = () => {
    const returnFocus = selectedResultRef.current
    updateSearch({ item: undefined })
    requestAnimationFrame(() => returnFocus?.focus())
  }

  const request = useMemo<BooksRequest>(
    () => ({
      collection,
      ...collectionQuerySearch(search),
      finishedMode: search.finishedMode ?? 'any',
      publishedMode: search.publishedMode ?? 'any',
      addedMode: search.addedMode ?? 'any',
      ratingMode: search.ratingMode ?? 'any',
      limit: 48,
    }),
    [collection, search],
  )
  const books = useInfiniteQuery({
    queryKey: ['books', request],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      fetchBooks({ ...request, ...(pageParam === undefined ? {} : { cursor: pageParam }) }, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })
  const pages = books.data?.pages ?? []
  const items = pages.flatMap((page) => page.data)
  const summary = pages[0]
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
    <section className={`books-page books-layout-${layout}`} aria-labelledby="books-title">
      <div className="books-collection">
        <header className="books-header">
          <div>
            <span className="eyebrow">Library</span>
            <h1 id="books-title">Books</h1>
          </div>
          <nav className="books-tabs" aria-label="Book collections">
            <Link
              to="/library/books/archive"
              search={normalizedForCollection(search, 'archive')}
              activeProps={{ 'aria-current': 'page', className: 'active' }}
            >
              Archive <span>{summary?.counts.archive ?? '—'}</span>
            </Link>
            <Link
              to="/library/books/queue"
              search={normalizedForCollection(search, 'queue')}
              activeProps={{ 'aria-current': 'page', className: 'active' }}
            >
              Queue <span>{summary?.counts.queue ?? '—'}</span>
            </Link>
          </nav>
        </header>

        <div className="books-toolbar">
          <form
            className="books-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault()
              const value = (draftSearch ?? search.q ?? '').trim()
              setDraftSearch(null)
              updateSearch({ q: value || undefined, item: undefined })
            }}
          >
            <Search aria-hidden="true" />
            <input
              aria-label="Search books"
              placeholder="Search title, author, series, or ISBN"
              value={draftSearch ?? search.q ?? ''}
              onChange={(event) => setDraftSearch(event.target.value)}
            />
            {(draftSearch ?? search.q) ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setDraftSearch(null)
                  updateSearch({ q: undefined, item: undefined })
                }}
              >
                <X aria-hidden="true" />
              </button>
            ) : null}
          </form>
          <button
            type="button"
            className={filters > 0 ? 'toolbar-button active' : 'toolbar-button'}
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((value) => !value)}
          >
            <SlidersHorizontal aria-hidden="true" /> Filters
            {filters > 0 ? <span>{filters}</span> : null}
          </button>
          <label className="books-sort">
            <ArrowDownWideNarrow aria-hidden="true" />
            <span className="sr-only">Sort books</span>
            <select
              value={selectedSort}
              onChange={(event) =>
                updateSearch({ sort: event.target.value, direction: undefined, item: undefined })
              }
            >
              {sortOptions(collection).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="sort-direction"
            aria-label={direction === 'asc' ? 'Sort descending' : 'Sort ascending'}
            title={direction === 'asc' ? 'Ascending' : 'Descending'}
            onClick={() =>
              updateSearch({ direction: direction === 'asc' ? 'desc' : 'asc', item: undefined })
            }
          >
            {direction === 'asc' ? (
              <ArrowUp aria-hidden="true" />
            ) : (
              <ArrowDown aria-hidden="true" />
            )}
          </button>
          <div className="layout-toggle" aria-label="Result layout">
            <button
              type="button"
              aria-label="Grid view"
              aria-pressed={layout === 'grid'}
              onClick={() => updateSearch({ layout: 'grid' })}
            >
              <Grid2X2 aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="List view"
              aria-pressed={layout === 'list'}
              onClick={() => updateSearch({ layout: 'list' })}
            >
              <List aria-hidden="true" />
            </button>
          </div>
        </div>

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

        <div className="books-result-summary" aria-live="polite">
          {books.isPending ? (
            <span>Loading books…</span>
          ) : (
            <span>
              {count.toLocaleString()} {count === 1 ? 'book' : 'books'}
              {collection === 'archive' && summary
                ? ` · ${summary.counts.supportedReads.toLocaleString()} supported reads`
                : ''}
            </span>
          )}
          {summary?.freshness.degraded ? <strong>Hardcover sync needs attention</strong> : null}
        </div>

        {books.isError ? (
          <div className="books-state books-state-error" role="alert">
            <h2>Books could not be loaded</h2>
            <p>{books.error.message}</p>
            <button type="button" onClick={() => void books.refetch()}>
              Try again
            </button>
          </div>
        ) : null}

        {!books.isPending && !books.isError && items.length === 0 ? (
          <div className="books-state">
            <BookOpen aria-hidden="true" />
            <h2>{filters || search.q ? 'No matching books' : `No books in ${collection}`}</h2>
            <p>
              {filters || search.q
                ? 'Clear search or filters to broaden this view.'
                : 'Sync Hardcover from Connections to populate this collection.'}
            </p>
            {filters || search.q ? (
              <button
                type="button"
                onClick={() => {
                  setDraftSearch(null)
                  updateSearch({
                    q: undefined,
                    format: undefined,
                    series: undefined,
                    genre: undefined,
                  })
                }}
              >
                Clear search and facets
              </button>
            ) : (
              <Link to="/connections">Open Connections</Link>
            )}
          </div>
        ) : null}

        {items.length > 0 ? (
          <div className={layout === 'grid' ? 'books-grid' : 'books-list'}>
            {items.map((book) => (
              <BookResult
                key={book.id}
                book={book}
                collection={collection}
                layout={layout}
                selected={search.item === book.id}
                buttonRef={search.item === book.id ? selectedResultRef : undefined}
                onSelect={() => updateSearch({ item: book.id })}
              />
            ))}
          </div>
        ) : null}

        {books.hasNextPage ? (
          <button
            className="load-more"
            type="button"
            disabled={books.isFetchingNextPage}
            onClick={() => void books.fetchNextPage()}
          >
            {books.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        ) : null}
      </div>

      {search.item ? (
        <>
          <button
            type="button"
            className="inspector-backdrop"
            aria-label="Close inspector"
            onClick={closeInspector}
          />
          <BookInspector mediaItemId={search.item} onClose={closeInspector} />
        </>
      ) : null}
    </section>
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
      <button
        type="button"
        ref={buttonRef}
        className={selected ? 'book-card selected' : 'book-card'}
        aria-pressed={selected}
        onClick={onSelect}
      >
        <Cover book={book} />
        <strong>{book.title}</strong>
        <span>{authors(book)}</span>
      </button>
    )
  }
  return (
    <button
      type="button"
      ref={buttonRef}
      className={selected ? 'book-row selected' : 'book-row'}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <Cover book={book} size="row" />
      <span className="book-row-title">
        <strong>{book.title}</strong>
        <small>{authors(book)}</small>
      </span>
      <span className="book-row-series">
        {book.primarySeries ??
          (book.publicationDate
            ? `Published ${formatDate(book.publicationDate, book.publicationPrecision)}`
            : '—')}
      </span>
      <span className="book-row-context">
        {contextLabel(book, collection)}
        {collection === 'archive' && book.personalRating !== null
          ? ` · ${book.personalRating}/5`
          : ''}
      </span>
      <ChevronRight aria-hidden="true" />
    </button>
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
    <fieldset className="filter-group">
      <legend>{title}</legend>
      <div>
        {merged.map((facet) => (
          <label key={facet.value}>
            <input
              type="checkbox"
              checked={selected.includes(facet.value)}
              onChange={() => onToggle(facet.value)}
            />
            <span>{facet.label}</span>
            <small>{facet.count}</small>
          </label>
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
    <fieldset className="date-filter">
      <legend>{label}</legend>
      <select
        value={mode}
        onChange={(event) => {
          const next = event.target.value as 'any' | 'range' | 'unavailable'
          onChange(next === 'any' ? {} : { mode: next, from, to })
        }}
      >
        <option value="any">Any time</option>
        <option value="range">Custom range</option>
        <option value="unavailable">Date unavailable</option>
      </select>
      {mode === 'range' ? (
        <span>
          <input
            type="date"
            aria-label={`${label} from`}
            value={from ?? ''}
            onChange={(event) =>
              onChange({ mode: 'range', from: event.target.value || undefined, to })
            }
          />
          <input
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
    <section className="filter-panel" aria-label="Book filters">
      <div className="filter-panel-heading">
        <strong>Filters</strong>
        <button type="button" onClick={onClear}>
          Clear all
        </button>
      </div>
      <div className="filter-panel-grid">
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
          <fieldset className="date-filter">
            <legend>Personal rating</legend>
            <select
              value={search.ratingMode ?? 'any'}
              onChange={(event) => {
                const mode = event.target.value as 'any' | 'rated' | 'unrated' | 'minimum'
                onChange({
                  ratingMode: mode === 'any' ? undefined : mode,
                  minRating: mode === 'minimum' ? (search.minRating ?? 3) : undefined,
                  item: undefined,
                })
              }}
            >
              <option value="any">Any rating</option>
              <option value="rated">Rated</option>
              <option value="unrated">Unrated</option>
              <option value="minimum">At least…</option>
            </select>
            {search.ratingMode === 'minimum' ? (
              <select
                aria-label="Minimum personal rating"
                value={search.minRating ?? 3}
                onChange={(event) =>
                  onChange({ minRating: Number(event.target.value), item: undefined })
                }
              >
                {Array.from({ length: 10 }, (_, index) => (index + 1) / 2).map((rating) => (
                  <option value={rating} key={rating}>
                    {rating}/5
                  </option>
                ))}
              </select>
            ) : null}
          </fieldset>
        ) : null}
      </div>
    </section>
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
    inspector?.querySelector<HTMLElement>('.inspector-close')?.focus()
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
      )
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
    <aside ref={inspectorRef} className="book-inspector" aria-label="Book inspector">
      <div className="inspector-topbar">
        <div className="inspector-tabs" role="tablist" aria-label="Book information">
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
            History
          </button>
        </div>
        <button
          className="inspector-close"
          type="button"
          aria-label="Close inspector"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </button>
      </div>
      {book.isPending ? <div className="inspector-state">Loading book…</div> : null}
      {book.isError ? (
        <div className="inspector-state" role="alert">
          {book.error.message}
        </div>
      ) : null}
      {book.data && tab === 'details' ? <BookDetails book={book.data} /> : null}
      {book.data && tab === 'history' ? (
        <BookHistory
          entries={history.data?.pages.flatMap((page) => page.data) ?? []}
          pending={history.isPending}
          error={history.isError ? history.error.message : null}
          hasMore={history.hasNextPage}
          loadingMore={history.isFetchingNextPage}
          onLoadMore={() => void history.fetchNextPage()}
        />
      ) : null}
    </aside>
  )
}

function BookDetails({ book }: { book: BookDetail }) {
  return (
    <div className="inspector-scroll">
      <header className="inspector-book-heading">
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
          <p className="book-description">{book.description}</p>
        ) : (
          <p>Overview unavailable.</p>
        )}
        <dl className="detail-list">
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
          <div className="series-list">
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
          <dl className="detail-list">
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
          <dl className="detail-list">
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
        <dl className="detail-list">
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
    <section className="inspector-section">
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
  if (pending) return <div className="inspector-state">Loading history…</div>
  if (error) return <div className="inspector-state">{error}</div>
  return (
    <div className="inspector-scroll">
      <div className="history-list">
        {entries.length === 0 ? <p>No personal activity is available.</p> : null}
        {entries.map((entry) => (
          <article key={entry.id}>
            <span className={`history-mark history-${entry.kind}`} aria-hidden="true">
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
        <button type="button" className="load-more" disabled={loadingMore} onClick={onLoadMore}>
          {loadingMore ? 'Loading…' : 'Load older history'}
        </button>
      ) : null}
    </div>
  )
}
