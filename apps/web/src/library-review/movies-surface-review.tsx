import { useMemo, useState, type ReactNode } from 'react'
import {
  ArrowDownUp,
  ChevronDown,
  ExternalLink,
  Film,
  Grid2X2,
  Heart,
  List,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'

import './movies-surface-review.css'

export type MoviesCollectionView = 'archive' | 'queue'
export type MoviesCollectionLayout = 'grid' | 'list'
export type MoviesInspectorTab = 'details' | 'history'

export interface MoviesReviewDate {
  label: string
  /** ISO calendar day. It is compared as a day and is never timezone-shifted. */
  iso?: string
}

export interface MoviesReviewPoster {
  src?: string | null
  alt?: string
}

export interface MoviesReviewPerson {
  id?: string
  name: string
  character?: string
}

export interface MoviesReviewViewing {
  id: string
  watchedAt: MoviesReviewDate | null
  rating?: number | null
  reviewText?: string | null | undefined
  markedAsRewatch?: boolean
  matchesCurrentFilter?: boolean
  letterboxdUrl?: string | null
  linkLabel?: 'Open Diary entry' | 'Open review on Letterboxd' | 'Open film on Letterboxd'
  recordedByLetterboxdLabel?: string | null
  connectionLabel?: string | null
  evidenceRoles?: string[]
}

export interface MoviesReviewSourceLink {
  label: 'Letterboxd film' | 'TMDB movie' | 'IMDb' | string
  href: string
}

export interface MoviesReviewSources {
  links: MoviesReviewSourceLink[]
  letterboxdHistoryLabel?: string | null
  movieMetadataLabel?: string | null
  tmdbNotice?: string | null
  technicalProvenance?: string[]
}

export interface MoviesReviewMovie {
  id: string
  displayTitle: string | null
  importedTitle?: string | null
  releaseYear?: number | null
  releaseLabel?: string | null
  poster?: MoviesReviewPoster | null
  directors: MoviesReviewPerson[]
  runtimeMinutes?: number | null
  personal: {
    currentRating?: number | null
    liked: boolean
  }
  memberships: {
    archive: boolean
    queue: boolean
  }
  archive?:
    | {
        lifetimeWatchCount: number
        matchingWatchCount?: number
        referenceWatchedAt?: MoviesReviewDate | null
        latestKnownWatchedAt?: MoviesReviewDate | null
        hasUnknownWatchedDate?: boolean
      }
    | null
    | undefined
  queue?:
    | {
        addedAt: MoviesReviewDate | null
      }
    | null
    | undefined
  overview?: string | null
  tagline?: string | null
  genres?: string[]
  originalTitle?: string | null
  originalLanguage?: string | null
  productionCountries?: string[]
  cast?: MoviesReviewPerson[]
  tmdbRating?: {
    value: number
    voteCount?: number
  } | null
  sources?: MoviesReviewSources | null
  viewings: MoviesReviewViewing[]
}

export interface MoviesSurfaceReviewProps {
  movies: MoviesReviewMovie[]
  counts: {
    archive: number
    queue: number
    watchOccurrences?: number
  }
  initialView?: MoviesCollectionView
  initialLayout?: MoviesCollectionLayout
  initialSelectedId?: string
  initialInspectorTab?: MoviesInspectorTab
  /** Server-owned filter labels may be supplied while this artifact demonstrates the local controls. */
  filterSummary?: string[]
  className?: string
}

type DateFilter = 'any' | 'known' | 'unknown'
type RatingFilter = 'any' | 'rated' | 'unrated'
type BooleanFilter = 'any' | 'yes' | 'no'
type MovieSort =
  | 'relationship-desc'
  | 'relationship-asc'
  | 'title-asc'
  | 'title-desc'
  | 'year-desc'
  | 'rating-desc'
  | 'watches-desc'
  | 'runtime-asc'

const cx = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' ')

function movieTitle(movie: MoviesReviewMovie) {
  return movie.displayTitle?.trim() || movie.importedTitle?.trim() || 'Untitled movie'
}

function peopleLabel(people: MoviesReviewPerson[], limit?: number) {
  const names = people.map((person) => person.name).filter(Boolean)
  if (limit && names.length > limit)
    return `${names.slice(0, limit).join(', ')} +${names.length - limit}`
  return names.join(', ')
}

function ratingLabel(rating: number | null | undefined) {
  return rating == null ? null : `${rating.toFixed(1)} / 5`
}

function safeExternalHref(href: string) {
  try {
    const parsed = new URL(href)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : undefined
  } catch {
    return undefined
  }
}

function Poster({
  movie,
  size = 'card',
}: {
  movie: MoviesReviewMovie
  size?: 'card' | 'thumb' | 'hero'
}) {
  const title = movieTitle(movie)
  const [imageFailed, setImageFailed] = useState(false)
  if (movie.poster?.src && !imageFailed) {
    return (
      <img
        className={`movies-review-poster movies-review-poster--${size}`}
        src={movie.poster.src}
        alt={movie.poster.alt ?? `Poster for ${title}`}
        onError={() => setImageFailed(true)}
      />
    )
  }

  const initial = title.match(/[\p{L}\p{N}]/u)?.[0]?.toLocaleUpperCase() ?? '—'
  return (
    <span
      className={`movies-review-poster movies-review-poster--${size} movies-review-poster--missing`}
      role="img"
      aria-label={`No poster available for ${title}`}
    >
      <Film aria-hidden="true" />
      <strong>{initial}</strong>
    </span>
  )
}

function IconButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string
  pressed?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="movies-review-icon-button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function GridCard({
  movie,
  selected,
  onSelect,
}: {
  movie: MoviesReviewMovie
  selected: boolean
  onSelect: () => void
}) {
  const title = movieTitle(movie)
  const directors = peopleLabel(movie.directors, 2)

  return (
    <button
      type="button"
      className={cx('movies-review-grid-card', selected && 'is-selected')}
      aria-pressed={selected}
      aria-label={`Inspect ${title}`}
      onClick={onSelect}
    >
      <Poster movie={movie} />
      <span className="movies-review-card-copy">
        <strong title={title}>{title}</strong>
        {(movie.releaseYear != null || directors) && (
          <span className="movies-review-card-credit" title={directors || undefined}>
            {[movie.releaseYear, directors].filter(Boolean).join(' · ')}
          </span>
        )}
      </span>
    </button>
  )
}

function ListRow({
  movie,
  view,
  selected,
  onSelect,
}: {
  movie: MoviesReviewMovie
  view: MoviesCollectionView
  selected: boolean
  onSelect: () => void
}) {
  const title = movieTitle(movie)
  const directors = peopleLabel(movie.directors)

  return (
    <button
      type="button"
      className={cx('movies-review-list-row', selected && 'is-selected')}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="movies-review-list-movie">
        <Poster movie={movie} size="thumb" />
        <span>
          <strong title={title}>{title}</strong>
          <small>
            {movie.releaseYear ?? 'Year unknown'}
            {movie.personal.liked && <Heart className="is-filled" aria-label="Liked" />}
          </small>
          <small className="movies-review-list-credit-mobile">
            {directors || 'Director unavailable'}
          </small>
        </span>
      </span>
      <span className="movies-review-list-director" title={directors || undefined}>
        {directors || '—'}
      </span>
      <span>
        {view === 'archive'
          ? (movie.archive?.referenceWatchedAt?.label ?? 'Date unknown')
          : (movie.queue?.addedAt?.label ?? 'Date unknown')}
      </span>
      <span>{ratingLabel(movie.personal.currentRating) ?? '—'}</span>
    </button>
  )
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="movies-review-detail-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function FactList({ facts }: { facts: Array<[string, ReactNode]> }) {
  return (
    <dl className="movies-review-facts">
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function DetailsTab({ movie }: { movie: MoviesReviewMovie }) {
  const reviewCount = movie.viewings.filter((viewing) => viewing.reviewText?.trim()).length
  const hasOverview = Boolean(
    movie.overview ||
    movie.tagline ||
    movie.genres?.length ||
    movie.originalTitle ||
    movie.originalLanguage ||
    movie.releaseLabel ||
    movie.productionCountries?.length ||
    movie.tmdbRating,
  )
  const relationshipFacts: Array<[string, ReactNode]> = []
  if (movie.personal.currentRating != null) {
    relationshipFacts.push(['Current rating', ratingLabel(movie.personal.currentRating)])
  }
  if (movie.personal.liked) relationshipFacts.push(['Liked', 'Yes'])
  if (movie.memberships.archive) {
    const count = movie.archive?.lifetimeWatchCount ?? movie.viewings.length
    relationshipFacts.push(['In Archive', `${count} ${count === 1 ? 'watch' : 'watches'}`])
    if (movie.archive?.latestKnownWatchedAt) {
      relationshipFacts.push(['Latest watch', movie.archive.latestKnownWatchedAt.label])
    }
    if (movie.archive?.hasUnknownWatchedDate) {
      relationshipFacts.push(['Date coverage', 'Includes a watch with unknown date'])
    }
  }
  if (movie.memberships.queue) {
    relationshipFacts.push([
      'In Queue',
      movie.queue?.addedAt?.label ? `Added ${movie.queue.addedAt.label}` : 'Added date unknown',
    ])
  }
  if (reviewCount > 0)
    relationshipFacts.push([
      'Reviewed',
      `${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'}`,
    ])

  const overviewFacts: Array<[string, ReactNode]> = []
  if (movie.genres?.length) overviewFacts.push(['Genres', movie.genres.join(', ')])
  if (movie.originalTitle && movie.originalTitle !== movieTitle(movie)) {
    overviewFacts.push(['Original title', movie.originalTitle])
  }
  if (movie.originalLanguage) overviewFacts.push(['Original language', movie.originalLanguage])
  if (movie.releaseLabel) overviewFacts.push(['Released', movie.releaseLabel])
  else if (movie.releaseYear != null) overviewFacts.push(['Released', movie.releaseYear])
  if (movie.productionCountries?.length) {
    overviewFacts.push(['Production', movie.productionCountries.join(', ')])
  }
  if (movie.tmdbRating) {
    overviewFacts.push([
      'TMDB rating',
      `${movie.tmdbRating.value.toFixed(1)} / 10${movie.tmdbRating.voteCount ? ` · ${movie.tmdbRating.voteCount.toLocaleString()} votes` : ''}`,
    ])
  }

  return (
    <>
      {hasOverview && (
        <DetailSection title="Overview">
          {movie.tagline && <p className="movies-review-tagline">{movie.tagline}</p>}
          {movie.overview && <p className="movies-review-overview">{movie.overview}</p>}
          {overviewFacts.length > 0 && <FactList facts={overviewFacts} />}
        </DetailSection>
      )}
      {relationshipFacts.length > 0 && (
        <DetailSection title="Your relationship">
          <FactList facts={relationshipFacts} />
        </DetailSection>
      )}
      {(movie.directors.length > 0 || movie.cast?.length) && (
        <DetailSection title="Credits">
          <FactList
            facts={[
              ...(movie.directors.length > 0
                ? ([['Directed by', peopleLabel(movie.directors)]] as Array<[string, ReactNode]>)
                : []),
              ...(movie.cast?.length
                ? ([
                    [
                      'Cast',
                      movie.cast.slice(0, 5).map((person) => (
                        <span
                          className="movies-review-cast-member"
                          key={`${person.id ?? person.name}-${person.character ?? ''}`}
                        >
                          {person.name}
                          {person.character ? <small>{person.character}</small> : null}
                        </span>
                      )),
                    ],
                  ] as Array<[string, ReactNode]>)
                : []),
            ]}
          />
        </DetailSection>
      )}
      {movie.sources && (
        <DetailSection title="Sources">
          {movie.sources.links.length > 0 && (
            <div className="movies-review-source-links">
              {movie.sources.links.map((link) => {
                const href = safeExternalHref(link.href)
                return href ? (
                  <a key={`${link.label}-${href}`} href={href} target="_blank" rel="noreferrer">
                    {link.label}
                    <ExternalLink aria-hidden="true" />
                  </a>
                ) : null
              })}
            </div>
          )}
          {movie.sources.letterboxdHistoryLabel && <p>{movie.sources.letterboxdHistoryLabel}</p>}
          {movie.sources.movieMetadataLabel && <p>{movie.sources.movieMetadataLabel}</p>}
          {movie.sources.tmdbNotice && (
            <small className="movies-review-notice">{movie.sources.tmdbNotice}</small>
          )}
          {movie.sources.technicalProvenance?.length ? (
            <details className="movies-review-provenance">
              <summary>Technical provenance</summary>
              <ul>
                {movie.sources.technicalProvenance.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </DetailSection>
      )}
    </>
  )
}

function HistoryTab({ movie }: { movie: MoviesReviewMovie }) {
  if (movie.viewings.length === 0) {
    return <div className="movies-review-history-empty">No viewing history</div>
  }

  return (
    <div className="movies-review-history-list">
      {movie.viewings.map((viewing) => {
        const href = viewing.letterboxdUrl ? safeExternalHref(viewing.letterboxdUrl) : undefined
        return (
          <article className="movies-review-history-row" key={viewing.id}>
            <header>
              <strong>{viewing.watchedAt?.label ?? 'Watched — date unknown'}</strong>
              {viewing.matchesCurrentFilter && <span>Matches filter</span>}
            </header>
            {(viewing.rating != null || viewing.markedAsRewatch) && (
              <p className="movies-review-history-meta">
                {viewing.rating != null && <span>{ratingLabel(viewing.rating)}</span>}
                {viewing.markedAsRewatch && <span>Marked as a rewatch</span>}
              </p>
            )}
            {viewing.reviewText && (
              <p className="movies-review-review-text">{viewing.reviewText}</p>
            )}
            {href && (
              <a href={href} target="_blank" rel="noreferrer">
                {viewing.linkLabel ?? 'Open film on Letterboxd'}
                <ExternalLink aria-hidden="true" />
              </a>
            )}
            {(viewing.recordedByLetterboxdLabel ||
              viewing.connectionLabel ||
              viewing.evidenceRoles?.length) && (
              <details className="movies-review-provenance">
                <summary>Evidence</summary>
                {viewing.recordedByLetterboxdLabel && (
                  <p>Recorded by Letterboxd {viewing.recordedByLetterboxdLabel}</p>
                )}
                {viewing.connectionLabel && <p>{viewing.connectionLabel}</p>}
                {viewing.evidenceRoles?.length ? <p>{viewing.evidenceRoles.join(' · ')}</p> : null}
              </details>
            )}
          </article>
        )
      })}
    </div>
  )
}

function Inspector({
  movie,
  tab,
  onTabChange,
  onClose,
}: {
  movie: MoviesReviewMovie
  tab: MoviesInspectorTab
  onTabChange: (tab: MoviesInspectorTab) => void
  onClose: () => void
}) {
  const title = movieTitle(movie)
  const directors = peopleLabel(movie.directors)

  return (
    <aside className="movies-review-inspector" aria-label={`Details for ${title}`}>
      <div className="movies-review-inspector-topline">
        <span>Movie</span>
        <IconButton label="Close inspector" onClick={onClose}>
          <X aria-hidden="true" />
        </IconButton>
      </div>
      <header className="movies-review-inspector-header">
        <Poster movie={movie} size="hero" />
        <div>
          <h2>{title}</h2>
          {(movie.releaseYear != null || directors) && (
            <p>{[movie.releaseYear, directors].filter(Boolean).join(' · ')}</p>
          )}
          {movie.runtimeMinutes != null && <p>{movie.runtimeMinutes} min</p>}
          <div className="movies-review-inspector-signals">
            {movie.personal.currentRating != null && (
              <span>Your rating {ratingLabel(movie.personal.currentRating)}</span>
            )}
            {movie.personal.liked && (
              <span>
                <Heart className="is-filled" aria-hidden="true" /> Liked
              </span>
            )}
          </div>
          <div className="movies-review-memberships">
            {movie.memberships.archive && <span>Archive</span>}
            {movie.memberships.queue && <span>Queue</span>}
          </div>
        </div>
      </header>
      <div className="movies-review-inspector-tabs" role="tablist" aria-label="Movie information">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'details'}
          onClick={() => onTabChange('details')}
        >
          Details
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'history'}
          onClick={() => onTabChange('history')}
        >
          History <small>{movie.viewings.length}</small>
        </button>
      </div>
      <div className="movies-review-inspector-scroll">
        {tab === 'details' ? <DetailsTab movie={movie} /> : <HistoryTab movie={movie} />}
      </div>
    </aside>
  )
}

function sortDate(value: string | undefined) {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

function sortMovies(movies: MoviesReviewMovie[], sort: MovieSort, view: MoviesCollectionView) {
  return [...movies].sort((left, right) => {
    const titleOrder = movieTitle(left).localeCompare(movieTitle(right), undefined, {
      sensitivity: 'base',
    })
    if (sort === 'title-asc') return titleOrder
    if (sort === 'title-desc') return -titleOrder
    if (sort === 'year-desc')
      return (right.releaseYear ?? -1) - (left.releaseYear ?? -1) || titleOrder
    if (sort === 'rating-desc') {
      return (
        (right.personal.currentRating ?? -1) - (left.personal.currentRating ?? -1) || titleOrder
      )
    }
    if (sort === 'watches-desc') {
      return (
        (right.archive?.lifetimeWatchCount ?? 0) - (left.archive?.lifetimeWatchCount ?? 0) ||
        titleOrder
      )
    }
    if (sort === 'runtime-asc') {
      return (
        (left.runtimeMinutes ?? Number.POSITIVE_INFINITY) -
          (right.runtimeMinutes ?? Number.POSITIVE_INFINITY) || titleOrder
      )
    }
    const leftDate =
      view === 'archive' ? left.archive?.referenceWatchedAt?.iso : left.queue?.addedAt?.iso
    const rightDate =
      view === 'archive' ? right.archive?.referenceWatchedAt?.iso : right.queue?.addedAt?.iso
    const leftDateValue = sortDate(leftDate)
    const rightDateValue = sortDate(rightDate)
    if (leftDateValue == null && rightDateValue != null) return 1
    if (leftDateValue != null && rightDateValue == null) return -1
    const dateOrder = (rightDateValue ?? 0) - (leftDateValue ?? 0)
    return (sort === 'relationship-asc' ? -dateOrder : dateOrder) || titleOrder
  })
}

export function MoviesSurfaceReview({
  movies,
  counts,
  initialView = 'archive',
  initialLayout = 'grid',
  initialSelectedId,
  initialInspectorTab = 'details',
  filterSummary = [],
  className,
}: MoviesSurfaceReviewProps) {
  const [view, setView] = useState<MoviesCollectionView>(initialView)
  const [layout, setLayout] = useState<MoviesCollectionLayout>(initialLayout)
  const [selectedId, setSelectedId] = useState<string | undefined>(initialSelectedId)
  const [inspectorTab, setInspectorTab] = useState<MoviesInspectorTab>(initialInspectorTab)
  const [query, setQuery] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [dateFilters, setDateFilters] = useState<Record<MoviesCollectionView, DateFilter>>({
    archive: 'any',
    queue: 'any',
  })
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>('any')
  const [secondaryFilters, setSecondaryFilters] = useState<
    Record<MoviesCollectionView, BooleanFilter>
  >({ archive: 'any', queue: 'any' })
  const [sort, setSort] = useState<MovieSort>('relationship-desc')
  const dateFilter = dateFilters[view]
  const secondaryFilter = secondaryFilters[view]

  const filteredMovies = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    const inView = movies.filter((movie) => movie.memberships[view])
    const filtered = inView.filter((movie) => {
      if (normalizedQuery) {
        const searchText = [
          movieTitle(movie),
          movie.importedTitle,
          movie.releaseYear,
          ...movie.directors.map((person) => person.name),
          ...(movie.cast ?? []).map((person) => person.name),
          ...(movie.genres ?? []),
          ...movie.viewings.map((viewing) => viewing.reviewText),
        ]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase()
        if (!searchText.includes(normalizedQuery)) return false
      }
      const relationshipDate =
        view === 'archive' ? movie.archive?.referenceWatchedAt : movie.queue?.addedAt
      if (dateFilter === 'known' && !relationshipDate) return false
      if (dateFilter === 'unknown' && relationshipDate) return false
      if (ratingFilter === 'rated' && movie.personal.currentRating == null) return false
      if (ratingFilter === 'unrated' && movie.personal.currentRating != null) return false
      if (view === 'archive') {
        const reviewed = movie.viewings.some((viewing) => Boolean(viewing.reviewText?.trim()))
        if (secondaryFilter === 'yes' && !reviewed) return false
        if (secondaryFilter === 'no' && reviewed) return false
      } else {
        if (secondaryFilter === 'yes' && !movie.memberships.archive) return false
        if (secondaryFilter === 'no' && movie.memberships.archive) return false
      }
      return true
    })
    return sortMovies(filtered, sort, view)
  }, [dateFilter, movies, query, ratingFilter, secondaryFilter, sort, view])

  const selectedMovie = movies.find((movie) => movie.id === selectedId && movie.memberships[view])
  const appliedFilterCount = [dateFilter, ratingFilter, secondaryFilter].filter(
    (value) => value !== 'any',
  ).length
  const totalForView = view === 'archive' ? counts.archive : counts.queue
  const displayedOccurrences = filteredMovies.reduce(
    (sum, movie) =>
      sum + (movie.archive?.matchingWatchCount ?? movie.archive?.lifetimeWatchCount ?? 0),
    0,
  )

  const changeView = (nextView: MoviesCollectionView) => {
    if (
      selectedId &&
      !movies.some((movie) => movie.id === selectedId && movie.memberships[nextView])
    ) {
      setSelectedId(undefined)
    }
    setView(nextView)
    setSort('relationship-desc')
  }

  const clearFilters = () => {
    setQuery('')
    setDateFilters({ archive: 'any', queue: 'any' })
    setRatingFilter('any')
    setSecondaryFilters({ archive: 'any', queue: 'any' })
  }

  return (
    <div className={cx('movies-review', selectedMovie && 'has-inspector', className)}>
      <div className="movies-review-workspace">
        <header className="movies-review-heading">
          <div>
            <span>Library</span>
            <h1>Movies</h1>
          </div>
          <p>
            {view === 'archive' && counts.watchOccurrences != null
              ? `${counts.archive.toLocaleString()} movies · ${counts.watchOccurrences.toLocaleString()} watches`
              : `${totalForView.toLocaleString()} movies`}
          </p>
        </header>

        <nav className="movies-review-view-tabs" aria-label="Movie collections">
          <button
            type="button"
            className={view === 'archive' ? 'is-active' : ''}
            aria-current={view === 'archive' ? 'page' : undefined}
            onClick={() => changeView('archive')}
          >
            Archive <small>{counts.archive.toLocaleString()}</small>
          </button>
          <button
            type="button"
            className={view === 'queue' ? 'is-active' : ''}
            aria-current={view === 'queue' ? 'page' : undefined}
            onClick={() => changeView('queue')}
          >
            Queue <small>{counts.queue.toLocaleString()}</small>
          </button>
        </nav>

        <div className="movies-review-toolbar">
          <label className="movies-review-search">
            <Search aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search movies"
              aria-label="Search movies"
            />
            {query && (
              <button type="button" aria-label="Clear search" onClick={() => setQuery('')}>
                <X aria-hidden="true" />
              </button>
            )}
          </label>
          <button
            type="button"
            className={cx('movies-review-control', filtersOpen && 'is-active')}
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <SlidersHorizontal aria-hidden="true" />
            Filters
            {appliedFilterCount > 0 && <small>{appliedFilterCount}</small>}
          </button>
          <label className="movies-review-select-control">
            <ArrowDownUp aria-hidden="true" />
            <span className="sr-only">Sort movies</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as MovieSort)}>
              <option value="relationship-desc">
                {view === 'archive' ? 'Watched date · newest' : 'Added date · newest'}
              </option>
              <option value="relationship-asc">
                {view === 'archive' ? 'Watched date · oldest' : 'Added date · oldest'}
              </option>
              <option value="title-asc">Title · A–Z</option>
              <option value="title-desc">Title · Z–A</option>
              <option value="year-desc">Release year</option>
              <option value="rating-desc">Your rating</option>
              {view === 'archive' && <option value="watches-desc">Most watched</option>}
              <option value="runtime-asc">Runtime</option>
            </select>
            <ChevronDown aria-hidden="true" />
          </label>
          <div className="movies-review-layout-toggle" aria-label="Collection layout">
            <IconButton
              label="Grid view"
              pressed={layout === 'grid'}
              onClick={() => setLayout('grid')}
            >
              <Grid2X2 aria-hidden="true" />
            </IconButton>
            <IconButton
              label="List view"
              pressed={layout === 'list'}
              onClick={() => setLayout('list')}
            >
              <List aria-hidden="true" />
            </IconButton>
          </div>
        </div>

        {filtersOpen && (
          <div className="movies-review-filter-panel">
            <label>
              <span>{view === 'archive' ? 'Watched date' : 'Added date'}</span>
              <select
                value={dateFilter}
                onChange={(event) =>
                  setDateFilters((current) => ({
                    ...current,
                    [view]: event.target.value as DateFilter,
                  }))
                }
              >
                <option value="any">Any date</option>
                <option value="known">Known date</option>
                <option value="unknown">Date unknown</option>
              </select>
            </label>
            <label>
              <span>Your rating</span>
              <select
                value={ratingFilter}
                onChange={(event) => setRatingFilter(event.target.value as RatingFilter)}
              >
                <option value="any">Any rating</option>
                <option value="rated">Rated</option>
                <option value="unrated">Unrated</option>
              </select>
            </label>
            <label>
              <span>{view === 'archive' ? 'Review' : 'Archive status'}</span>
              <select
                value={secondaryFilter}
                onChange={(event) =>
                  setSecondaryFilters((current) => ({
                    ...current,
                    [view]: event.target.value as BooleanFilter,
                  }))
                }
              >
                <option value="any">Any</option>
                <option value="yes">{view === 'archive' ? 'Reviewed' : 'In Archive'}</option>
                <option value="no">{view === 'archive' ? 'Not reviewed' : 'Not in Archive'}</option>
              </select>
            </label>
            <button type="button" onClick={clearFilters}>
              Clear
            </button>
          </div>
        )}

        <div className="movies-review-result-meta">
          <div className="movies-review-filter-summary">
            {filterSummary.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <p>
            {filteredMovies.length.toLocaleString()}{' '}
            {filteredMovies.length === 1 ? 'movie' : 'movies'}
            {view === 'archive' && displayedOccurrences > 0
              ? ` · ${displayedOccurrences.toLocaleString()} ${displayedOccurrences === 1 ? 'watch' : 'watches'}`
              : ''}
          </p>
        </div>

        <div className="movies-review-collection-scroll">
          {filteredMovies.length === 0 ? (
            <div className="movies-review-empty">
              <Film aria-hidden="true" />
              <strong>
                {movies.some((movie) => movie.memberships[view])
                  ? 'No matching movies'
                  : `No movies in ${view === 'archive' ? 'Archive' : 'Queue'}`}
              </strong>
              <p>
                {view === 'archive'
                  ? 'Archive comes from Letterboxd viewing history.'
                  : 'Queue comes from the Letterboxd watchlist.'}
              </p>
              {(query || appliedFilterCount > 0) && (
                <button type="button" onClick={clearFilters}>
                  Clear search and filters
                </button>
              )}
            </div>
          ) : layout === 'grid' ? (
            <div className="movies-review-grid">
              {filteredMovies.map((movie) => (
                <GridCard
                  key={movie.id}
                  movie={movie}
                  selected={movie.id === selectedId}
                  onSelect={() => {
                    setSelectedId(movie.id)
                    setInspectorTab('details')
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="movies-review-list" role="table" aria-label={`${view} movies`}>
              <div className="movies-review-list-header" role="row">
                <span>Movie</span>
                <span>Director</span>
                <span>{view === 'archive' ? 'Last watched' : 'Added'}</span>
                <span>Your rating</span>
              </div>
              {filteredMovies.map((movie) => (
                <ListRow
                  key={movie.id}
                  movie={movie}
                  view={view}
                  selected={movie.id === selectedId}
                  onSelect={() => {
                    setSelectedId(movie.id)
                    setInspectorTab('details')
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      {selectedMovie && (
        <Inspector
          movie={selectedMovie}
          tab={inspectorTab}
          onTabChange={setInspectorTab}
          onClose={() => setSelectedId(undefined)}
        />
      )}
    </div>
  )
}
