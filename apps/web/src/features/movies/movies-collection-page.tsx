import { useEffect, useMemo, useRef, useState, type Ref } from 'react'
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
  Grid2X2,
  Heart,
  List,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'

import type { MovieCollectionItem, MovieDetail, MovieHistoryEntry } from '@media-tracker/contracts'

import { fetchMovie, fetchMovieHistory, fetchMovies, type MoviesRequest } from './movies-api'
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
        className={`movie-poster movie-poster-${size}`}
        src={movie.posterUrl}
        alt={`Poster for ${movie.displayTitle}`}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <span
      className={`movie-poster movie-poster-${size} movie-poster-fallback`}
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

function sortOptions(collection: 'archive' | 'queue', hasSearch: boolean, runtime: boolean) {
  const options =
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
  const view = search.view ?? 'grid'

  const updateSearch = (patch: Partial<MoviesRouteSearch>) => {
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

  const closeInspector = () => {
    const target = selectedRef.current
    updateSearch({ item: undefined })
    requestAnimationFrame(() => target?.focus())
  }

  const request = useMemo<MoviesRequest>(
    () => ({
      collection,
      ...movieCollectionQuerySearch(search),
      limit: 48,
    }),
    [collection, search],
  )
  const movies = useInfiniteQuery({
    queryKey: ['movies', request],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      fetchMovies(
        { ...request, ...(pageParam === undefined ? {} : { cursor: pageParam }) },
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })
  const pages = movies.data?.pages ?? []
  const items = pages.flatMap((page) => page.data)
  const summary = pages[0]
  const count = summary?.filteredCount ?? 0
  const filters = activeFilters(search, collection)
  const selectedSort = defaultSort(collection, search)
  const direction = defaultDirection(selectedSort, search.direction)

  return (
    <section
      className={`books-page movies-page movies-view-${view}`}
      aria-labelledby="movies-title"
    >
      <div className="books-collection">
        <header className="books-header">
          <div>
            <span className="eyebrow">Library</span>
            <h1 id="movies-title">Movies</h1>
          </div>
          <nav className="books-tabs" aria-label="Movie collections">
            <Link
              to="/library/movies/archive"
              search={normalizedForMovieCollection(search, 'archive')}
              activeProps={{ 'aria-current': 'page', className: 'active' }}
            >
              Archive <span>{summary?.membershipCounts.archiveItems ?? '—'}</span>
            </Link>
            <Link
              to="/library/movies/queue"
              search={normalizedForMovieCollection(search, 'queue')}
              activeProps={{ 'aria-current': 'page', className: 'active' }}
            >
              Queue <span>{summary?.membershipCounts.queueItems ?? '—'}</span>
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
              updateSearch({
                q: value || undefined,
                sort: undefined,
                direction: undefined,
                item: undefined,
              })
            }}
          >
            <Search aria-hidden="true" />
            <input
              aria-label="Search movies"
              placeholder="Search title, year, or review"
              value={draftSearch ?? search.q ?? ''}
              onChange={(event) => setDraftSearch(event.target.value)}
            />
            {(draftSearch ?? search.q) ? (
              <button
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
            <span className="sr-only">Sort movies</span>
            <select
              value={selectedSort}
              onChange={(event) =>
                updateSearch({ sort: event.target.value, direction: undefined, item: undefined })
              }
            >
              {sortOptions(
                collection,
                Boolean(search.q),
                summary?.facets.runtimeAvailable ?? false,
              ).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="sort-direction"
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
          </button>
          <div className="layout-toggle" aria-label="Result layout">
            <button
              type="button"
              aria-label="Grid view"
              aria-pressed={view === 'grid'}
              onClick={() => updateSearch({ view: 'grid' })}
            >
              <Grid2X2 aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="List view"
              aria-pressed={view === 'list'}
              onClick={() => updateSearch({ view: 'list' })}
            >
              <List aria-hidden="true" />
            </button>
          </div>
        </div>

        {filtersOpen ? (
          <MovieFilters
            collection={collection}
            search={search}
            runtimeAvailable={summary?.facets.runtimeAvailable ?? false}
            onChange={updateSearch}
          />
        ) : null}

        <div className="books-result-summary" aria-live="polite">
          {movies.isPending ? (
            <span>Loading movies…</span>
          ) : (
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

        {movies.isError ? (
          <div className="books-state books-state-error" role="alert">
            <h2>Movies could not be loaded</h2>
            <p>{movies.error.message}</p>
            <button type="button" onClick={() => void movies.refetch()}>
              Try again
            </button>
          </div>
        ) : null}

        {!movies.isPending && !movies.isError && items.length === 0 ? (
          <div className="books-state">
            <Film aria-hidden="true" />
            <h2>{filters || search.q ? 'No matching movies' : `No movies in ${collection}`}</h2>
            <p>
              {filters || search.q
                ? 'Clear search or filters to broaden this view.'
                : 'Import Letterboxd from Connections to populate this collection.'}
            </p>
            {filters || search.q ? (
              <button
                type="button"
                onClick={() => {
                  setDraftSearch(null)
                  updateSearch(clearMovieFilters())
                }}
              >
                Clear search and filters
              </button>
            ) : (
              <Link to="/connections">Open Connections</Link>
            )}
          </div>
        ) : null}

        {items.length > 0 ? (
          <div className={view === 'grid' ? 'movies-grid' : 'movies-list'}>
            {items.map((movie) => (
              <MovieResult
                key={movie.id}
                movie={movie}
                collection={collection}
                view={view}
                selected={search.item === movie.id}
                buttonRef={search.item === movie.id ? selectedRef : undefined}
                onSelect={() => updateSearch({ item: movie.id })}
              />
            ))}
          </div>
        ) : null}

        {movies.hasNextPage ? (
          <button
            className="load-more"
            type="button"
            disabled={movies.isFetchingNextPage}
            onClick={() => void movies.fetchNextPage()}
          >
            {movies.isFetchingNextPage ? 'Loading…' : 'Load more movies'}
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
          <MovieInspector mediaItemId={search.item} search={search} onClose={closeInspector} />
        </>
      ) : null}
    </section>
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
  const director = movie.directors.length ? movie.directors.join(', ') : 'Director unavailable'
  if (view === 'grid') {
    return (
      <button
        type="button"
        ref={buttonRef}
        className={selected ? 'movie-card selected' : 'movie-card'}
        aria-pressed={selected}
        aria-label={`${movie.displayTitle}${movie.releaseYear ? `, ${movie.releaseYear}` : ''}`}
        onClick={onSelect}
      >
        <MoviePoster movie={movie} />
        <strong>{movie.displayTitle}</strong>
        <span>{[movie.releaseYear, director].filter(Boolean).join(' · ')}</span>
      </button>
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
    <button
      type="button"
      ref={buttonRef}
      className={selected ? 'movie-row selected' : 'movie-row'}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <MoviePoster movie={movie} size="row" />
      <span className="movie-row-title">
        <strong>{movie.displayTitle}</strong>
        <small>{movie.releaseYear ?? 'Year unavailable'}</small>
      </span>
      <span className="movie-row-director">{director}</span>
      <span className="movie-row-context">{context}</span>
      <span className="movie-row-rating">
        {movie.personal.currentRating === null ? '—' : `${movie.personal.currentRating}/5`}
      </span>
      <ChevronRight aria-hidden="true" />
    </button>
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
    <fieldset className="date-filter">
      <legend>{label}</legend>
      <select
        value={mode}
        onChange={(event) => {
          const next = event.target.value as 'all' | 'range' | 'unknown'
          onChange(
            next === 'all' ? undefined : next,
            next === 'range' ? from : undefined,
            next === 'range' ? to : undefined,
          )
        }}
      >
        <option value="all">Any time</option>
        <option value="range">Custom range</option>
        <option value="unknown">Date unavailable</option>
      </select>
      {mode === 'range' ? (
        <span>
          <input
            type="date"
            aria-label={`${label} from`}
            value={from ?? ''}
            onChange={(event) => onChange('range', event.target.value || undefined, to)}
          />
          <input
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
    <section className="filter-panel" aria-label="Movie filters">
      <div className="filter-panel-heading">
        <strong>Filters</strong>
        <button type="button" onClick={() => onChange(clearMovieFilters())}>
          Clear all
        </button>
      </div>
      <div className="filter-panel-grid">
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
        <fieldset className="date-filter">
          <legend>Release year</legend>
          <span className="movie-year-range">
            <input
              aria-label="Release year from"
              inputMode="numeric"
              placeholder="From"
              value={search.releaseYearFrom ?? ''}
              onChange={(event) =>
                onChange({ releaseYearFrom: event.target.value || undefined, item: undefined })
              }
            />
            <input
              aria-label="Release year to"
              inputMode="numeric"
              placeholder="To"
              value={search.releaseYearTo ?? ''}
              onChange={(event) =>
                onChange({ releaseYearTo: event.target.value || undefined, item: undefined })
              }
            />
          </span>
          <label className="movie-filter-check">
            <input
              type="checkbox"
              checked={search.releaseYearUnknown ?? false}
              onChange={(event) =>
                onChange({ releaseYearUnknown: event.target.checked || undefined, item: undefined })
              }
            />{' '}
            Include unknown
          </label>
        </fieldset>
        <fieldset className="date-filter">
          <legend>Your rating</legend>
          <select
            value={search.rating ?? 'any'}
            onChange={(event) =>
              onChange({
                rating:
                  event.target.value === 'any'
                    ? undefined
                    : (event.target.value as MoviesRouteSearch['rating']),
                ratingMin: undefined,
                ratingMax: undefined,
                item: undefined,
              })
            }
          >
            <option value="any">Any rating</option>
            <option value="rated">Rated</option>
            <option value="unrated">Unrated</option>
            <option value="range">Custom range</option>
          </select>
          {search.rating === 'range' ? (
            <span>
              <select
                aria-label="Minimum rating"
                value={search.ratingMin ?? ''}
                onChange={(event) =>
                  onChange({
                    ratingMin: event.target.value ? Number(event.target.value) : undefined,
                    item: undefined,
                  })
                }
              >
                <option value="">Min</option>
                {Array.from({ length: 10 }, (_, index) => (index + 1) / 2).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <select
                aria-label="Maximum rating"
                value={search.ratingMax ?? ''}
                onChange={(event) =>
                  onChange({
                    ratingMax: event.target.value ? Number(event.target.value) : undefined,
                    item: undefined,
                  })
                }
              >
                <option value="">Max</option>
                {Array.from({ length: 10 }, (_, index) => (index + 1) / 2).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </span>
          ) : null}
        </fieldset>
        <fieldset className="date-filter">
          <legend>{collection === 'archive' ? 'Review' : 'Archive status'}</legend>
          <select
            value={(collection === 'archive' ? search.reviewed : search.archive) ?? 'any'}
            onChange={(event) =>
              onChange(
                collection === 'archive'
                  ? {
                      reviewed:
                        event.target.value === 'any'
                          ? undefined
                          : (event.target.value as 'yes' | 'no'),
                      item: undefined,
                    }
                  : {
                      archive:
                        event.target.value === 'any'
                          ? undefined
                          : (event.target.value as 'yes' | 'no'),
                      item: undefined,
                    },
              )
            }
          >
            <option value="any">Any</option>
            <option value="yes">{collection === 'archive' ? 'Reviewed' : 'In Archive'}</option>
            <option value="no">
              {collection === 'archive' ? 'Not reviewed' : 'Not in Archive'}
            </option>
          </select>
        </fieldset>
        {runtimeAvailable ? (
          <fieldset className="date-filter">
            <legend>Runtime</legend>
            <select
              value={search.runtime ?? 'any'}
              onChange={(event) =>
                onChange({
                  runtime:
                    event.target.value === 'any'
                      ? undefined
                      : (event.target.value as MoviesRouteSearch['runtime']),
                  item: undefined,
                })
              }
            >
              <option value="any">Any runtime</option>
              <option value="under90">Under 90 min</option>
              <option value="90to119">90–119 min</option>
              <option value="120to149">120–149 min</option>
              <option value="150plus">150+ min</option>
            </select>
            <label className="movie-filter-check">
              <input
                type="checkbox"
                checked={search.runtimeUnknown ?? false}
                onChange={(event) =>
                  onChange({ runtimeUnknown: event.target.checked || undefined, item: undefined })
                }
              />{' '}
              Include unknown
            </label>
          </fieldset>
        ) : null}
      </div>
    </section>
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
    inspector?.querySelector<HTMLElement>('.inspector-close')?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current()
    }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [mediaItemId])

  return (
    <aside ref={ref} className="book-inspector movie-inspector" aria-label="Movie inspector">
      <div className="inspector-topbar">
        <div className="inspector-tabs" role="tablist" aria-label="Movie information">
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
            History{movie.data ? ` (${movie.data.archive.lifetimeWatchCount})` : ''}
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
      {movie.isPending ? <div className="inspector-state">Loading movie…</div> : null}
      {movie.isError ? (
        <div className="inspector-state" role="alert">
          {movie.error.message}
        </div>
      ) : null}
      {movie.data && tab === 'details' ? <MovieDetails movie={movie.data} /> : null}
      {movie.data && tab === 'history' ? (
        <MovieHistory
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

function MovieDetails({ movie }: { movie: MovieDetail }) {
  return (
    <div className="inspector-scroll">
      <header className="inspector-book-heading inspector-movie-heading">
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
            <strong className="movie-personal-rating">
              Your rating {movie.personal.currentRating}/5
            </strong>
          ) : null}
          {movie.personal.liked ? (
            <strong className="movie-liked">
              <Heart aria-hidden="true" /> Liked
            </strong>
          ) : null}
        </div>
      </header>
      {movie.overview || movie.genres.length || movie.originalTitle || movie.releaseDate ? (
        <section className="inspector-section">
          <h3>Overview</h3>
          {movie.overview ? <p className="book-description">{movie.overview}</p> : null}
          <dl className="detail-list">
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
      <section className="inspector-section">
        <h3>Your relationship</h3>
        <dl className="detail-list">
          {movie.personal.currentRating !== null ? (
            <>
              <dt>Current rating</dt>
              <dd>{movie.personal.currentRating}/5</dd>
            </>
          ) : null}
          {movie.personal.liked ? (
            <>
              <dt>Liked</dt>
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
        <section className="inspector-section">
          <h3>Credits</h3>
          <dl className="detail-list">
            {movie.directors.length ? (
              <>
                <dt>Director</dt>
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
      <section className="inspector-section">
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
        <p>TMDB not configured. Catalog artwork and details are unavailable.</p>
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
  if (pending) return <div className="inspector-state">Loading history…</div>
  if (error) return <div className="inspector-state">{error}</div>
  return (
    <div className="inspector-scroll">
      <div className="history-list movie-history-list">
        {entries.length === 0 ? <p>No viewing history is available.</p> : null}
        {entries.map((entry) => (
          <article key={entry.archiveEntryId}>
            <span className="history-mark history-read" aria-hidden="true">
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
              {entry.reviewText ? <p className="movie-review">{entry.reviewText}</p> : null}
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
        <button className="load-more" type="button" disabled={loadingMore} onClick={onLoadMore}>
          {loadingMore ? 'Loading…' : 'Load older viewings'}
        </button>
      ) : null}
    </div>
  )
}
