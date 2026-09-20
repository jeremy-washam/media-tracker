import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import {
  ArrowDownWideNarrow,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  Grid2X2,
  List,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'

import './books-surface-review.css'

export type BooksCollectionView = 'archive' | 'queue'
export type BooksCollectionLayout = 'grid' | 'list'

export interface BooksReviewAuthor {
  id: string
  name: string
}

export interface BooksReviewCover {
  src?: string
  alt: string
  /** Optional review-art colors. Production data can omit these. */
  color?: string
  ink?: string
}

export interface BooksReviewSeries {
  id: string
  name: string
  /** Preserve the exact Hardcover position, including decimal positions. */
  position: number | string
  totalBooks?: number
  compilation?: boolean
}

export interface BooksReviewProgress {
  label: string
  value?: number
  maximum?: number
}

export interface BooksReviewEdition {
  format?: string
  information?: string
  extent?: string
  publisher?: string
  releaseLabel?: string
  language?: string
  identifiers?: string[]
}

export interface BooksReviewCommunity {
  ratingLabel?: string
  genres?: string[]
  moods?: string[]
  pace?: string
}

export interface BooksReviewSource {
  label: string
  href?: string
  refreshedLabel?: string
  coverageLabel?: string
}

export type BooksReviewHistoryKind = 'reading' | 'read' | 'added' | 'rating' | 'review'

export interface BooksReviewHistoryEntry {
  id: string
  kind: BooksReviewHistoryKind
  label: string
  dateLabel?: string
  detail?: string
  matchesFilters?: boolean
}

export interface BooksReviewBook {
  id: string
  title: string
  subtitle?: string
  authors: BooksReviewAuthor[]
  cover?: BooksReviewCover
  memberships: {
    archive: boolean
    queue: boolean
    /** Currently Reading remains inside Queue until completion. */
    currentlyReading?: boolean
  }
  latestReadLabel?: string
  addedLabel?: string
  rating?: number
  supportedReads?: number
  progress?: BooksReviewProgress
  description?: string
  publicationLabel?: string
  pageCountLabel?: string
  series?: BooksReviewSeries[]
  contributors?: Array<{ role: string; names: string[] }>
  selectedEdition?: BooksReviewEdition
  community?: BooksReviewCommunity
  source?: BooksReviewSource
  history: BooksReviewHistoryEntry[]
}

export interface BooksSurfaceReviewProps {
  books: BooksReviewBook[]
  counts: {
    archive: number
    queue: number
    supportedReads?: number
  }
  initialView?: BooksCollectionView
  initialLayout?: BooksCollectionLayout
  initialSelectedId?: string
  /** Human-readable chips, for example “Read: 2024” or “Format: Audiobook”. */
  filterSummary?: string[]
  className?: string
}

const joinClassNames = (...values: Array<string | false | undefined>) =>
  values.filter(Boolean).join(' ')

function authorsLabel(authors: BooksReviewAuthor[]) {
  if (authors.length === 0) return 'Author unavailable'
  if (authors.length === 1) return authors[0]!.name
  if (authors.length === 2) return `${authors[0]!.name} and ${authors[1]!.name}`
  return `${authors[0]!.name}, ${authors[1]!.name} +${authors.length - 2}`
}

function Cover({
  book,
  size = 'card',
}: {
  book: BooksReviewBook
  size?: 'card' | 'thumb' | 'hero'
}) {
  const [imageFailed, setImageFailed] = useState(false)

  if (book.cover?.src && !imageFailed) {
    return (
      <img
        className={`books-review-cover books-review-cover--${size}`}
        src={book.cover.src}
        alt={book.cover.alt}
        onError={() => setImageFailed(true)}
      />
    )
  }

  const style = {
    '--book-cover': book.cover?.color ?? 'color-mix(in srgb, var(--muted) 80%, var(--card))',
    '--book-ink': book.cover?.ink ?? 'var(--foreground)',
  } as CSSProperties

  return (
    <div
      className={`books-review-cover books-review-cover--${size} books-review-cover--fallback`}
      style={style}
      role="img"
      aria-label={book.cover?.alt ?? `No cover available for ${book.title}`}
    >
      <span>{authorsLabel(book.authors)}</span>
      <strong>{book.title}</strong>
      <i aria-hidden="true" />
    </div>
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
      className="books-review-icon-button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function SeriesPosition({ series }: { series: BooksReviewSeries }) {
  const numericPosition =
    typeof series.position === 'number' ? series.position : Number(series.position)
  const total = series.totalBooks
  const canDrawSequence =
    Number.isInteger(numericPosition) &&
    numericPosition > 0 &&
    total !== undefined &&
    total > 1 &&
    total <= 8 &&
    numericPosition <= total

  return (
    <div className="books-review-series-card">
      <div>
        <strong>{series.name}</strong>
        <span>
          Position {series.position}
          {total ? ` of ${total}` : ''}
          {series.compilation ? ' · Compilation' : ''}
        </span>
      </div>
      {canDrawSequence && (
        <div
          className="books-review-series-sequence"
          aria-label={`Position ${series.position} of ${total}`}
        >
          {Array.from({ length: total }, (_, index) => index + 1).map((position) => (
            <span
              key={position}
              className={position === numericPosition ? 'is-current' : ''}
              aria-hidden="true"
            >
              {position}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="books-review-detail-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function BookGridCard({
  book,
  selected,
  onSelect,
}: {
  book: BooksReviewBook
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={joinClassNames('books-review-grid-card', selected && 'is-selected')}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="books-review-cover-wrap">
        <Cover book={book} />
      </span>
      <strong>{book.title}</strong>
      <span>{authorsLabel(book.authors)}</span>
    </button>
  )
}

function BookListRow({
  book,
  view,
  selected,
  onSelect,
}: {
  book: BooksReviewBook
  view: BooksCollectionView
  selected: boolean
  onSelect: () => void
}) {
  const firstSeries = book.series?.[0]
  const context =
    view === 'archive'
      ? [book.latestReadLabel, book.rating === undefined ? undefined : `${book.rating}/5`]
          .filter(Boolean)
          .join(' · ')
      : book.addedLabel

  return (
    <button
      type="button"
      className={joinClassNames('books-review-list-row', selected && 'is-selected')}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="books-review-list-identity">
        <Cover book={book} size="thumb" />
        <span>
          <strong>{book.title}</strong>
          <small>{authorsLabel(book.authors)}</small>
        </span>
      </span>
      <span className="books-review-list-series">
        {firstSeries ? (
          <>
            <strong>{firstSeries.name}</strong>
            <small>Position {firstSeries.position}</small>
          </>
        ) : (
          <small>Not in a series</small>
        )}
      </span>
      <span className="books-review-list-published">{book.publicationLabel ?? 'Unknown'}</span>
      <span className="books-review-list-context">
        <span>{context || 'Date unavailable'}</span>
      </span>
    </button>
  )
}

function Inspector({ book, onClose }: { book: BooksReviewBook; onClose: () => void }) {
  const [tab, setTab] = useState<'details' | 'history'>('details')
  const hasOverview = Boolean(book.description || book.publicationLabel || book.pageCountLabel)
  const hasContributors = Boolean(book.contributors?.length)
  const hasEdition = Boolean(book.selectedEdition)
  const hasCommunity = Boolean(
    book.community?.ratingLabel ||
    book.community?.genres?.length ||
    book.community?.moods?.length ||
    book.community?.pace,
  )

  return (
    <aside className="books-review-inspector" aria-label={`Details for ${book.title}`}>
      <header>
        <span>Book</span>
        <IconButton label="Close inspector" onClick={onClose}>
          <X />
        </IconButton>
      </header>
      <div className="books-review-inspector-scroll">
        <div className="books-review-inspector-hero">
          <Cover book={book} size="hero" />
          <div>
            <h2>{book.title}</h2>
            {book.subtitle && <p>{book.subtitle}</p>}
            <span>{authorsLabel(book.authors)}</span>
          </div>
        </div>
        <div className="books-review-memberships" aria-label="Library membership">
          {book.memberships.archive && <span>Archive</span>}
          {book.memberships.queue && <span>Queue</span>}
        </div>
        <div className="books-review-inspector-tabs" role="tablist" aria-label="Book information">
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
            History <small>{book.history.length}</small>
          </button>
        </div>

        {tab === 'details' ? (
          <div className="books-review-details" role="tabpanel">
            {hasOverview && (
              <DetailSection title="Overview">
                {book.description && <p className="books-review-description">{book.description}</p>}
                <dl>
                  {book.publicationLabel && (
                    <div>
                      <dt>Published</dt>
                      <dd>{book.publicationLabel}</dd>
                    </div>
                  )}
                  {book.pageCountLabel && (
                    <div>
                      <dt>Length</dt>
                      <dd>{book.pageCountLabel}</dd>
                    </div>
                  )}
                </dl>
              </DetailSection>
            )}

            {book.series?.length ? (
              <DetailSection title="Series">
                <p className="books-review-section-note">
                  Series position describes where this work sits in each named sequence. A work can
                  belong to more than one series.
                </p>
                <div className="books-review-series-list">
                  {book.series.map((series) => (
                    <SeriesPosition key={series.id} series={series} />
                  ))}
                </div>
              </DetailSection>
            ) : null}

            {hasContributors && (
              <DetailSection title="Contributors">
                <dl>
                  {book.contributors!.map((group) => (
                    <div key={group.role}>
                      <dt>{group.role}</dt>
                      <dd>{group.names.join(', ')}</dd>
                    </div>
                  ))}
                </dl>
              </DetailSection>
            )}

            {hasEdition && (
              <DetailSection title="Edition">
                <dl>
                  {Object.entries({
                    Format: book.selectedEdition?.format,
                    Edition: book.selectedEdition?.information,
                    Length: book.selectedEdition?.extent,
                    Publisher: book.selectedEdition?.publisher,
                    Released: book.selectedEdition?.releaseLabel,
                    Language: book.selectedEdition?.language,
                    Identifiers: book.selectedEdition?.identifiers?.join(' · '),
                  }).map(([label, value]) =>
                    value ? (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ) : null,
                  )}
                </dl>
              </DetailSection>
            )}

            {hasCommunity && (
              <DetailSection title="Hardcover community">
                <dl>
                  {book.community?.ratingLabel && (
                    <div>
                      <dt>Rating</dt>
                      <dd>{book.community.ratingLabel}</dd>
                    </div>
                  )}
                  {book.community?.genres?.length && (
                    <div>
                      <dt>Genres</dt>
                      <dd>{book.community.genres.join(', ')}</dd>
                    </div>
                  )}
                  {book.community?.moods?.length && (
                    <div>
                      <dt>Moods</dt>
                      <dd>{book.community.moods.join(', ')}</dd>
                    </div>
                  )}
                  {book.community?.pace && (
                    <div>
                      <dt>Pace</dt>
                      <dd>{book.community.pace}</dd>
                    </div>
                  )}
                </dl>
              </DetailSection>
            )}

            {book.source && (
              <details className="books-review-source">
                <summary>
                  Source <ChevronRight />
                </summary>
                <dl>
                  <div>
                    <dt>Provider</dt>
                    <dd>
                      {book.source.href ? (
                        <a href={book.source.href} target="_blank" rel="noreferrer">
                          {book.source.label}
                        </a>
                      ) : (
                        book.source.label
                      )}
                    </dd>
                  </div>
                  {book.source.refreshedLabel && (
                    <div>
                      <dt>Refreshed</dt>
                      <dd>{book.source.refreshedLabel}</dd>
                    </div>
                  )}
                  {book.source.coverageLabel && (
                    <div>
                      <dt>Coverage</dt>
                      <dd>{book.source.coverageLabel}</dd>
                    </div>
                  )}
                </dl>
              </details>
            )}
          </div>
        ) : (
          <div className="books-review-history" role="tabpanel">
            <p className="books-review-section-note">
              Personal activity stays here: reading progress, reads, ratings, reviews, and the
              source-added date.
            </p>
            {book.history.length ? (
              <ol>
                {book.history.map((entry) => (
                  <li key={entry.id}>
                    <i className={`is-${entry.kind}`} aria-hidden="true">
                      {entry.kind === 'read' ? <Check /> : <BookOpen />}
                    </i>
                    <div>
                      <strong>{entry.label}</strong>
                      {entry.dateLabel && <time>{entry.dateLabel}</time>}
                      {entry.detail && <p>{entry.detail}</p>}
                      {entry.matchesFilters && <span>Matches current filters</span>}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="books-review-empty-copy">No personal activity is available.</p>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}

export function BooksSurfaceReview({
  books,
  counts,
  initialView = 'archive',
  initialLayout = 'grid',
  initialSelectedId,
  filterSummary = [],
  className,
}: BooksSurfaceReviewProps) {
  const [view, setView] = useState<BooksCollectionView>(initialView)
  const [layout, setLayout] = useState<BooksCollectionLayout>(initialLayout)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | undefined>(initialSelectedId)

  const visibleBooks = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return books.filter((book) => {
      if (!book.memberships[view]) return false
      if (!normalizedQuery) return true
      const searchable = [
        book.title,
        book.subtitle,
        ...book.authors.map((author) => author.name),
        ...(book.series?.map((series) => series.name) ?? []),
        ...(book.selectedEdition?.identifiers ?? []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase()
      return searchable.includes(normalizedQuery)
    })
  }, [books, query, view])

  const selected = books.find((book) => book.id === selectedId)
  const resultLabel = `${visibleBooks.length} ${visibleBooks.length === 1 ? 'book' : 'books'}`
  const hasSeries = books.some((book) => book.series?.length)

  return (
    <section className={joinClassNames('books-review', !hasSeries && 'no-series', className)}>
      <div className="books-review-workspace">
        <header className="books-review-heading">
          <div>
            <p>Library / Books</p>
            <h1>Books</h1>
          </div>
          <span>Surface review</span>
        </header>

        <nav className="books-review-view-tabs" aria-label="Book collections">
          <button
            type="button"
            className={view === 'archive' ? 'is-active' : ''}
            onClick={() => setView('archive')}
          >
            Archive <small>{counts.archive}</small>
          </button>
          <button
            type="button"
            className={view === 'queue' ? 'is-active' : ''}
            onClick={() => setView('queue')}
          >
            Queue <small>{counts.queue}</small>
          </button>
        </nav>

        <div className="books-review-toolbar">
          <label className="books-review-search">
            <Search />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                hasSeries
                  ? 'Search title, author, series, or ISBN'
                  : 'Search title, author, or ISBN'
              }
              aria-label={
                hasSeries
                  ? 'Search books by title, author, series, or ISBN'
                  : 'Search books by title, author, or ISBN'
              }
            />
            {query && (
              <button type="button" aria-label="Clear search" onClick={() => setQuery('')}>
                <X />
              </button>
            )}
          </label>
          <button type="button" className="books-review-control">
            <SlidersHorizontal /> Filters
            {filterSummary.length > 0 && <small>{filterSummary.length}</small>}
          </button>
          <button type="button" className="books-review-control">
            <CalendarDays /> Published
          </button>
          <button type="button" className="books-review-control books-review-sort">
            <ArrowDownWideNarrow /> {view === 'archive' ? 'Recently read' : 'Recently added'}
          </button>
          <div className="books-review-layout-toggle" aria-label="Collection layout">
            <IconButton
              label="Grid view"
              pressed={layout === 'grid'}
              onClick={() => setLayout('grid')}
            >
              <Grid2X2 />
            </IconButton>
            <IconButton
              label="List view"
              pressed={layout === 'list'}
              onClick={() => setLayout('list')}
            >
              <List />
            </IconButton>
          </div>
        </div>

        <div className="books-review-result-meta">
          <div>
            <span>{resultLabel}</span>
            {view === 'archive' && counts.supportedReads !== undefined && (
              <span> · {counts.supportedReads} supported reads</span>
            )}
          </div>
          {filterSummary.length > 0 && (
            <div className="books-review-filter-summary">
              {filterSummary.map((filter) => (
                <span key={filter}>{filter}</span>
              ))}
            </div>
          )}
        </div>

        {view === 'archive' && filterSummary.length > 1 && (
          <p className="books-review-occurrence-note">
            The latest supported read drives collection dates and occurrence-based filters.
          </p>
        )}

        <div className="books-review-collection-scroll">
          {visibleBooks.length ? (
            layout === 'grid' ? (
              <div className="books-review-grid" aria-label={`${view} books in grid view`}>
                {visibleBooks.map((book) => (
                  <BookGridCard
                    key={book.id}
                    book={book}
                    selected={book.id === selectedId}
                    onSelect={() => setSelectedId(book.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="books-review-list" aria-label={`${view} books in list view`}>
                <div className="books-review-list-head" aria-hidden="true">
                  <span>Book / author</span>
                  {hasSeries && <span>Series</span>}
                  <span>Published</span>
                  <span>{view === 'archive' ? 'Latest read' : 'Queue'}</span>
                </div>
                {visibleBooks.map((book) => (
                  <BookListRow
                    key={book.id}
                    book={book}
                    view={view}
                    selected={book.id === selectedId}
                    onSelect={() => setSelectedId(book.id)}
                  />
                ))}
              </div>
            )
          ) : (
            <div className="books-review-empty">
              <BookOpen />
              <h2>No books match this view</h2>
              <p>Clear the search or collection filters.</p>
            </div>
          )}
        </div>
      </div>

      {selected && (
        <Inspector key={selected.id} book={selected} onClose={() => setSelectedId(undefined)} />
      )}
    </section>
  )
}
