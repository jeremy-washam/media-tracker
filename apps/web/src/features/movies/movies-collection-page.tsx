import { CollectionEmptyState } from '@/components/collection-empty-state'
import { LibraryToolbar, LibraryFilterPanel } from '@/components/library-controls'
import mediaStyles from '@/components/media-presentation.module.css'
import workspaceStyles from '@/components/library-workspace.module.css'
import controlsStyles from '@/components/library-controls.module.css'
import moviesStyles from '@/features/movies/movies.module.css'
import inspectorStyles from '@/components/inspector.module.css'
import booksStyles from '@/features/books/books.module.css'
import { cn } from '@/lib/utils'
import { CollectionPagination } from '@/components/collection-pagination'
import { useCollectionScroll } from '@/components/collection-scroll'
import { moviesQueryOptions } from '../../library-queries'
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
import { useEffect, useRef, useState, type Ref } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import {
  ArrowDown,
  ArrowDownWideNarrow,
  ArrowUp,
  Check,
  ChevronRight,
  ExternalLink,
  Film,
  Heart,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'

import type { MovieCollectionItem, MovieDetail, MovieHistoryEntry } from '@media-tracker/contracts'

import { fetchMovie, fetchMovieHistory } from './movies-api'
import {
  movieCollectionQuerySearch,
  normalizedForMovieCollection,
  type MoviesRouteSearch,
} from './movies-route-search'

function formatDate(value: string | null): string | null {
  if (value === null) return null
  if (/^\d{4}$/.test(value)) return value
  const parts = value.slice(0, 10).split('-').map(Number)
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return value
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(parts[0]!, parts[1]! - 1, parts[2]!))
}

function MoviePoster({
  movie,
  size = 'card',
}: {
  movie: Pick<MovieCollectionItem, 'displayTitle' | 'releaseYear' | 'posterUrl'>
  size?: 'card' | 'row' | 'inspector'
}) {
  const [failed, setFailed] = useState(false)
  if (movie.posterUrl !== null && !failed) {
    return (
      <img
        className={cn(mediaStyles['movie-poster'], mediaStyles[`movie-poster-${size}`])}
        src={movie.posterUrl}
        alt={`Poster for ${movie.displayTitle}`}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <span
      className={cn(
        mediaStyles['movie-poster'],
        mediaStyles[`movie-poster-${size}`],
        mediaStyles['movie-poster-fallback'],
      )}
      role="img"
      aria-label={`No poster available for ${movie.displayTitle}`}
    >
      <Film aria-hidden="true" />
      <strong>{movie.displayTitle.slice(0, 1)}</strong>
      {movie.releaseYear ? <small>{movie.releaseYear}</small> : null}
    </span>
  )
}

function activeFilters(search: MoviesRouteSearch, collection: 'archive' | 'queue'): number {
  return [
    collection === 'archive' ? search.watched : search.added,
    search.releaseYearFrom || search.releaseYearTo || search.releaseYearUnknown,
    search.rating,
    collection === 'archive' ? search.reviewed : search.archive,
    search.runtime || search.runtimeUnknown,
  ].filter(Boolean).length
}

function sortOptions(
  collection: 'archive' | 'queue',
  hasSearch: boolean,
  runtime: boolean,
): [string, string][] {
  const options: [string, string][] =
    collection === 'archive'
      ? [
          ['watchedAt', 'Watched date'],
          ['title', 'Title'],
          ['releaseYear', 'Release year'],
          ['personalRating', 'Your rating'],
          ['watchCount', 'Most watched'],
        ]
      : [
          ['addedAt', 'Recently added'],
          ['title', 'Title'],
          ['releaseYear', 'Release year'],
          ['personalRating', 'Your rating'],
        ]
  if (runtime) options.push(['runtime', 'Runtime'])
  if (hasSearch) options.unshift(['relevance', 'Relevance'])
  return options
}

function defaultSort(collection: 'archive' | 'queue', search: MoviesRouteSearch): string {
  return (
    search.sort ?? (search.q ? 'relevance' : collection === 'archive' ? 'watchedAt' : 'addedAt')
  )
}

function defaultDirection(sort: string, direction?: 'asc' | 'desc'): 'asc' | 'desc' {
  if (sort === 'relevance') return 'asc'
  return direction ?? (sort === 'title' || sort === 'runtime' ? 'asc' : 'desc')
}

export function MoviesCollectionPage({ collection }: { collection: 'archive' | 'queue' }) {
  const rawSearch = useSearch({ strict: false }) as MoviesRouteSearch
  const search = normalizedForMovieCollection(rawSearch, collection)
  const navigate = useNavigate()
  const [draftSearch, setDraftSearch] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const selectedRef = useRef<HTMLButtonElement>(null)
  const [view, saveLayout] = useLibraryLayout(search.view)

  const updateSearch = (patch: Partial<MoviesRouteSearch>) => {
    if (patch.view) saveLayout(patch.view)
    const next = { ...search, ...patch }
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === '' || value === false) {
        delete next[key as keyof MoviesRouteSearch]
      }
    }
    void navigate({
      to: collection === 'archive' ? '/library/movies/archive' : '/library/movies/queue',
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
    const target = selectedRef.current
    updateSearch({ item: undefined })
    requestAnimationFrame(() => target?.focus({ preventScroll: true }))
  }

  const queryOptions = moviesQueryOptions(collection, search)
  const movies = useInfiniteQuery(queryOptions)
  const pages = movies.data?.pages ?? []
  const items = pages.flatMap((page) => page.data)
  const collectionRef = useCollectionScroll(queryOptions.queryKey, view, items.length)
  const summary = pages[0]
  const sectionCounts = useLibrarySectionCounts('movies', summary, (page) => page.membershipCounts)
  const count = summary?.filteredCount ?? 0
  const filters = activeFilters(search, collection)
  const selectedSort = defaultSort(collection, search)
  const direction = defaultDirection(selectedSort, search.direction)

  return (
    <FlatTabs
      value={collection}
      render={<section />}
      data-inspector-open={Boolean(search.item)}
      data-layout={view}
      className={workspaceStyles['books-page']}
      aria-labelledby="movies-title"
      data-ui="library-workspace"
    >
      <FlatTabsContent
        value={collection}
        className={workspaceStyles['books-collection']}
        ref={collectionRef}
        data-ui="library-collection"
      >
        <h1 className="sr-only" id="movies-title">
          Movies
        </h1>
        <CollectionTabList aria-label="Movie collections">
          <Link
            to="/library/movies/archive"
            search={normalizedForMovieCollection(search, 'archive')}
            activeProps={{ 'aria-current': 'page' }}
          >
            Archive <span>{sectionCounts?.archiveItems?.toLocaleString() ?? '—'}</span>
          </Link>
          <Link
            to="/library/movies/queue"
            search={normalizedForMovieCollection(search, 'queue')}
            activeProps={{ 'aria-current': 'page' }}
          >
            Queue <span>{sectionCounts?.queueItems?.toLocaleString() ?? '—'}</span>
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
              updateSearch({
                q: value || undefined,
                sort: undefined,
                direction: undefined,
                item: undefined,
              })
            }}
          >
            <InputGroup>
              <InputGroupInput
                aria-label="Search movies"
                placeholder="Search title, year, or review"
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
                      updateSearch({
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
            <span className="sr-only">Sort movies</span>
            <LibrarySelect
              aria-label="Sort movies"
              value={selectedSort}
              onValueChange={(value) =>
                updateSearch({ sort: value, direction: undefined, item: undefined })
              }
              options={[
                ...sortOptions(
                  collection,
                  Boolean(search.q),
                  summary?.facets.runtimeAvailable ?? false,
                ).map(([value, label]) => ({ value, label })),
              ]}
            />
          </label>
          <Button
            variant="outline"
            size="icon"
            type="button"
            className={controlsStyles['sort-direction']}
            disabled={selectedSort === 'relevance'}
            aria-label={direction === 'asc' ? 'Sort descending' : 'Sort ascending'}
            onClick={() =>
              updateSearch({
                sort: selectedSort,
                direction: direction === 'asc' ? 'desc' : 'asc',
                item: undefined,
              })
            }
          >
            {direction === 'asc' ? (
              <ArrowUp aria-hidden="true" />
            ) : (
              <ArrowDown aria-hidden="true" />
            )}
          </Button>
          <LibraryLayoutToggle value={view} onValueChange={(view) => updateSearch({ view })} />
        </LibraryToolbar>
        {filtersOpen ? (
          <MovieFilters
            collection={collection}
            search={search}
            runtimeAvailable={summary?.facets.runtimeAvailable ?? false}
            onChange={updateSearch}
          />
        ) : null}
        <div
          className={workspaceStyles['books-result-summary']}
          aria-live="polite"
          data-ui="collection-summary"
        >
          {movies.isPending ? null : (
            <span>
              {count.toLocaleString()} {count === 1 ? 'movie' : 'movies'}
              {collection === 'archive' && summary?.filteredOccurrenceCount !== null
                ? ` · ${summary?.filteredOccurrenceCount.toLocaleString()} ${summary?.filteredOccurrenceCount === 1 ? 'watch' : 'watches'}`
                : ''}
            </span>
          )}
          {collection === 'queue' && summary?.sourceFreshness.lastCompleteExportAt ? (
            <small>
              Watchlist imported {formatDate(summary.sourceFreshness.lastCompleteExportAt)}
            </small>
          ) : null}
        </div>
        {movies.isPending ? (
          <LoadingState data-ui="collection-loading">Loading movies…</LoadingState>
        ) : null}
        {movies.isError && !movies.isFetchNextPageError ? (
          <Notice className={workspaceStyles['books-state']}>
            <h2>Movies could not be loaded</h2>
            <p>{movies.error.message}</p>
            <Button variant="outline" type="button" onClick={() => void movies.refetch()}>
              Try again
            </Button>
          </Notice>
        ) : null}
        {!movies.isPending && !movies.isError && items.length === 0 ? (
          <CollectionEmptyState
            icon={Film}
            title={filters || search.q ? 'No matching movies' : `No movies in ${collection}`}
            description={
              filters || search.q
                ? 'Clear search or filters to broaden this view.'
                : 'Import Letterboxd from Connections to populate this collection.'
            }
            onClear={
              filters || search.q
                ? () => {
                    setDraftSearch(null)
                    updateSearch(clearMovieFilters())
                  }
                : undefined
            }
          />
        ) : null}
        {items.length > 0 ? (
          <div
            className={view === 'grid' ? mediaStyles['movies-grid'] : moviesStyles['movies-list']}
          >
            {items.map((movie) => (
              <MovieResult
                key={movie.id}
                movie={movie}
                collection={collection}
                view={view}
                selected={search.item === movie.id}
                buttonRef={search.item === movie.id ? selectedRef : undefined}
                onSelect={() =>
                  updateSearch({ item: search.item === movie.id ? undefined : movie.id })
                }
              />
            ))}
          </div>
        ) : null}
        <CollectionPagination
          query={movies}
          scrollRef={collectionRef}
          itemCount={items.length}
          label="movies"
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
          <MovieInspector mediaItemId={inspectorItem} search={search} onClose={closeInspector} />
        </>
      ) : null}
    </FlatTabs>
  )
}

function MovieResult({
  movie,
  collection,
  view,
  selected,
  buttonRef,
  onSelect,
}: {
  movie: MovieCollectionItem
  collection: 'archive' | 'queue'
  view: 'grid' | 'list'
  selected: boolean
  buttonRef?: Ref<HTMLButtonElement> | undefined
  onSelect: () => void
}) {
  const director = movie.directors.length
    ? movie.directors.join(', ')
    : movie.enrichment.mediaType === 'tv'
      ? 'Creator unavailable'
      : 'Director unavailable'
  if (view === 'grid') {
    return (
      <MediaCard
        data-collection-item={movie.id}
        type="button"
        ref={buttonRef}
        className={
          selected
            ? cn(mediaStyles['movie-card'], mediaStyles['selected'])
            : mediaStyles['movie-card']
        }
        aria-pressed={selected}
        aria-label={`${movie.displayTitle}${movie.releaseYear ? `, ${movie.releaseYear}` : ''}`}
        onClick={onSelect}
      >
        <MoviePoster movie={movie} />
        <RatingStars rating={movie.personal.currentRating} />
        <strong>{movie.displayTitle}</strong>
        <span>{[movie.releaseYear, director].filter(Boolean).join(' · ')}</span>
      </MediaCard>
    )
  }
  const context =
    collection === 'archive'
      ? movie.archive.referenceWatchedOn
        ? `Watched ${formatDate(movie.archive.referenceWatchedOn)}`
        : 'Watched — date unknown'
      : movie.queue.addedOn
        ? `Added ${formatDate(movie.queue.addedOn)}`
        : 'Added date unknown'
  return (
    <MediaRowButton
      data-collection-item={movie.id}
      type="button"
      ref={buttonRef}
      className={
        selected ? cn(mediaStyles['movie-row'], mediaStyles['selected']) : mediaStyles['movie-row']
      }
      aria-pressed={selected}
      onClick={onSelect}
      data-ui="movie-row"
    >
      <MoviePoster movie={movie} size="row" />
      <span className={mediaStyles['movie-row-title']}>
        <strong>{movie.displayTitle}</strong>
        <small>{movie.releaseYear ?? 'Year unavailable'}</small>
      </span>
      <span className={mediaStyles['movie-row-director']}>{director}</span>
      <span className={mediaStyles['movie-row-context']}>{context}</span>
      <span className={mediaStyles['movie-row-rating']}>
        {movie.personal.currentRating === null ? '—' : `${movie.personal.currentRating}/5`}
      </span>
      <ChevronRight aria-hidden="true" />
    </MediaRowButton>
  )
}

function clearMovieFilters(): Partial<MoviesRouteSearch> {
  return {
    q: undefined,
    watched: undefined,
    watchedFrom: undefined,
    watchedTo: undefined,
    added: undefined,
    addedFrom: undefined,
    addedTo: undefined,
    releaseYearFrom: undefined,
    releaseYearTo: undefined,
    releaseYearUnknown: undefined,
    rating: undefined,
    ratingMin: undefined,
    ratingMax: undefined,
    reviewed: undefined,
    archive: undefined,
    runtime: undefined,
    runtimeUnknown: undefined,
    item: undefined,
  }
}

function DateFilter({
  label,
  mode,
  from,
  to,
  onChange,
}: {
  label: string
  mode: 'all' | 'range' | 'unknown'
  from?: string | undefined
  to?: string | undefined
  onChange: (mode?: 'range' | 'unknown', from?: string, to?: string) => void
}) {
  return (
    <fieldset className={controlsStyles['date-filter']} data-ui="date-filter">
      <legend>{label}</legend>
      <LibrarySelect
        aria-label={label}
        value={mode}
        onValueChange={(value) => {
          const next = value as 'all' | 'range' | 'unknown'
          onChange(
            next === 'all' ? undefined : next,
            next === 'range' ? from : undefined,
            next === 'range' ? to : undefined,
          )
        }}
        options={[
          { value: 'all', label: 'Any time' },
          { value: 'range', label: 'Custom range' },
          { value: 'unknown', label: 'Date unavailable' },
        ]}
      />
      {mode === 'range' ? (
        <span>
          <Input
            type="date"
            aria-label={`${label} from`}
            value={from ?? ''}
            onChange={(event) => onChange('range', event.target.value || undefined, to)}
          />
          <Input
            type="date"
            aria-label={`${label} to`}
            value={to ?? ''}
            onChange={(event) => onChange('range', from, event.target.value || undefined)}
          />
        </span>
      ) : null}
    </fieldset>
  )
}

function MovieFilters({
  collection,
  search,
  runtimeAvailable,
  onChange,
}: {
  collection: 'archive' | 'queue'
  search: MoviesRouteSearch
  runtimeAvailable: boolean
  onChange: (patch: Partial<MoviesRouteSearch>) => void
}) {
  return (
    <LibraryFilterPanel aria-label="Movie filters" data-ui="filter-panel">
      <div className={controlsStyles['filter-panel-heading']}>
        <strong> Filters</strong>
        <Button variant="outline" type="button" onClick={() => onChange(clearMovieFilters())}>
          Clear all
        </Button>
      </div>
      <div className={controlsStyles['filter-panel-grid']}>
        {collection === 'archive' ? (
          <DateFilter
            label="Watched date"
            mode={search.watched ?? 'all'}
            from={search.watchedFrom}
            to={search.watchedTo}
            onChange={(watched, watchedFrom, watchedTo) =>
              onChange({ watched, watchedFrom, watchedTo, item: undefined })
            }
          />
        ) : (
          <DateFilter
            label="Added to watchlist"
            mode={search.added ?? 'all'}
            from={search.addedFrom}
            to={search.addedTo}
            onChange={(added, addedFrom, addedTo) =>
              onChange({ added, addedFrom, addedTo, item: undefined })
            }
          />
        )}
        <fieldset className={controlsStyles['date-filter']} data-ui="date-filter">
          <legend>Release year</legend>
          <span className="movie-year-range">
            <Input
              aria-label="Release year from"
              inputMode="numeric"
              placeholder="From"
              value={search.releaseYearFrom ?? ''}
              onChange={(event) =>
                onChange({ releaseYearFrom: event.target.value || undefined, item: undefined })
              }
            />
            <Input
              aria-label="Release year to"
              inputMode="numeric"
              placeholder="To"
              value={search.releaseYearTo ?? ''}
              onChange={(event) =>
                onChange({ releaseYearTo: event.target.value || undefined, item: undefined })
              }
            />
          </span>
          <FieldLabel className={moviesStyles['movie-filter-check']}>
            <Checkbox
              checked={search.releaseYearUnknown ?? false}
              onCheckedChange={(checked) =>
                onChange({ releaseYearUnknown: checked || undefined, item: undefined })
              }
            />{' '}
            Include unknown
          </FieldLabel>
        </fieldset>
        <fieldset className={controlsStyles['date-filter']} data-ui="date-filter">
          <legend>Your rating</legend>
          <LibrarySelect
            aria-label="Your rating"
            value={search.rating ?? 'any'}
            onValueChange={(value) =>
              onChange({
                rating: value === 'any' ? undefined : (value as MoviesRouteSearch['rating']),
                ratingMin: undefined,
                ratingMax: undefined,
                item: undefined,
              })
            }
            options={[
              { value: 'any', label: 'Any rating' },
              { value: 'rated', label: 'Rated' },
              { value: 'unrated', label: 'Unrated' },
              { value: 'range', label: 'Custom range' },
            ]}
          />
          {search.rating === 'range' ? (
            <span>
              <LibrarySelect
                aria-label="Minimum rating"
                value={String(search.ratingMin ?? '')}
                onValueChange={(value) =>
                  onChange({
                    ratingMin: value ? Number(value) : undefined,
                    item: undefined,
                  })
                }
                options={[
                  { value: '', label: 'Min' },
                  ...Array.from({ length: 10 }, (_, index) => (index + 1) / 2).map((value) => ({
                    value: String(value),
                    label: String(value),
                  })),
                ]}
              />
              <LibrarySelect
                aria-label="Maximum rating"
                value={String(search.ratingMax ?? '')}
                onValueChange={(value) =>
                  onChange({
                    ratingMax: value ? Number(value) : undefined,
                    item: undefined,
                  })
                }
                options={[
                  { value: '', label: 'Max' },
                  ...Array.from({ length: 10 }, (_, index) => (index + 1) / 2).map((value) => ({
                    value: String(value),
                    label: String(value),
                  })),
                ]}
              />
            </span>
          ) : null}
        </fieldset>
        <fieldset className={controlsStyles['date-filter']} data-ui="date-filter">
          <legend>{collection === 'archive' ? 'Review' : 'Archive status'}</legend>
          <LibrarySelect
            aria-label={collection === 'archive' ? 'Review' : 'Archive status'}
            value={(collection === 'archive' ? search.reviewed : search.archive) ?? 'any'}
            onValueChange={(value) =>
              onChange(
                collection === 'archive'
                  ? {
                      reviewed: value === 'any' ? undefined : (value as 'yes' | 'no'),
                      item: undefined,
                    }
                  : {
                      archive: value === 'any' ? undefined : (value as 'yes' | 'no'),
                      item: undefined,
                    },
              )
            }
            options={[
              { value: 'any', label: 'Any' },
              { value: 'yes', label: collection === 'archive' ? 'Reviewed' : 'In Archive' },
              { value: 'no', label: collection === 'archive' ? 'Not reviewed' : 'Not in Archive' },
            ]}
          />
        </fieldset>
        {runtimeAvailable ? (
          <fieldset className={controlsStyles['date-filter']} data-ui="date-filter">
            <legend>Runtime</legend>
            <LibrarySelect
              aria-label="Runtime"
              value={search.runtime ?? 'any'}
              onValueChange={(value) =>
                onChange({
                  runtime: value === 'any' ? undefined : (value as MoviesRouteSearch['runtime']),
                  item: undefined,
                })
              }
              options={[
                { value: 'any', label: 'Any runtime' },
                { value: 'under90', label: 'Under 90 min' },
                { value: '90to119', label: '90–119 min' },
                { value: '120to149', label: '120–149 min' },
                { value: '150plus', label: '150+ min' },
              ]}
            />
            <FieldLabel className={moviesStyles['movie-filter-check']}>
              <Checkbox
                checked={search.runtimeUnknown ?? false}
                onCheckedChange={(checked) =>
                  onChange({ runtimeUnknown: checked || undefined, item: undefined })
                }
              />{' '}
              Include unknown
            </FieldLabel>
          </fieldset>
        ) : null}
      </div>
    </LibraryFilterPanel>
  )
}

function MovieInspector({
  mediaItemId,
  search,
  onClose,
}: {
  mediaItemId: string
  search: MoviesRouteSearch
  onClose: () => void
}) {
  const [tab, setTab] = useState<'details' | 'history'>('details')
  const ref = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  const movie = useQuery({
    queryKey: ['movie', mediaItemId],
    queryFn: ({ signal }) => fetchMovie(mediaItemId, signal),
  })
  const collectionQuery = movieCollectionQuerySearch(search)
  const watchedFilters = {
    watched: collectionQuery.watched,
    watchedFrom: collectionQuery.watchedFrom,
    watchedTo: collectionQuery.watchedTo,
  }
  const history = useInfiniteQuery({
    queryKey: ['movie-history', mediaItemId, watchedFilters],
    enabled: tab === 'history',
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      fetchMovieHistory(mediaItemId, watchedFilters, pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])
  useEffect(() => {
    const inspector = ref.current
    inspector?.querySelector<HTMLElement>('button[aria-label="Close inspector"]')?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current()
    }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [mediaItemId])

  return (
    <aside
      ref={ref}
      className={cn(inspectorStyles['book-inspector'], 'movie-inspector')}
      aria-label="Movie inspector"
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
            aria-label="Movie information"
          >
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="history">
              History
              {movie.data ? ` (${movie.data.archive.lifetimeWatchCount.toLocaleString()})` : ''}
            </TabsTrigger>
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
        {movie.isPending ? (
          <LoadingState className={inspectorStyles['inspector-state']}>Loading movie…</LoadingState>
        ) : null}
        {movie.isError ? (
          <Notice className={inspectorStyles['inspector-state']}>{movie.error.message}</Notice>
        ) : null}
        {
          <TabsContent value="details" className={inspectorStyles['inspector-tab-panel']}>
            {movie.data ? <MovieDetails movie={movie.data} /> : null}
          </TabsContent>
        }
        {
          <TabsContent value="history" className={inspectorStyles['inspector-tab-panel']}>
            {movie.data ? (
              <MovieHistory
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

function MovieDetails({ movie }: { movie: MovieDetail }) {
  return (
    <div className={inspectorStyles['inspector-scroll']} data-ui="inspector-scroll">
      <header
        className={inspectorStyles['inspector-book-heading']}
        data-ui="inspector-movie-heading"
      >
        <MoviePoster movie={movie} size="inspector" />
        <div>
          <h2>{movie.displayTitle}</h2>
          <p>
            {[
              movie.releaseYear,
              movie.directors.join(', '),
              movie.runtimeMinutes ? `${movie.runtimeMinutes} min` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <span>
            {[movie.archive.active ? 'Archive' : null, movie.queue.active ? 'Queue' : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
          {movie.personal.currentRating !== null ? (
            <strong className={moviesStyles['movie-personal-rating']}>
              Your rating {movie.personal.currentRating}/5
            </strong>
          ) : null}
          {movie.personal.liked ? (
            <strong className={moviesStyles['movie-liked']}>
              <Heart aria-hidden="true" /> Liked
            </strong>
          ) : null}
        </div>
      </header>
      {movie.overview || movie.genres.length || movie.originalTitle || movie.releaseDate ? (
        <section className={inspectorStyles['inspector-section']} data-ui="inspector-section">
          <h3>Overview</h3>
          {movie.overview ? (
            <p className={booksStyles['book-description']}>{movie.overview}</p>
          ) : null}
          <dl className={inspectorStyles['detail-list']}>
            {movie.originalTitle ? (
              <>
                <dt>Original title</dt>
                <dd>{movie.originalTitle}</dd>
              </>
            ) : null}
            {movie.releaseDate ? (
              <>
                <dt>Released</dt>
                <dd>{formatDate(movie.releaseDate)}</dd>
              </>
            ) : null}
            {movie.genres.length ? (
              <>
                <dt>Genres</dt>
                <dd>{movie.genres.join(', ')}</dd>
              </>
            ) : null}
          </dl>
        </section>
      ) : null}
      <section className={inspectorStyles['inspector-section']} data-ui="inspector-section">
        <h3>Your relationship</h3>
        <dl className={inspectorStyles['detail-list']}>
          {movie.personal.currentRating !== null ? (
            <>
              <dt>Current rating</dt>
              <dd>{movie.personal.currentRating}/5</dd>
            </>
          ) : null}
          {movie.personal.liked ? (
            <>
              <dt> Liked</dt>
              <dd>Yes</dd>
            </>
          ) : null}
          {movie.archive.active ? (
            <>
              <dt>Archive</dt>
              <dd>
                {movie.archive.lifetimeWatchCount}{' '}
                {movie.archive.lifetimeWatchCount === 1 ? 'watch' : 'watches'}
                {movie.archive.latestKnownWatchedOn
                  ? ` · latest ${formatDate(movie.archive.latestKnownWatchedOn)}`
                  : ''}
                {movie.archive.hasUnknownWatchedDate ? ' · includes a watch with unknown date' : ''}
              </dd>
            </>
          ) : null}
          {movie.queue.active ? (
            <>
              <dt>Queue</dt>
              <dd>
                {movie.queue.addedOn
                  ? `Added ${formatDate(movie.queue.addedOn)}`
                  : 'Added date unavailable'}
              </dd>
            </>
          ) : null}
          {movie.personal.reviewed ? (
            <>
              <dt>Reviewed occurrences</dt>
              <dd>{movie.personal.reviewedOccurrenceCount.toLocaleString()}</dd>
            </>
          ) : null}
        </dl>
      </section>
      {movie.directors.length || movie.cast.length ? (
        <section className={inspectorStyles['inspector-section']} data-ui="inspector-section">
          <h3>Credits</h3>
          <dl className={inspectorStyles['detail-list']}>
            {movie.directors.length ? (
              <>
                <dt>{movie.enrichment.mediaType === 'tv' ? 'Creators' : 'Director'}</dt>
                <dd>{movie.directors.join(', ')}</dd>
              </>
            ) : null}
            {movie.cast.length ? (
              <>
                <dt>Cast</dt>
                <dd>{movie.cast.map((person) => person.name).join(', ')}</dd>
              </>
            ) : null}
          </dl>
        </section>
      ) : null}
      <section className={inspectorStyles['inspector-section']} data-ui="inspector-section">
        <h3>Sources</h3>
        {movie.source.letterboxdUrl ? (
          <p>
            <a href={movie.source.letterboxdUrl} target="_blank" rel="noreferrer">
              Open on Letterboxd <ExternalLink aria-hidden="true" />
            </a>
          </p>
        ) : (
          <p>Letterboxd link unavailable.</p>
        )}
        <p>
          {movie.source.lastCompleteExportAt
            ? `Letterboxd history imported ${formatDate(movie.source.lastCompleteExportAt)}`
            : 'Letterboxd export freshness unavailable'}
        </p>
        {movie.source.tmdbUrl ? (
          <>
            <a
              className={inspectorStyles['tmdb-attribution']}
              href="https://www.themoviedb.org"
              target="_blank"
              rel="noreferrer"
              aria-label="The Movie Database"
            >
              <img src="/tmdb-logo.svg" alt="TMDB" />
            </a>
            <p>
              <a href={movie.source.tmdbUrl} target="_blank" rel="noreferrer">
                Open on TMDB <ExternalLink aria-hidden="true" />
              </a>
            </p>
            <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
          </>
        ) : (
          <p>TMDB metadata is {movie.source.metadataStatus.replaceAll('_', ' ')}.</p>
        )}
        {movie.source.imdbUrl ? (
          <p>
            <a href={movie.source.imdbUrl} target="_blank" rel="noreferrer">
              Open on IMDb <ExternalLink aria-hidden="true" />
            </a>
          </p>
        ) : null}
      </section>
    </div>
  )
}

function MovieHistory({
  entries,
  pending,
  error,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  entries: MovieHistoryEntry[]
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
      <div className={cn(inspectorStyles['history-list'], inspectorStyles['movie-history-list'])}>
        {entries.length === 0 ? <p>No viewing history is available.</p> : null}
        {entries.map((entry) => (
          <article key={entry.archiveEntryId}>
            <span
              className={cn(inspectorStyles['history-mark'], 'history-read')}
              aria-hidden="true"
            >
              <Check />
            </span>
            <div>
              <strong>
                {entry.watchedAt
                  ? `Watched ${formatDate(entry.watchedAt.value)}`
                  : 'Watched — date unknown'}
              </strong>
              {entry.matchesFilter ? <small>Matches filter</small> : null}
              {entry.rating ? <p>{entry.rating.value}/5</p> : null}
              {entry.sourceRewatch ? <p>Marked as a rewatch</p> : null}
              {entry.reviewText ? (
                <p className={moviesStyles['movie-review']}>{entry.reviewText}</p>
              ) : null}
              {(entry.letterboxdLogUrl ?? entry.letterboxdFilmUrl) ? (
                <a
                  href={entry.letterboxdLogUrl ?? entry.letterboxdFilmUrl ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                >
                  {entry.letterboxdLogUrl ? 'Open Diary entry' : 'Open film on Letterboxd'}{' '}
                  <ExternalLink aria-hidden="true" />
                </a>
              ) : null}
              {entry.sourceRecordedAt ? (
                <small>Recorded by Letterboxd {formatDate(entry.sourceRecordedAt.value)}</small>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      {hasMore ? (
        <Button
          variant="outline"
          className={workspaceStyles['load-more']}
          type="button"
          disabled={loadingMore}
          onClick={onLoadMore}
        >
          {loadingMore ? 'Loading…' : 'Load older viewings'}
        </Button>
      ) : null}
    </div>
  )
}
