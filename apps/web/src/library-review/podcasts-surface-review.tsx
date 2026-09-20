import {
  ArrowUpDown,
  CircleAlert,
  ExternalLink,
  Headphones,
  Library,
  ListFilter,
  Search,
  X,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'

import './podcasts-surface-review.css'

export type PodcastReviewMode = 'archive' | 'queue' | 'following'
export type PodcastInspectorTab = 'details' | 'history'
export type PodcastAvailability = 'available' | 'restricted' | 'unavailable' | 'unknown'

export type PodcastReviewArtwork = {
  src: string
  alt: string
  /** Visible provider credit for governed artwork, for example “Spotify”. */
  attributionLabel?: string
  href?: string
}

export type PodcastReviewTemporal = {
  label: string
  iso?: string
  precision?: 'instant' | 'day' | 'month' | 'year' | 'unknown'
  basis?: 'asserted' | 'inferred' | 'unknown'
}

export type PodcastReviewLink = {
  label: string
  href: string
  source: 'spotify' | 'reader'
}

export type PodcastReviewFact = {
  label: string
  value: string
  tone?: 'default' | 'muted' | 'warning'
}

export type PodcastReviewHistoryEntry = {
  id: string
  kind: 'spotify_playback' | 'reader_archive' | 'spotify_state' | 'following' | 'provenance'
  title: string
  dateLabel?: string
  detail?: string
  matchesCurrentFilters?: boolean
}

export type PodcastEpisodeRow = {
  kind: 'episode'
  id: string
  title: string | null
  artwork: PodcastReviewArtwork | null
  show: {
    id?: string
    name: string | null
    followed?: boolean | null
  } | null
  memberships: {
    archive: boolean
    queue: boolean
    savedEpisode: boolean
  }
  /** Already selected against the current activity filters by the data layer. */
  displayActivity: {
    kind: 'spotify_export' | 'spotify_undated' | 'readwise'
    label: string
    temporal?: PodcastReviewTemporal | null
  } | null
  observedTimeLabel?: string | null
  durationLabel?: string | null
  publishedLabel?: string | null
  queue?: {
    savedLabel: string
    zeroObservedLabel?: string
  } | null
  availability: PodcastAvailability
}

export type PodcastShowRow = {
  kind: 'show'
  id: string
  name: string | null
  artwork: PodcastReviewArtwork | null
  publisher: string | null
  savedLabel: string
  totalEpisodesLabel?: string | null
  availability: Exclude<PodcastAvailability, 'restricted'>
  libraryCounts?: {
    archiveEpisodes: number
    queueEpisodes: number
  }
}

export type PodcastEpisodeInspector = {
  kind: 'episode'
  id: string
  title: string | null
  showName: string | null
  artwork: PodcastReviewArtwork | null
  memberships: PodcastEpisodeRow['memberships'] & {
    followedShow?: boolean | null
  }
  links?: PodcastReviewLink[]
  listening?: {
    archiveSources?: string[]
    observedTimeLabel?: string
    playbackObservationCount?: number
    firstObservedLabel?: string
    latestObservedLabel?: string
    currentSpotifyState?: {
      label: string
      observedLabel?: string
    }
    savedEpisodeLabel?: string
    coverageNote?: string
  }
  episodeFacts?: PodcastReviewFact[]
  showFacts?: PodcastReviewFact[]
  readerFacts?: PodcastReviewFact[]
  sourceFacts?: PodcastReviewFact[]
  historySummary?: {
    observedTimeLabel?: string
    playbackObservationCount?: number
    firstObservedLabel?: string
    latestObservedLabel?: string
    undatedDetectionLabel?: string
  }
  history: PodcastReviewHistoryEntry[]
}

export type PodcastShowInspector = {
  kind: 'show'
  id: string
  name: string | null
  publisher: string | null
  artwork: PodcastReviewArtwork | null
  following: boolean
  links?: PodcastReviewLink[]
  followingFacts?: PodcastReviewFact[]
  aboutFacts?: PodcastReviewFact[]
  libraryFacts?: PodcastReviewFact[]
  availabilityFacts?: PodcastReviewFact[]
  sourceFacts?: PodcastReviewFact[]
  history: PodcastReviewHistoryEntry[]
}

export type PodcastInspector = PodcastEpisodeInspector | PodcastShowInspector

export type PodcastsSurfaceReviewProps = {
  archiveEpisodes: PodcastEpisodeRow[]
  queueEpisodes: PodcastEpisodeRow[]
  followedShows: PodcastShowRow[]
  counts: {
    archiveEpisodes: number
    queueEpisodes: number
    followedShows: number
  }
  inspectors?: Record<string, PodcastInspector | undefined>
  archiveObservedTimeLabel?: string
  coverageNote?: string
  unresolvedSavedEpisodeCount?: number
  filterSummary?: string[]
  initialMode?: PodcastReviewMode
  initialSelectedId?: string | null
  initialInspectorTab?: PodcastInspectorTab
  className?: string
  onOpenSpotify?: (item: PodcastInspector, link: PodcastReviewLink) => void
  onOpenReader?: (item: PodcastEpisodeInspector, link: PodcastReviewLink) => void
}

type SortValue =
  | 'activity-desc'
  | 'saved-desc'
  | 'published-desc'
  | 'observed-desc'
  | 'title-asc'
  | 'show-asc'
  | 'publisher-asc'
  | 'episodes-desc'

const modeLabels: Record<PodcastReviewMode, string> = {
  archive: 'Archive',
  queue: 'Queue',
  following: 'Following',
}

const filterLabels: Record<PodcastReviewMode, string[]> = {
  archive: ['Activity date', 'Show', 'Following', 'Published', 'Duration'],
  queue: ['Saved date', 'Show', 'Following', 'Published', 'Duration'],
  following: ['Saved date', 'Publisher', 'Language', 'Library activity'],
}

const availabilityLabels: Record<PodcastAvailability, string> = {
  available: 'Available',
  restricted: 'Restricted',
  unavailable: 'Unavailable',
  unknown: 'Availability unknown',
}

function joinClassNames(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(' ')
}

function episodeTitle(item: Pick<PodcastEpisodeRow | PodcastEpisodeInspector, 'title'>) {
  return item.title?.trim() || 'Untitled episode'
}

function showTitle(item: Pick<PodcastShowRow, 'name'>) {
  return item.name?.trim() || 'Show unavailable'
}

function Artwork({
  artwork,
  size,
  label,
  linked = false,
}: {
  artwork: PodcastReviewArtwork | null
  size: 'row' | 'card' | 'inspector'
  label: string
  linked?: boolean
}) {
  const [imageFailed, setImageFailed] = useState(false)
  const content =
    artwork && !imageFailed ? (
      <img src={artwork.src} alt={artwork.alt} onError={() => setImageFailed(true)} />
    ) : (
      <span
        className="podcast-review-artwork-fallback"
        role="img"
        aria-label={`No artwork for ${label}`}
      >
        <Headphones aria-hidden="true" />
      </span>
    )

  return (
    <span className={`podcast-review-artwork podcast-review-artwork--${size}`}>
      {linked && artwork?.href ? (
        <a
          href={artwork.href}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${label} artwork source`}
        >
          {content}
        </a>
      ) : (
        content
      )}
      {artwork?.attributionLabel && (
        <small className="podcast-review-artwork-credit">{artwork.attributionLabel}</small>
      )}
    </span>
  )
}

function AvailabilityBadge({ value }: { value: PodcastAvailability }) {
  if (value === 'available') return null
  return (
    <span className={`podcast-review-availability is-${value}`}>
      {value === 'restricted' || value === 'unavailable' ? (
        <CircleAlert aria-hidden="true" />
      ) : null}
      {availabilityLabels[value]}
    </span>
  )
}

function InspectorSection({
  title,
  children,
  className,
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={joinClassNames('podcast-review-inspector-section', className)}>
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function Facts({ facts }: { facts?: PodcastReviewFact[] }) {
  if (!facts?.length) return null
  return (
    <dl className="podcast-review-facts">
      {facts.map((fact, index) => (
        <div key={`${fact.label}-${index}`} className={fact.tone ? `is-${fact.tone}` : undefined}>
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function EpisodeRow({
  episode,
  mode,
  selected,
  onSelect,
}: {
  episode: PodcastEpisodeRow
  mode: Exclude<PodcastReviewMode, 'following'>
  selected: boolean
  onSelect: () => void
}) {
  const primaryDate =
    mode === 'archive' ? episode.displayActivity?.label : episode.queue?.savedLabel
  const summary = mode === 'archive' ? episode.observedTimeLabel : episode.publishedLabel

  return (
    <button
      type="button"
      className={joinClassNames('podcast-review-episode-row', selected && 'is-selected')}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <Artwork artwork={episode.artwork} size="row" label={episodeTitle(episode)} />
      <span className="podcast-review-row-identity">
        <strong>{episodeTitle(episode)}</strong>
        {episode.show?.name ? <span>{episode.show.name}</span> : <span>Show unavailable</span>}
        <small>
          {primaryDate ??
            (mode === 'archive'
              ? 'Playback detected · date unavailable'
              : 'Saved date unavailable')}
        </small>
      </span>
      <span className="podcast-review-row-summary">
        {summary && <strong>{summary}</strong>}
        {episode.durationLabel && <small>{episode.durationLabel}</small>}
      </span>
      <span className="podcast-review-row-status">
        <AvailabilityBadge value={episode.availability} />
      </span>
    </button>
  )
}

function ShowCard({
  show,
  selected,
  onSelect,
}: {
  show: PodcastShowRow
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={joinClassNames('podcast-review-show-card', selected && 'is-selected')}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <Artwork artwork={show.artwork} size="card" label={showTitle(show)} />
      <strong>{showTitle(show)}</strong>
      <span>{show.publisher || 'Publisher unavailable'}</span>
      <div>
        <small>{show.savedLabel}</small>
        {show.totalEpisodesLabel && <small>{show.totalEpisodesLabel}</small>}
      </div>
      <AvailabilityBadge value={show.availability} />
    </button>
  )
}

function MembershipChips({ item }: { item: PodcastEpisodeInspector | PodcastShowInspector }) {
  if (item.kind === 'show') {
    return item.following ? <span className="podcast-review-chip">Following</span> : null
  }
  return (
    <>
      {item.memberships.archive && <span className="podcast-review-chip">Archive</span>}
      {item.memberships.queue && <span className="podcast-review-chip">Queue</span>}
      {item.memberships.savedEpisode && <span className="podcast-review-chip">Saved episode</span>}
      {item.memberships.followedShow && <span className="podcast-review-chip">Followed show</span>}
    </>
  )
}

function LinkButton({
  item,
  link,
  onOpenSpotify,
  onOpenReader,
}: {
  item: PodcastInspector
  link: PodcastReviewLink
  onOpenSpotify?: PodcastsSurfaceReviewProps['onOpenSpotify']
  onOpenReader?: PodcastsSurfaceReviewProps['onOpenReader']
}) {
  const handleClick = () => {
    if (link.source === 'spotify') onOpenSpotify?.(item, link)
    if (link.source === 'reader' && item.kind === 'episode') onOpenReader?.(item, link)
  }
  return (
    <a href={link.href} target="_blank" rel="noreferrer" onClick={handleClick}>
      {link.label}
      <ExternalLink aria-hidden="true" />
    </a>
  )
}

function ListeningDetails({ item }: { item: PodcastEpisodeInspector }) {
  const listening = item.listening
  if (!listening) return null
  const hasSummary =
    listening.observedTimeLabel ||
    listening.playbackObservationCount !== undefined ||
    listening.firstObservedLabel ||
    listening.latestObservedLabel
  return (
    <InspectorSection title="Listening">
      {hasSummary && (
        <div className="podcast-review-listening-summary">
          {listening.observedTimeLabel && <strong>{listening.observedTimeLabel}</strong>}
          {listening.playbackObservationCount !== undefined && (
            <span>{listening.playbackObservationCount.toLocaleString()} playback observations</span>
          )}
          {(listening.firstObservedLabel || listening.latestObservedLabel) && (
            <small>
              {[listening.firstObservedLabel, listening.latestObservedLabel]
                .filter(Boolean)
                .join(' · ')}
            </small>
          )}
        </div>
      )}
      {listening.archiveSources?.length ? (
        <div className="podcast-review-inline-fact">
          <span>Archive source</span>
          <strong>{listening.archiveSources.join(' · ')}</strong>
        </div>
      ) : null}
      {listening.currentSpotifyState && (
        <div className="podcast-review-current-state">
          <span>Current Spotify state</span>
          <strong>{listening.currentSpotifyState.label}</strong>
          {listening.currentSpotifyState.observedLabel && (
            <small>{listening.currentSpotifyState.observedLabel}</small>
          )}
        </div>
      )}
      {listening.savedEpisodeLabel && (
        <div className="podcast-review-inline-fact">
          <span>Saved episode</span>
          <strong>{listening.savedEpisodeLabel}</strong>
        </div>
      )}
      {listening.coverageNote && <p className="podcast-review-note">{listening.coverageNote}</p>}
    </InspectorSection>
  )
}

function HistoryView({ item }: { item: PodcastInspector }) {
  const summary = item.kind === 'episode' ? item.historySummary : undefined
  return (
    <div className="podcast-review-history-view">
      {summary && (
        <div className="podcast-review-history-summary">
          {summary.observedTimeLabel && <strong>{summary.observedTimeLabel}</strong>}
          {summary.playbackObservationCount !== undefined && (
            <span>{summary.playbackObservationCount.toLocaleString()} playback observations</span>
          )}
          {(summary.firstObservedLabel || summary.latestObservedLabel) && (
            <small>
              {[summary.firstObservedLabel, summary.latestObservedLabel]
                .filter(Boolean)
                .join(' · ')}
            </small>
          )}
          {summary.undatedDetectionLabel && <small>{summary.undatedDetectionLabel}</small>}
        </div>
      )}
      {item.history.length ? (
        <ol className="podcast-review-history-list">
          {item.history.map((entry) => (
            <li key={entry.id}>
              <span className="podcast-review-history-mark" aria-hidden="true" />
              <div>
                <strong>{entry.title}</strong>
                {entry.dateLabel && <time>{entry.dateLabel}</time>}
                {entry.detail && <p>{entry.detail}</p>}
                {entry.matchesCurrentFilters && <small>Matches current filters</small>}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="podcast-review-inspector-empty">No supported history available.</div>
      )}
    </div>
  )
}

function EpisodeDetails({ item }: { item: PodcastEpisodeInspector }) {
  return (
    <>
      <ListeningDetails item={item} />
      {item.episodeFacts?.length ? (
        <InspectorSection title="Episode">
          <Facts facts={item.episodeFacts} />
        </InspectorSection>
      ) : null}
      {item.showFacts?.length ? (
        <InspectorSection title="Show">
          <Facts facts={item.showFacts} />
        </InspectorSection>
      ) : null}
      {item.readerFacts?.length ? (
        <InspectorSection title="Reader">
          <Facts facts={item.readerFacts} />
        </InspectorSection>
      ) : null}
      {item.sourceFacts?.length ? (
        <details className="podcast-review-source">
          <summary>Source</summary>
          <Facts facts={item.sourceFacts} />
        </details>
      ) : null}
    </>
  )
}

function ShowDetails({ item }: { item: PodcastShowInspector }) {
  return (
    <>
      {item.followingFacts?.length ? (
        <InspectorSection title="Following">
          <Facts facts={item.followingFacts} />
        </InspectorSection>
      ) : null}
      {item.aboutFacts?.length ? (
        <InspectorSection title="About">
          <Facts facts={item.aboutFacts} />
        </InspectorSection>
      ) : null}
      {item.libraryFacts?.length ? (
        <InspectorSection title="In your Library">
          <Facts facts={item.libraryFacts} />
        </InspectorSection>
      ) : null}
      {item.availabilityFacts?.length ? (
        <InspectorSection title="Availability">
          <Facts facts={item.availabilityFacts} />
        </InspectorSection>
      ) : null}
      {item.sourceFacts?.length ? (
        <details className="podcast-review-source">
          <summary>Source</summary>
          <Facts facts={item.sourceFacts} />
        </details>
      ) : null}
    </>
  )
}

function Inspector({
  item,
  tab,
  onTabChange,
  onClose,
  onOpenSpotify,
  onOpenReader,
}: {
  item: PodcastInspector | undefined
  tab: PodcastInspectorTab
  onTabChange: (tab: PodcastInspectorTab) => void
  onClose: () => void
  onOpenSpotify?: PodcastsSurfaceReviewProps['onOpenSpotify']
  onOpenReader?: PodcastsSurfaceReviewProps['onOpenReader']
}) {
  if (!item) {
    return (
      <aside className="podcast-review-inspector" aria-label="Podcast inspector">
        <div className="podcast-review-inspector-toolbar">
          <span>Details</span>
          <button type="button" aria-label="Close inspector" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="podcast-review-inspector-empty">Podcast details could not be loaded.</div>
      </aside>
    )
  }

  const title =
    item.kind === 'episode' ? episodeTitle(item) : item.name?.trim() || 'Show unavailable'
  const subtitle = item.kind === 'episode' ? item.showName : item.publisher

  return (
    <aside className="podcast-review-inspector" aria-label={`${title} details`}>
      <div className="podcast-review-inspector-toolbar">
        <span>{item.kind === 'episode' ? 'Episode' : 'Show'}</span>
        <button type="button" aria-label="Close inspector" onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      </div>
      <div className="podcast-review-inspector-header">
        <Artwork artwork={item.artwork} size="inspector" label={title} linked />
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
          <div className="podcast-review-memberships">
            <MembershipChips item={item} />
          </div>
        </div>
      </div>
      {item.links?.length ? (
        <div className="podcast-review-source-links">
          {item.links.map((link) => (
            <LinkButton
              key={`${link.source}-${link.href}`}
              item={item}
              link={link}
              onOpenSpotify={onOpenSpotify}
              onOpenReader={onOpenReader}
            />
          ))}
        </div>
      ) : null}
      <div className="podcast-review-inspector-tabs" role="tablist" aria-label="Inspector sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'details'}
          className={tab === 'details' ? 'is-active' : undefined}
          onClick={() => onTabChange('details')}
        >
          Details
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'history'}
          className={tab === 'history' ? 'is-active' : undefined}
          onClick={() => onTabChange('history')}
        >
          History
        </button>
      </div>
      <div className="podcast-review-inspector-scroll">
        {tab === 'history' ? (
          <HistoryView item={item} />
        ) : item.kind === 'episode' ? (
          <EpisodeDetails item={item} />
        ) : (
          <ShowDetails item={item} />
        )}
      </div>
    </aside>
  )
}

function sortOptions(mode: PodcastReviewMode): Array<{ value: SortValue; label: string }> {
  if (mode === 'archive') {
    return [
      { value: 'activity-desc', label: 'Activity · newest' },
      { value: 'observed-desc', label: 'Observed time · most' },
      { value: 'published-desc', label: 'Published · newest' },
      { value: 'title-asc', label: 'Title · A–Z' },
      { value: 'show-asc', label: 'Show · A–Z' },
    ]
  }
  if (mode === 'queue') {
    return [
      { value: 'saved-desc', label: 'Saved · newest' },
      { value: 'published-desc', label: 'Published · newest' },
      { value: 'title-asc', label: 'Title · A–Z' },
      { value: 'show-asc', label: 'Show · A–Z' },
    ]
  }
  return [
    { value: 'saved-desc', label: 'Saved · newest' },
    { value: 'title-asc', label: 'Show · A–Z' },
    { value: 'publisher-asc', label: 'Publisher · A–Z' },
    { value: 'episodes-desc', label: 'Episode count · most' },
  ]
}

function defaultSort(mode: PodcastReviewMode): SortValue {
  return mode === 'archive' ? 'activity-desc' : 'saved-desc'
}

export function PodcastsSurfaceReview({
  archiveEpisodes,
  queueEpisodes,
  followedShows,
  counts,
  inspectors = {},
  archiveObservedTimeLabel,
  coverageNote,
  unresolvedSavedEpisodeCount = 0,
  filterSummary = [],
  initialMode = 'archive',
  initialSelectedId = null,
  initialInspectorTab = 'details',
  className,
  onOpenSpotify,
  onOpenReader,
}: PodcastsSurfaceReviewProps) {
  const [mode, setMode] = useState<PodcastReviewMode>(initialMode)
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId)
  const [inspectorTab, setInspectorTab] = useState<PodcastInspectorTab>(initialInspectorTab)
  const [query, setQuery] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [sort, setSort] = useState<SortValue>(defaultSort(initialMode))

  const rows =
    mode === 'archive' ? archiveEpisodes : mode === 'queue' ? queueEpisodes : followedShows
  const selectedInspector = selectedId ? inspectors[selectedId] : undefined
  const activeFilterCount = filterSummary.length

  const visibleRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    const collator = new Intl.Collator(undefined, { sensitivity: 'base' })
    return rows
      .filter((row) => {
        const searchText =
          row.kind === 'episode'
            ? `${episodeTitle(row)} ${row.show?.name ?? ''}`
            : `${showTitle(row)} ${row.publisher ?? ''}`
        if (normalizedQuery && !searchText.toLocaleLowerCase().includes(normalizedQuery))
          return false
        return true
      })
      .toSorted((a, b) => {
        if (sort === 'title-asc') {
          const aTitle = a.kind === 'episode' ? episodeTitle(a) : showTitle(a)
          const bTitle = b.kind === 'episode' ? episodeTitle(b) : showTitle(b)
          return collator.compare(aTitle, bTitle)
        }
        if (sort === 'show-asc' && a.kind === 'episode' && b.kind === 'episode') {
          return collator.compare(a.show?.name ?? '\uffff', b.show?.name ?? '\uffff')
        }
        if (sort === 'publisher-asc' && a.kind === 'show' && b.kind === 'show') {
          return collator.compare(a.publisher ?? '\uffff', b.publisher ?? '\uffff')
        }
        if (sort === 'episodes-desc' && a.kind === 'show' && b.kind === 'show') {
          const parseCount = (label?: string | null) => Number(label?.replace(/[^0-9]/g, '')) || -1
          return parseCount(b.totalEpisodesLabel) - parseCount(a.totalEpisodesLabel)
        }
        if (sort === 'observed-desc' && a.kind === 'episode' && b.kind === 'episode') {
          // The service owns exact observed-time ordering; preserve its order in this visual review.
          return 0
        }
        return 0
      })
  }, [query, rows, sort])

  const changeMode = (nextMode: PodcastReviewMode) => {
    setMode(nextMode)
    setSort(defaultSort(nextMode))
    setSelectedId(null)
    setInspectorTab('details')
  }

  const emptyMessage =
    query || activeFilterCount > 0
      ? 'No podcasts match these filters.'
      : mode === 'archive'
        ? 'No podcast episodes in Archive.'
        : mode === 'queue'
          ? 'No saved podcast episodes are currently queued.'
          : 'No followed podcast shows.'

  const filteredCount = visibleRows.length
  const totalForMode =
    mode === 'archive'
      ? counts.archiveEpisodes
      : mode === 'queue'
        ? counts.queueEpisodes
        : counts.followedShows

  return (
    <div className={joinClassNames('podcast-review', className)}>
      <header className="podcast-review-header">
        <div>
          <p>Library</p>
          <h1>Podcasts</h1>
        </div>
        {coverageNote && <span className="podcast-review-coverage">{coverageNote}</span>}
      </header>

      <nav className="podcast-review-mode-tabs" aria-label="Podcast collections">
        {(['archive', 'queue', 'following'] as const).map((value) => {
          const count =
            value === 'archive'
              ? counts.archiveEpisodes
              : value === 'queue'
                ? counts.queueEpisodes
                : counts.followedShows
          return (
            <button
              key={value}
              type="button"
              className={mode === value ? 'is-active' : undefined}
              aria-current={mode === value ? 'page' : undefined}
              onClick={() => changeMode(value)}
            >
              {modeLabels[value]}
              <span>{count.toLocaleString()}</span>
            </button>
          )
        })}
      </nav>

      <div className="podcast-review-body">
        <section className="podcast-review-collection" aria-label={`${modeLabels[mode]} podcasts`}>
          <div className="podcast-review-toolbar">
            <label className="podcast-review-search">
              <Search aria-hidden="true" />
              <span className="sr-only">
                {mode === 'following' ? 'Search followed shows' : 'Search episodes or shows'}
              </span>
              <input
                value={query}
                placeholder={
                  mode === 'following' ? 'Search followed shows' : 'Search episodes or shows'
                }
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && (
                <button type="button" aria-label="Clear search" onClick={() => setQuery('')}>
                  <X aria-hidden="true" />
                </button>
              )}
            </label>
            <button
              type="button"
              className={joinClassNames('podcast-review-control', filtersOpen && 'is-active')}
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((value) => !value)}
            >
              <ListFilter aria-hidden="true" />
              Filters
              {activeFilterCount > 0 && <span>{activeFilterCount}</span>}
            </button>
            <label className="podcast-review-sort">
              <ArrowUpDown aria-hidden="true" />
              <span className="sr-only">Sort podcasts</span>
              <select value={sort} onChange={(event) => setSort(event.target.value as SortValue)}>
                {sortOptions(mode).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {filtersOpen && (
            <div className="podcast-review-filters">
              {filterLabels[mode].map((filter) => (
                <span className="podcast-review-filter-chip" key={filter}>
                  {filter}
                </span>
              ))}
              {filterSummary.map((filter) => (
                <span className="podcast-review-filter-chip" key={filter}>
                  {filter}
                </span>
              ))}
            </div>
          )}

          <div className="podcast-review-results-meta">
            <span>
              {filteredCount.toLocaleString()} of {totalForMode.toLocaleString()}{' '}
              {mode === 'following' ? 'shows' : 'episodes'}
              {mode === 'archive' && archiveObservedTimeLabel
                ? ` · ${archiveObservedTimeLabel} observed on Spotify`
                : ''}
            </span>
            {mode === 'archive' ? <span>One row per episode</span> : null}
          </div>

          {mode === 'queue' && unresolvedSavedEpisodeCount > 0 && (
            <div className="podcast-review-unresolved">
              <CircleAlert aria-hidden="true" />
              {unresolvedSavedEpisodeCount.toLocaleString()} saved Spotify rows could not be
              identified
            </div>
          )}

          <div className="podcast-review-scroll">
            {visibleRows.length ? (
              mode === 'following' ? (
                <div className="podcast-review-show-grid">
                  {(visibleRows as PodcastShowRow[]).map((show) => (
                    <ShowCard
                      key={show.id}
                      show={show}
                      selected={selectedId === show.id}
                      onSelect={() => {
                        setSelectedId(show.id)
                        setInspectorTab('details')
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div className="podcast-review-episode-list">
                  {(visibleRows as PodcastEpisodeRow[]).map((episode) => (
                    <EpisodeRow
                      key={episode.id}
                      episode={episode}
                      mode={mode}
                      selected={selectedId === episode.id}
                      onSelect={() => {
                        setSelectedId(episode.id)
                        setInspectorTab('details')
                      }}
                    />
                  ))}
                </div>
              )
            ) : (
              <div className="podcast-review-empty">
                {mode === 'following' ? (
                  <Library aria-hidden="true" />
                ) : (
                  <Headphones aria-hidden="true" />
                )}
                <strong>{emptyMessage}</strong>
                {(query || activeFilterCount > 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('')
                    }}
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        {selectedId && (
          <Inspector
            item={selectedInspector}
            tab={inspectorTab}
            onTabChange={setInspectorTab}
            onClose={() => setSelectedId(null)}
            onOpenSpotify={onOpenSpotify}
            onOpenReader={onOpenReader}
          />
        )}
      </div>
    </div>
  )
}
