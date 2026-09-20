import {
  ArrowUpDown,
  BookOpen,
  ChevronDown,
  Clock3,
  ExternalLink,
  FileText,
  History,
  Inbox,
  ListFilter,
  PanelRightClose,
  Rss,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import './articles-surface.css'

export type ArticleSection = 'archive' | 'queue' | 'feed'
export type ArticleSubtype = 'article' | 'pdf' | 'rss' | 'newsletter'
export type ArticleQueueState = 'inbox' | 'later' | 'shortlist'
export type ArticleDensity = 'restrained' | 'expanded'
export type ArticleInspectorTab = 'details' | 'history'

export type ArticleTemporalValue = {
  label: string
  iso?: string
  basis?: 'asserted' | 'inferred' | 'unknown'
  matchesCurrentFilter?: boolean
}

export type ArticleRowData = {
  id: string
  title: string | null
  subtype: ArticleSubtype
  imageUrl: string | null
  author: string | null
  publication: string | null
  publishedAt: ArticleTemporalValue | null
  readingTimeMinutes: number | null
  progress: number | null
  firstOpenedAt: string | null
  archive?: {
    date: ArticleTemporalValue | null
    occurrenceCount: number
  } | null
  queue?: {
    state: ArticleQueueState
    addedAt: ArticleTemporalValue | null
  } | null
  feed?: {
    arrivedAt: ArticleTemporalValue | null
  } | null
  archivedBefore?: boolean
  searchMatch?: {
    kind: 'summary' | 'note' | 'highlight' | 'text'
    excerpt: string
  } | null
}

export type ArticleHistoryEntry = {
  id: string
  kind: 'archive' | 'open' | 'note' | 'highlight' | 'reader-state'
  title: string
  date: ArticleTemporalValue | null
  body?: string | null
  sourceLabel?: string | null
  favorite?: boolean
}

export type ArticleInspectorData = {
  id: string
  title: string | null
  subtype: ArticleSubtype
  imageUrl: string | null
  author: string | null
  publication: string | null
  summary: string | null
  publishedAt: ArticleTemporalValue | null
  wordCount: number | null
  readingTimeLabel: string | null
  progressLabel: string
  firstOpenedLabel: string | null
  lastOpenedLabel: string | null
  currentRelationships: Array<'archived' | ArticleQueueState | 'feed'>
  originalUrl: string | null
  readerUrl: string | null
  sourceFacts: Array<{ label: string; value: string }>
  history: ArticleHistoryEntry[]
  provenanceSummary?: string | null
}

export type ArticlesSurfaceData = {
  rows: Record<ArticleSection, ArticleRowData[]>
  sectionCounts: Record<ArticleSection, number>
  inspectors: Record<string, ArticleInspectorData | undefined>
  coverageNote?: string | null
}

export type ArticlesSurfaceReviewProps = {
  data: ArticlesSurfaceData
  initialSection?: ArticleSection
  initialSelectedId?: string | null
  initialDensity?: ArticleDensity
  className?: string
  onOpenOriginal?: (item: ArticleInspectorData) => void
  onOpenReader?: (item: ArticleInspectorData) => void
}

type ReadingTimeFilter = 'any' | 'short' | 'medium' | 'long'
type ProgressFilter = 'any' | 'unopened' | 'started' | 'complete' | 'unknown'
type QueueFilter = 'any' | ArticleQueueState
type SortValue =
  | 'section-date-desc'
  | 'section-date-asc'
  | 'published-desc'
  | 'title-asc'
  | 'author-asc'
  | 'publication-asc'
  | 'reading-time-asc'
  | 'queue-state'
  | 'relevance'

const sectionLabels: Record<ArticleSection, string> = {
  archive: 'Archive',
  queue: 'Queue',
  feed: 'Feed',
}

const subtypeLabels: Record<ArticleSubtype, string> = {
  article: 'Web article',
  pdf: 'PDF',
  rss: 'RSS',
  newsletter: 'Newsletter',
}

const queueLabels: Record<ArticleQueueState, string> = {
  inbox: 'Inbox',
  later: 'Later',
  shortlist: 'Shortlist',
}

const relationshipLabels: Record<ArticleInspectorData['currentRelationships'][number], string> = {
  archived: 'Archived',
  inbox: 'Inbox',
  later: 'Later',
  shortlist: 'Shortlist',
  feed: 'Reader Feed',
}

function SubtypeGlyph({ subtype }: { subtype: ArticleSubtype }) {
  if (subtype === 'pdf') return <FileText />
  if (subtype === 'rss' || subtype === 'newsletter') return <Rss />
  return <BookOpen />
}

function titleOf(row: Pick<ArticleRowData, 'title'>) {
  return row.title?.trim() || 'Untitled article'
}

function byline(row: Pick<ArticleRowData, 'author' | 'publication'>) {
  return [row.author, row.publication].filter(Boolean).join(' · ')
}

function minutesLabel(minutes: number | null) {
  if (minutes == null) return null
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`
}

function progressLabel(row: ArticleRowData) {
  if (row.progress == null) return null
  if (row.progress === 0 && !row.firstOpenedAt) return 'Not opened'
  if (row.progress === 0) return 'Opened · 0%'
  return `${Math.round(row.progress * 100)}%`
}

function sectionFact(row: ArticleRowData, section: ArticleSection) {
  if (section === 'archive') {
    if (!row.archive?.date) return 'Archive date unknown'
    return `Archived ${row.archive.date.label}${row.archive.date.basis === 'inferred' ? ' · inferred' : ''}`
  }
  if (section === 'queue') return queueLabels[row.queue?.state ?? 'inbox']
  return row.feed?.arrivedAt ? `Arrived ${row.feed.arrivedAt.label}` : 'Reader Feed'
}

function dateValue(row: ArticleRowData, section: ArticleSection) {
  const value =
    section === 'archive'
      ? row.archive?.date?.iso
      : section === 'queue'
        ? row.queue?.addedAt?.iso
        : row.feed?.arrivedAt?.iso
  return value ? Date.parse(value) || 0 : -1
}

function ArticleThumbnail({ row, large = false }: { row: ArticleRowData; large?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false)
  return (
    <span className={`article-review-thumbnail${large ? ' is-large' : ''}`} aria-hidden="true">
      {row.imageUrl && !imageFailed ? (
        <img src={row.imageUrl} alt="" onError={() => setImageFailed(true)} />
      ) : (
        <SubtypeGlyph subtype={row.subtype} />
      )}
    </span>
  )
}

function InspectorThumbnail({ item }: { item: ArticleInspectorData }) {
  const [imageFailed, setImageFailed] = useState(false)
  return (
    <span className="article-review-inspector-thumbnail" aria-hidden="true">
      {item.imageUrl && !imageFailed ? (
        <img src={item.imageUrl} alt="" onError={() => setImageFailed(true)} />
      ) : (
        <SubtypeGlyph subtype={item.subtype} />
      )}
    </span>
  )
}

function sortOptions(section: ArticleSection, searching: boolean) {
  const common: Array<{ value: SortValue; label: string }> = [
    { value: 'published-desc', label: 'Published · newest' },
    { value: 'title-asc', label: 'Title · A–Z' },
    { value: 'author-asc', label: 'Author · A–Z' },
    { value: 'publication-asc', label: 'Publication · A–Z' },
    { value: 'reading-time-asc', label: 'Reading time · shortest' },
  ]
  const first =
    section === 'archive'
      ? { value: 'section-date-desc' as const, label: 'Archived · newest' }
      : section === 'queue'
        ? { value: 'section-date-desc' as const, label: 'Date added · newest' }
        : { value: 'section-date-desc' as const, label: 'Arrival · newest' }
  return [
    ...(searching ? [{ value: 'relevance' as const, label: 'Relevance' }] : []),
    first,
    { value: 'section-date-asc' as const, label: first.label.replace('newest', 'oldest') },
    ...(section === 'queue'
      ? [{ value: 'queue-state' as const, label: 'Queue state · Shortlist first' }]
      : []),
    ...common,
  ]
}

export function ArticlesSurfaceReview({
  data,
  initialSection = 'archive',
  initialSelectedId = null,
  initialDensity = 'restrained',
  className,
  onOpenOriginal,
  onOpenReader,
}: ArticlesSurfaceReviewProps) {
  const [section, setSection] = useState<ArticleSection>(initialSection)
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId)
  const [inspectorTab, setInspectorTab] = useState<ArticleInspectorTab>('details')
  const [density, setDensity] = useState<ArticleDensity>(initialDensity)
  const [query, setQuery] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [subtype, setSubtype] = useState<'any' | ArticleSubtype>('any')
  const [readingTime, setReadingTime] = useState<ReadingTimeFilter>('any')
  const [progress, setProgress] = useState<ProgressFilter>('any')
  const [queueState, setQueueState] = useState<QueueFilter>('any')
  const [sort, setSort] = useState<SortValue>('section-date-desc')

  const activeFilterCount =
    Number(subtype !== 'any') +
    Number(readingTime !== 'any') +
    Number(progress !== 'any') +
    Number(section === 'queue' && queueState !== 'any')

  const visibleRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    const rows = data.rows[section].filter((row) => {
      const text =
        `${titleOf(row)} ${row.author ?? ''} ${row.publication ?? ''}`.toLocaleLowerCase()
      if (normalizedQuery && !text.includes(normalizedQuery) && !row.searchMatch) return false
      if (subtype !== 'any' && row.subtype !== subtype) return false
      if (readingTime !== 'any') {
        const minutes = row.readingTimeMinutes
        if (minutes == null) return false
        if (readingTime === 'short' && minutes >= 15) return false
        if (readingTime === 'medium' && (minutes < 15 || minutes > 30)) return false
        if (readingTime === 'long' && minutes <= 30) return false
      }
      if (progress !== 'any') {
        if (progress === 'unknown' && row.progress != null) return false
        if (progress === 'unopened' && !(row.progress === 0 && !row.firstOpenedAt)) return false
        if (
          progress === 'started' &&
          !(row.progress != null && row.progress > 0 && row.progress < 1)
        )
          return false
        if (progress === 'complete' && row.progress !== 1) return false
      }
      if (section === 'queue' && queueState !== 'any' && row.queue?.state !== queueState)
        return false
      return true
    })

    const collator = new Intl.Collator(undefined, { sensitivity: 'base' })
    return rows.toSorted((a, b) => {
      // The API owns relevance ranking; preserve its result order in this review component.
      if (sort === 'relevance') return 0
      if (sort === 'title-asc') return collator.compare(titleOf(a), titleOf(b))
      if (sort === 'author-asc') return collator.compare(a.author ?? '\uffff', b.author ?? '\uffff')
      if (sort === 'publication-asc')
        return collator.compare(a.publication ?? '\uffff', b.publication ?? '\uffff')
      if (sort === 'published-desc')
        return (
          (Date.parse(b.publishedAt?.iso ?? '') || -1) -
          (Date.parse(a.publishedAt?.iso ?? '') || -1)
        )
      if (sort === 'reading-time-asc')
        return (
          (a.readingTimeMinutes ?? Number.MAX_SAFE_INTEGER) -
          (b.readingTimeMinutes ?? Number.MAX_SAFE_INTEGER)
        )
      if (sort === 'queue-state') {
        const order: Record<ArticleQueueState, number> = { shortlist: 0, later: 1, inbox: 2 }
        return order[a.queue?.state ?? 'inbox'] - order[b.queue?.state ?? 'inbox']
      }
      const direction = sort === 'section-date-asc' ? 1 : -1
      return (dateValue(a, section) - dateValue(b, section)) * direction
    })
  }, [data.rows, progress, query, queueState, readingTime, section, sort, subtype])

  const selected = selectedId ? data.inspectors[selectedId] : undefined

  function changeSection(next: ArticleSection) {
    setSection(next)
    setSelectedId(null)
    setFiltersOpen(false)
    setQueueState('any')
    setSort(query.trim() ? 'relevance' : 'section-date-desc')
  }

  function clearFilters() {
    setSubtype('any')
    setReadingTime('any')
    setProgress('any')
    setQueueState('any')
  }

  return (
    <section className={['article-review', className].filter(Boolean).join(' ')}>
      <header className="article-review-header">
        <div>
          <p>Library</p>
          <h1>Articles</h1>
        </div>
        {data.coverageNote && <span className="article-review-coverage">{data.coverageNote}</span>}
      </header>

      <div className="article-review-section-tabs" role="tablist" aria-label="Article sections">
        {(Object.keys(sectionLabels) as ArticleSection[]).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={section === value}
            className={section === value ? 'is-active' : ''}
            onClick={() => changeSection(value)}
          >
            {sectionLabels[value]}
            <span>{data.sectionCounts[value].toLocaleString()}</span>
          </button>
        ))}
      </div>

      <div className="article-review-body">
        <div className="article-review-collection">
          <div className="article-review-toolbar">
            <label className="article-review-search">
              <Search aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => {
                  const value = event.target.value
                  setQuery(value)
                  if (value.trim() && sort === 'section-date-desc') setSort('relevance')
                  if (!value.trim() && sort === 'relevance') setSort('section-date-desc')
                }}
                placeholder="Search articles"
                aria-label={`Search ${sectionLabels[section].toLocaleLowerCase()} articles`}
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setQuery('')
                    if (sort === 'relevance') setSort('section-date-desc')
                  }}
                >
                  <X />
                </button>
              )}
            </label>

            <button
              type="button"
              className={`article-review-control${filtersOpen ? ' is-active' : ''}`}
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <ListFilter />
              Filter
              {activeFilterCount > 0 && <span>{activeFilterCount}</span>}
            </button>

            <label className="article-review-select-control">
              <ArrowUpDown aria-hidden="true" />
              <span className="sr-only">Sort articles</span>
              <select value={sort} onChange={(event) => setSort(event.target.value as SortValue)}>
                {sortOptions(section, Boolean(query.trim())).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown aria-hidden="true" />
            </label>

            <div className="article-review-density" aria-label="Article row density">
              <button
                type="button"
                className={density === 'restrained' ? 'is-active' : ''}
                aria-pressed={density === 'restrained'}
                onClick={() => setDensity('restrained')}
              >
                Restrained
              </button>
              <button
                type="button"
                className={density === 'expanded' ? 'is-active' : ''}
                aria-pressed={density === 'expanded'}
                onClick={() => setDensity('expanded')}
              >
                Expanded
              </button>
            </div>
          </div>

          {filtersOpen && (
            <div className="article-review-filters" aria-label="Article filters">
              <label>
                <span>Type</span>
                <select
                  value={subtype}
                  onChange={(event) => setSubtype(event.target.value as typeof subtype)}
                >
                  <option value="any">All types</option>
                  <option value="article">Web article</option>
                  <option value="pdf">PDF</option>
                  <option value="rss">RSS</option>
                  <option value="newsletter">Newsletter</option>
                </select>
              </label>
              <label>
                <span>Reading time</span>
                <select
                  value={readingTime}
                  onChange={(event) => setReadingTime(event.target.value as ReadingTimeFilter)}
                >
                  <option value="any">Any length</option>
                  <option value="short">Under 15 min</option>
                  <option value="medium">15–30 min</option>
                  <option value="long">Over 30 min</option>
                </select>
              </label>
              <label>
                <span>Progress</span>
                <select
                  value={progress}
                  onChange={(event) => setProgress(event.target.value as ProgressFilter)}
                >
                  <option value="any">Any progress</option>
                  <option value="unopened">Not opened</option>
                  <option value="started">In progress</option>
                  <option value="complete">100%</option>
                  <option value="unknown">Unknown</option>
                </select>
              </label>
              {section === 'queue' && (
                <label>
                  <span>Queue state</span>
                  <select
                    value={queueState}
                    onChange={(event) => setQueueState(event.target.value as QueueFilter)}
                  >
                    <option value="any">Inbox, Later & Shortlist</option>
                    <option value="inbox">Inbox</option>
                    <option value="later">Later</option>
                    <option value="shortlist">Shortlist</option>
                  </select>
                </label>
              )}
              <button type="button" onClick={clearFilters} disabled={!activeFilterCount}>
                Clear filters
              </button>
            </div>
          )}

          <div className="article-review-results-meta">
            <span>
              {visibleRows.length === data.sectionCounts[section]
                ? `${visibleRows.length.toLocaleString()} articles`
                : `${visibleRows.length.toLocaleString()} of ${data.sectionCounts[section].toLocaleString()} articles`}
            </span>
            <span>{density === 'restrained' ? 'Reading list' : 'Metadata comparison'}</span>
          </div>

          <div className={`article-review-list is-${density}`} role="list">
            {visibleRows.map((row) => {
              const time = minutesLabel(row.readingTimeMinutes)
              const progressText = progressLabel(row)
              return (
                <button
                  key={row.id}
                  type="button"
                  role="listitem"
                  className={`article-review-row${selectedId === row.id ? ' is-selected' : ''}`}
                  aria-pressed={selectedId === row.id}
                  onClick={() => {
                    setSelectedId(row.id)
                    setInspectorTab('details')
                  }}
                >
                  <ArticleThumbnail row={row} />
                  <span className="article-review-row-copy">
                    <strong>{titleOf(row)}</strong>
                    <span>{byline(row) || subtypeLabels[row.subtype]}</span>
                    {density === 'expanded' && (
                      <small>
                        {subtypeLabels[row.subtype]}
                        {time ? ` · ${time}` : ''}
                        {progressText ? ` · ${progressText}` : ''}
                        {row.archivedBefore && section !== 'archive' ? ' · Archived before' : ''}
                      </small>
                    )}
                    {row.searchMatch && query.trim() && (
                      <small className="article-review-search-match">
                        {row.searchMatch.kind}: {row.searchMatch.excerpt}
                      </small>
                    )}
                  </span>
                  <span className="article-review-row-fact">
                    <strong>{sectionFact(row, section)}</strong>
                    {density === 'expanded' && row.publishedAt && (
                      <small>Published {row.publishedAt.label}</small>
                    )}
                  </span>
                </button>
              )
            })}

            {!visibleRows.length && (
              <div className="article-review-empty">
                <Search />
                <h2>No articles match these filters.</h2>
                <p>Clear the current filters to return to {sectionLabels[section]}.</p>
                <button type="button" onClick={clearFilters}>
                  Clear filters
                </button>
              </div>
            )}
          </div>
        </div>

        {selectedId && (
          <aside className="article-review-inspector" aria-label="Article inspector">
            <div className="article-review-inspector-bar">
              <span>Article</span>
              <button
                type="button"
                aria-label="Close inspector"
                onClick={() => setSelectedId(null)}
              >
                <PanelRightClose />
              </button>
            </div>

            {!selected ? (
              <div className="article-review-inspector-state">
                <FileText />
                <h2>Details unavailable</h2>
                <p>This article could not be loaded. The collection remains available.</p>
              </div>
            ) : (
              <>
                <div className="article-review-inspector-heading">
                  <InspectorThumbnail item={selected} />
                  <div>
                    <span>{subtypeLabels[selected.subtype]}</span>
                    <h2>{selected.title?.trim() || 'Untitled article'}</h2>
                    {byline(selected) && <p>{byline(selected)}</p>}
                  </div>
                  <div className="article-review-relationships">
                    {selected.currentRelationships.map((relationship) => (
                      <span key={relationship}>{relationshipLabels[relationship]}</span>
                    ))}
                  </div>
                  {(selected.originalUrl || selected.readerUrl) && (
                    <div className="article-review-actions">
                      {selected.originalUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenOriginal
                              ? onOpenOriginal(selected)
                              : window.open(selected.originalUrl!, '_blank', 'noopener,noreferrer')
                          }
                        >
                          Open original <ExternalLink />
                        </button>
                      )}
                      {selected.readerUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenReader
                              ? onOpenReader(selected)
                              : window.open(selected.readerUrl!, '_blank', 'noopener,noreferrer')
                          }
                        >
                          Open in Reader <ExternalLink />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="article-review-inspector-tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={inspectorTab === 'details'}
                    className={inspectorTab === 'details' ? 'is-active' : ''}
                    onClick={() => setInspectorTab('details')}
                  >
                    Details
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={inspectorTab === 'history'}
                    className={inspectorTab === 'history' ? 'is-active' : ''}
                    onClick={() => setInspectorTab('history')}
                  >
                    History <span>{selected.history.length}</span>
                  </button>
                </div>

                <div className="article-review-inspector-content">
                  {inspectorTab === 'details' ? (
                    <>
                      {selected.summary && (
                        <section>
                          <h3>Summary</h3>
                          <p className="article-review-summary">{selected.summary}</p>
                        </section>
                      )}
                      <section>
                        <h3>Article</h3>
                        <dl>
                          {selected.author && <Fact label="Author" value={selected.author} />}
                          {selected.publication && (
                            <Fact label="Publication" value={selected.publication} />
                          )}
                          {selected.publishedAt && (
                            <Fact label="Published" value={selected.publishedAt.label} />
                          )}
                          <Fact label="Type" value={subtypeLabels[selected.subtype]} />
                          {selected.wordCount != null && (
                            <Fact label="Word count" value={selected.wordCount.toLocaleString()} />
                          )}
                          {selected.readingTimeLabel && (
                            <Fact label="Reading time" value={selected.readingTimeLabel} />
                          )}
                          <Fact label="Progress" value={selected.progressLabel} />
                        </dl>
                      </section>
                      {selected.sourceFacts.length > 0 && (
                        <section>
                          <h3>Source</h3>
                          <dl>
                            {selected.sourceFacts.map((fact) => (
                              <Fact key={fact.label} label={fact.label} value={fact.value} />
                            ))}
                          </dl>
                        </section>
                      )}
                    </>
                  ) : (
                    <>
                      <section>
                        <h3>Activity</h3>
                        {selected.history.length ? (
                          <div className="article-review-timeline">
                            {selected.history.map((event) => (
                              <article key={event.id} className={`is-${event.kind}`}>
                                <span className="article-review-timeline-icon">
                                  {event.kind === 'highlight' ? (
                                    <Sparkles />
                                  ) : event.kind === 'note' ? (
                                    <FileText />
                                  ) : event.kind === 'reader-state' ? (
                                    <Inbox />
                                  ) : event.kind === 'open' ? (
                                    <Clock3 />
                                  ) : (
                                    <History />
                                  )}
                                </span>
                                <div>
                                  <header>
                                    <strong>{event.title}</strong>
                                    {event.favorite && <span>Favorite</span>}
                                  </header>
                                  {event.date && (
                                    <small>
                                      {event.date.label}
                                      {event.date.basis === 'inferred' ? ' · inferred' : ''}
                                      {event.date.matchesCurrentFilter ? ' · Matches filter' : ''}
                                    </small>
                                  )}
                                  {event.body && <p>{event.body}</p>}
                                  {event.sourceLabel && <small>{event.sourceLabel}</small>}
                                </div>
                              </article>
                            ))}
                          </div>
                        ) : (
                          <p className="article-review-muted">No retained activity.</p>
                        )}
                      </section>
                      {(selected.firstOpenedLabel || selected.lastOpenedLabel) && (
                        <section>
                          <h3>Reader snapshot</h3>
                          <dl>
                            {selected.firstOpenedLabel && (
                              <Fact label="First opened" value={selected.firstOpenedLabel} />
                            )}
                            {selected.lastOpenedLabel && (
                              <Fact label="Last opened" value={selected.lastOpenedLabel} />
                            )}
                            <Fact label="Current progress" value={selected.progressLabel} />
                          </dl>
                        </section>
                      )}
                      {selected.provenanceSummary && (
                        <details className="article-review-provenance">
                          <summary>Provenance</summary>
                          <p>{selected.provenanceSummary}</p>
                        </details>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </aside>
        )}
      </div>
    </section>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
