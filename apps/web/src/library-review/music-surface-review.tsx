import { useMemo, useState, type ReactNode } from 'react'
import {
  ArrowDownWideNarrow,
  CalendarRange,
  ChevronRight,
  Clock3,
  Disc3,
  ExternalLink,
  ListFilter,
  Music2,
  Search,
  SlidersHorizontal,
  UserRound,
  X,
} from 'lucide-react'

import './music-surface-review.css'

export type MusicView = 'tracks' | 'albums' | 'artists'
export type MusicInspectorTab = 'details' | 'history'
export type MusicCatalogState = 'current' | 'export_only' | 'unavailable' | 'expired'
export type MusicActivitySource = 'all' | 'export' | 'recent_api'
export type MusicPeriod = 'all' | 'year' | 'last12months' | 'range'
export type MusicPlaybackBucket = 'any' | 'once' | '2to9' | '10to49' | '50plus'
export type MusicMetadataFilter = 'any' | MusicCatalogState

export interface MusicAggregate {
  qualifyingPlaybackCount: number
  exportBackedPlaybackCount: number
  apiOnlyPlaybackCount: number
  reconciledPlaybackCount: number
  playbacksWithObservedDuration: number
  observedMs: number
  firstPlayedAt?: string | null
  latestPlayedAt?: string | null
}

export interface MusicArtwork {
  src: string
  alt?: string
}

export interface MusicArtistRef {
  id?: string | null
  name: string
  spotifyHref?: string | null
}

export interface MusicAlbumRef {
  id?: string | null
  name: string
  spotifyHref?: string | null
}

export interface MusicHistoryEntry {
  id: string
  occurredAtLabel: string
  occurredAt?: string | null
  source: 'export' | 'recent_api'
  observedMs?: number | null
  qualification: '30_second_rule' | 'recent_api_exception' | 'under_30_seconds' | 'zero_duration'
  trackTitle?: string | null
  artists?: MusicArtistRef[]
  skipped?: boolean | null
  matchesCurrentPeriod?: boolean
  reconciled?: boolean
  evidenceCount?: number
  detail?: string | null
}

export interface MusicTrackSummary {
  id: string
  title: string | null
  importedTitle?: string | null
  artists: MusicArtistRef[]
  importedArtistText?: string | null
  album?: MusicAlbumRef | null
  importedAlbumText?: string | null
  artwork?: MusicArtwork | null
  explicit?: boolean | null
  durationLabel?: string | null
  releaseLabel?: string | null
  discAndTrackLabel?: string | null
  isrc?: string | null
  spotifyUri?: string | null
  spotifyHref?: string | null
  catalogState: MusicCatalogState
  unavailable?: boolean
  period: MusicAggregate
  lifetime: MusicAggregate
  history: MusicHistoryEntry[]
  sourceFacts?: Array<{ label: string; value: string }>
}

export interface MusicAlbumSummary {
  id: string
  title: string | null
  artists: MusicArtistRef[]
  artwork?: MusicArtwork | null
  albumType?: 'album' | 'single' | 'compilation' | 'other' | null
  releaseLabel?: string | null
  totalCatalogTracks?: number | null
  uniqueTracksHeard: number
  spotifyUri?: string | null
  spotifyHref?: string | null
  catalogState: MusicCatalogState
  period: MusicAggregate
  lifetime: MusicAggregate
  tracksHeard?: MusicTrackSummary[]
  history: MusicHistoryEntry[]
  sourceFacts?: Array<{ label: string; value: string }>
}

export interface MusicArtistSummary {
  id: string
  name: string | null
  artwork?: MusicArtwork | null
  spotifyUri?: string | null
  spotifyHref?: string | null
  catalogState: MusicCatalogState
  uniqueTracksHeard: number
  releasesHeard: number
  period: MusicAggregate
  lifetime: MusicAggregate
  topTracks?: MusicTrackSummary[]
  releases?: MusicAlbumSummary[]
  history: MusicHistoryEntry[]
  sourceFacts?: Array<{ label: string; value: string }>
}

export interface MusicCoverage {
  exportLabel?: string | null
  recentPollLabel?: string | null
  checkpointLabel?: string | null
  importIncomplete?: boolean
  newExportAwaitingReconciliation?: boolean
  possibleOverlap?: boolean
  possibleRecentGap?: boolean
  tracksAwaitingAlbumIdentity?: number
  tracksAwaitingArtistIdentity?: number
}

export interface MusicSurfaceCounts {
  tracks: number
  albums: number
  artists: number
  filteredTracks?: number
  filteredAlbums?: number
  filteredArtists?: number
  filteredUniqueTracks: number
  filteredQualifyingPlaybacks: number
  filteredObservedMs: number
  filteredPlaybacksWithObservedDuration: number
}

export interface MusicSurfaceData {
  tracks: MusicTrackSummary[]
  albums: MusicAlbumSummary[]
  artists: MusicArtistSummary[]
  counts: MusicSurfaceCounts
  coverage?: MusicCoverage
  periodLabel?: string
  timeZone?: string
  accountOptions?: Array<{ id: string; label: string }>
}

export type MusicSelection =
  { kind: 'track'; id: string } | { kind: 'album'; id: string } | { kind: 'artist'; id: string }

export interface MusicReviewControls {
  query: string
  period: MusicPeriod
  from: string
  to: string
  source: MusicActivitySource
  account: string
  playbackCount: MusicPlaybackBucket
  metadata: MusicMetadataFilter
  sort: string
}

export interface MusicSurfaceReviewProps {
  data: MusicSurfaceData
  initialView?: MusicView
  initialSelected?: MusicSelection | null
  className?: string
  onControlsChange?: (controls: MusicReviewControls) => void
  onOpenSpotify?: (href: string) => void
}

type SelectedEntity =
  | { kind: 'track'; item: MusicTrackSummary }
  | { kind: 'album'; item: MusicAlbumSummary }
  | { kind: 'artist'; item: MusicArtistSummary }

const emptyAggregate: MusicAggregate = {
  qualifyingPlaybackCount: 0,
  exportBackedPlaybackCount: 0,
  apiOnlyPlaybackCount: 0,
  reconciledPlaybackCount: 0,
  playbacksWithObservedDuration: 0,
  observedMs: 0,
}

const viewLabels: Record<MusicView, string> = {
  tracks: 'Tracks',
  albums: 'Albums',
  artists: 'Artists',
}

const catalogLabels: Record<MusicCatalogState, string> = {
  current: 'Current Spotify details',
  export_only: 'Export details only',
  unavailable: 'Details unavailable',
  expired: 'Spotify details expired',
}

const joinClassNames = (...values: Array<string | false | undefined>) =>
  values.filter(Boolean).join(' ')

function trackTitle(track: Pick<MusicTrackSummary, 'title'>) {
  return track.title?.trim() || 'Untitled track'
}

function albumTitle(album: Pick<MusicAlbumSummary, 'title'>) {
  return album.title?.trim() || 'Album unavailable'
}

function artistName(artist: Pick<MusicArtistSummary, 'name'>) {
  return artist.name?.trim() || 'Artist unavailable'
}

function artistNames(artists: MusicArtistRef[], fallback = 'Artist unavailable') {
  return (
    artists
      .map((artist) => artist.name)
      .filter(Boolean)
      .join(', ') || fallback
  )
}

function formatCount(value: number) {
  return new Intl.NumberFormat().format(value)
}

function formatObserved(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return '0m'
  const totalMinutes = Math.floor(ms / 60_000)
  const days = Math.floor(totalMinutes / 1_440)
  const hours = Math.floor((totalMinutes % 1_440) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `${formatCount(days)}d ${hours}h`
  if (hours > 0) return `${formatCount(hours)}h ${minutes}m`
  return `${minutes}m`
}

function dateLabel(value?: string | null) {
  if (!value) return 'Date unavailable'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.valueOf())) return value
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed)
}

function missingDurationCount(aggregate: MusicAggregate) {
  return Math.max(0, aggregate.qualifyingPlaybackCount - aggregate.playbacksWithObservedDuration)
}

function playbackBucketMatches(count: number, bucket: MusicPlaybackBucket) {
  if (bucket === 'once') return count === 1
  if (bucket === '2to9') return count >= 2 && count <= 9
  if (bucket === '10to49') return count >= 10 && count <= 49
  if (bucket === '50plus') return count >= 50
  return true
}

function sourceMatches(aggregate: MusicAggregate, source: MusicActivitySource) {
  if (source === 'export') return aggregate.exportBackedPlaybackCount > 0
  if (source === 'recent_api')
    return aggregate.apiOnlyPlaybackCount + aggregate.reconciledPlaybackCount > 0
  return true
}

function SourceLink({
  href,
  onOpen,
  compact = false,
}: {
  href?: string | null | undefined
  onOpen?: ((href: string) => void) | undefined
  compact?: boolean
}) {
  if (!href) return null
  return (
    <a
      className={joinClassNames('music-review-source-link', compact && 'is-compact')}
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={() => onOpen?.(href)}
    >
      <span>Spotify</span>
      <ExternalLink aria-hidden="true" />
    </a>
  )
}

function Artwork({
  artwork,
  label,
  size,
}: {
  artwork?: MusicArtwork | null | undefined
  label: string
  size: 'row' | 'card' | 'inspector'
}) {
  const [imageFailed, setImageFailed] = useState(false)
  if (artwork?.src && !imageFailed) {
    return (
      <img
        className={`music-review-artwork music-review-artwork--${size}`}
        src={artwork.src}
        alt={artwork.alt ?? ''}
        onError={() => setImageFailed(true)}
      />
    )
  }
  return (
    <span
      className={`music-review-artwork music-review-artwork--${size} is-placeholder`}
      role="img"
      aria-label={`Artwork unavailable for ${label}`}
    >
      <Disc3 aria-hidden="true" />
    </span>
  )
}

function CountWithCoverage({ aggregate }: { aggregate: MusicAggregate }) {
  const missing = missingDurationCount(aggregate)
  return (
    <span className="music-review-metric-stack">
      <strong>{formatCount(aggregate.qualifyingPlaybackCount)}</strong>
      {missing > 0 && <small>+{formatCount(missing)} without duration</small>}
    </span>
  )
}

function AggregateDetails({
  period,
  lifetime,
  periodLabel,
}: {
  period: MusicAggregate
  lifetime: MusicAggregate
  periodLabel: string
}) {
  const allTime = periodLabel.toLocaleLowerCase() === 'all time'
  return (
    <dl className="music-review-facts music-review-listening-facts">
      <div>
        <dt>{allTime ? 'Qualifying playbacks' : `${periodLabel} playbacks`}</dt>
        <dd>{formatCount(period.qualifyingPlaybackCount)}</dd>
      </div>
      {!allTime && (
        <div>
          <dt>Lifetime playbacks</dt>
          <dd>{formatCount(lifetime.qualifyingPlaybackCount)}</dd>
        </div>
      )}
      <div>
        <dt>{allTime ? 'Observed time' : `${periodLabel} observed`}</dt>
        <dd>{formatObserved(period.observedMs)}</dd>
      </div>
      {!allTime && (
        <div>
          <dt>Lifetime observed</dt>
          <dd>{formatObserved(lifetime.observedMs)}</dd>
        </div>
      )}
      <div>
        <dt>Duration coverage</dt>
        <dd>
          {formatCount(period.playbacksWithObservedDuration)} of{' '}
          {formatCount(period.qualifyingPlaybackCount)} playbacks
        </dd>
      </div>
      <div>
        <dt>First playback</dt>
        <dd>{dateLabel(period.firstPlayedAt ?? lifetime.firstPlayedAt)}</dd>
      </div>
      <div>
        <dt>Latest playback</dt>
        <dd>{dateLabel(period.latestPlayedAt ?? lifetime.latestPlayedAt)}</dd>
      </div>
      <div>
        <dt>Export-backed</dt>
        <dd>{formatCount(period.exportBackedPlaybackCount)}</dd>
      </div>
      <div>
        <dt>Recent API only</dt>
        <dd>{formatCount(period.apiOnlyPlaybackCount)}</dd>
      </div>
      {period.reconciledPlaybackCount > 0 && (
        <div>
          <dt>Reconciled</dt>
          <dd>{formatCount(period.reconciledPlaybackCount)}</dd>
        </div>
      )}
    </dl>
  )
}

function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="music-review-inspector-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function HistoryRows({ history }: { history: MusicHistoryEntry[] }) {
  if (history.length === 0) {
    return <p className="music-review-empty-copy">No activity is available for this item.</p>
  }
  return (
    <div className="music-review-history-list">
      {history.map((entry) => {
        const excluded =
          entry.qualification === 'under_30_seconds' || entry.qualification === 'zero_duration'
        return (
          <details className="music-review-history-row" key={entry.id}>
            <summary>
              <span className="music-review-history-mark" aria-hidden="true" />
              <span>
                <strong>{entry.occurredAtLabel}</strong>
                {entry.trackTitle && <small>{entry.trackTitle}</small>}
                <small>
                  {entry.source === 'export'
                    ? `Export · ${formatObserved(entry.observedMs ?? 0)} observed`
                    : 'Recent API · duration unavailable'}
                </small>
              </span>
              <span className="music-review-history-flags">
                {entry.matchesCurrentPeriod && <small>Current period</small>}
                {excluded && <small>Excluded</small>}
                <ChevronRight aria-hidden="true" />
              </span>
            </summary>
            <div>
              <p>
                {entry.qualification === '30_second_rule' && 'Qualified by the 30-second rule.'}
                {entry.qualification === 'recent_api_exception' &&
                  'Qualified by the Recent API exception; observed duration is unavailable.'}
                {entry.qualification === 'under_30_seconds' && 'Excluded: under 30 seconds.'}
                {entry.qualification === 'zero_duration' && 'Excluded: zero duration.'}
              </p>
              {entry.skipped === true && <p>Spotify export recorded skipped: true.</p>}
              {entry.reconciled && <p>Export and API evidence were reconciled.</p>}
              {entry.evidenceCount && <p>{entry.evidenceCount} source evidence records.</p>}
              {entry.detail && <p>{entry.detail}</p>}
            </div>
          </details>
        )
      })}
    </div>
  )
}

function TrackDetails({ track, periodLabel }: { track: MusicTrackSummary; periodLabel: string }) {
  return (
    <>
      <InspectorSection title="Listening">
        <AggregateDetails
          period={track.period}
          lifetime={track.lifetime}
          periodLabel={periodLabel}
        />
      </InspectorSection>
      <InspectorSection title="Track">
        <dl className="music-review-facts">
          {track.durationLabel && (
            <div>
              <dt>Duration</dt>
              <dd>{track.durationLabel}</dd>
            </div>
          )}
          {track.explicit != null && (
            <div>
              <dt>Explicit</dt>
              <dd>{track.explicit ? 'Yes' : 'No'}</dd>
            </div>
          )}
          {track.discAndTrackLabel && (
            <div>
              <dt>Position</dt>
              <dd>{track.discAndTrackLabel}</dd>
            </div>
          )}
          {track.releaseLabel && (
            <div>
              <dt>Released</dt>
              <dd>{track.releaseLabel}</dd>
            </div>
          )}
          {track.isrc && (
            <div>
              <dt>ISRC identifier</dt>
              <dd>{track.isrc}</dd>
            </div>
          )}
          {track.spotifyUri && (
            <div>
              <dt>Spotify track URI</dt>
              <dd className="music-review-code-value">{track.spotifyUri}</dd>
            </div>
          )}
          <div>
            <dt>Details state</dt>
            <dd>{catalogLabels[track.catalogState]}</dd>
          </div>
          {track.unavailable && (
            <div>
              <dt>Availability</dt>
              <dd>Unavailable on Spotify</dd>
            </div>
          )}
        </dl>
      </InspectorSection>
      {track.album && (
        <InspectorSection title="Album">
          <p className="music-review-linked-name">{track.album.name}</p>
        </InspectorSection>
      )}
      <InspectorSection title="Artists">
        <div className="music-review-linked-list">
          {track.artists.length > 0 ? (
            track.artists.map((artist, index) => (
              <span key={artist.id ?? `${artist.name}-${index}`}>{artist.name}</span>
            ))
          ) : (
            <span>Artist unavailable</span>
          )}
        </div>
      </InspectorSection>
      <SourceFacts
        importedFacts={[
          ['Imported title', track.importedTitle],
          ['Imported artist', track.importedArtistText],
          ['Imported album', track.importedAlbumText],
        ]}
        sourceFacts={track.sourceFacts}
      />
    </>
  )
}

function AlbumDetails({ album, periodLabel }: { album: MusicAlbumSummary; periodLabel: string }) {
  return (
    <>
      <InspectorSection title="Listening">
        <AggregateDetails
          period={album.period}
          lifetime={album.lifetime}
          periodLabel={periodLabel}
        />
      </InspectorSection>
      <InspectorSection title="Album">
        <dl className="music-review-facts">
          <div>
            <dt>Tracks heard</dt>
            <dd>{formatCount(album.uniqueTracksHeard)}</dd>
          </div>
          {album.albumType && (
            <div>
              <dt>Type</dt>
              <dd>{album.albumType[0]?.toUpperCase() + album.albumType.slice(1)}</dd>
            </div>
          )}
          {album.releaseLabel && (
            <div>
              <dt>Released</dt>
              <dd>{album.releaseLabel}</dd>
            </div>
          )}
          {album.totalCatalogTracks != null && (
            <div>
              <dt>Catalog tracks</dt>
              <dd>{formatCount(album.totalCatalogTracks)}</dd>
            </div>
          )}
          <div>
            <dt>Album artists</dt>
            <dd>{artistNames(album.artists)}</dd>
          </div>
        </dl>
      </InspectorSection>
      {album.tracksHeard && album.tracksHeard.length > 0 && (
        <InspectorSection title="Tracks heard">
          <div className="music-review-ranked-list">
            {album.tracksHeard.slice(0, 10).map((track, index) => (
              <div key={track.id}>
                <span>{index + 1}</span>
                <strong>{trackTitle(track)}</strong>
                <small>{formatCount(track.period.qualifyingPlaybackCount)} playbacks</small>
              </div>
            ))}
          </div>
        </InspectorSection>
      )}
      <SourceFacts sourceFacts={album.sourceFacts} />
    </>
  )
}

function ArtistDetails({
  artist,
  periodLabel,
}: {
  artist: MusicArtistSummary
  periodLabel: string
}) {
  return (
    <>
      <InspectorSection title="Listening">
        <AggregateDetails
          period={artist.period}
          lifetime={artist.lifetime}
          periodLabel={periodLabel}
        />
        <dl className="music-review-facts music-review-listening-facts">
          <div>
            <dt>Tracks heard</dt>
            <dd>{formatCount(artist.uniqueTracksHeard)}</dd>
          </div>
          <div>
            <dt>Exact releases</dt>
            <dd>{formatCount(artist.releasesHeard)}</dd>
          </div>
        </dl>
      </InspectorSection>
      {artist.topTracks && artist.topTracks.length > 0 && (
        <InspectorSection title="Top tracks">
          <div className="music-review-ranked-list">
            {artist.topTracks.slice(0, 10).map((track, index) => (
              <div key={track.id}>
                <span>{index + 1}</span>
                <strong>{trackTitle(track)}</strong>
                <small>{formatCount(track.period.qualifyingPlaybackCount)} playbacks</small>
              </div>
            ))}
          </div>
        </InspectorSection>
      )}
      {artist.releases && artist.releases.length > 0 && (
        <InspectorSection title="Releases heard">
          <div className="music-review-ranked-list">
            {artist.releases.slice(0, 10).map((album, index) => (
              <div key={album.id}>
                <span>{index + 1}</span>
                <strong>{albumTitle(album)}</strong>
                <small>{formatCount(album.uniqueTracksHeard)} tracks</small>
              </div>
            ))}
          </div>
        </InspectorSection>
      )}
      <SourceFacts sourceFacts={artist.sourceFacts} />
    </>
  )
}

function SourceFacts({
  importedFacts = [],
  sourceFacts = [],
}: {
  importedFacts?: Array<[string, string | null | undefined]>
  sourceFacts?: Array<{ label: string; value: string }> | undefined
}) {
  const facts = [
    ...importedFacts.flatMap(([label, value]) => (value ? [{ label, value }] : [])),
    ...sourceFacts,
  ]
  if (facts.length === 0) return null
  return (
    <InspectorSection title="Source">
      <dl className="music-review-facts">
        {facts.map((fact, index) => (
          <div key={`${fact.label}-${index}`}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
    </InspectorSection>
  )
}

function summaryForView(view: MusicView, data: MusicSurfaceData) {
  const { counts } = data
  if (view === 'albums') {
    return `${formatCount(counts.filteredAlbums ?? counts.albums)} albums · ${formatCount(counts.filteredUniqueTracks)} tracks heard · ${formatCount(counts.filteredQualifyingPlaybacks)} qualifying playbacks · ${formatObserved(counts.filteredObservedMs)} observed`
  }
  if (view === 'artists') {
    return `${formatCount(counts.filteredArtists ?? counts.artists)} artists · ${formatCount(counts.filteredUniqueTracks)} tracks heard · ${formatCount(counts.filteredQualifyingPlaybacks)} qualifying playbacks · ${formatObserved(counts.filteredObservedMs)} observed`
  }
  return `${formatCount(counts.filteredTracks ?? counts.tracks)} tracks · ${formatCount(counts.filteredQualifyingPlaybacks)} qualifying playbacks · ${formatObserved(counts.filteredObservedMs)} observed`
}

function sortOptions(view: MusicView) {
  if (view === 'albums') {
    return [
      ['playback-desc', 'Most playbacks'],
      ['played-desc', 'Recently played'],
      ['title-asc', 'Album · A–Z'],
      ['tracks-desc', 'Tracks heard'],
      ['time-desc', 'Observed time'],
    ] as const
  }
  if (view === 'artists') {
    return [
      ['playback-desc', 'Most playbacks'],
      ['played-desc', 'Recently played'],
      ['title-asc', 'Artist · A–Z'],
      ['tracks-desc', 'Tracks heard'],
      ['releases-desc', 'Releases heard'],
      ['time-desc', 'Observed time'],
    ] as const
  }
  return [
    ['played-desc', 'Recently played'],
    ['title-asc', 'Track · A–Z'],
    ['artist-asc', 'Artist · A–Z'],
    ['album-asc', 'Album · A–Z'],
    ['playback-desc', 'Most playbacks'],
    ['time-desc', 'Observed time'],
  ] as const
}

function selectAggregate(entity: MusicTrackSummary | MusicAlbumSummary | MusicArtistSummary) {
  return entity.period ?? emptyAggregate
}

export function MusicSurfaceReview({
  data,
  initialView = 'tracks',
  initialSelected = null,
  className,
  onControlsChange,
  onOpenSpotify,
}: MusicSurfaceReviewProps) {
  const [view, setView] = useState<MusicView>(initialView)
  const [selection, setSelection] = useState<MusicSelection | null>(initialSelected)
  const [inspectorTab, setInspectorTab] = useState<MusicInspectorTab>('details')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [historyMode, setHistoryMode] = useState<'qualifying' | 'excluded'>('qualifying')
  const [onlyCurrentPeriod, setOnlyCurrentPeriod] = useState(false)
  const [controls, setControls] = useState<MusicReviewControls>({
    query: '',
    period: 'all',
    from: '',
    to: '',
    source: 'all',
    account: 'all',
    playbackCount: 'any',
    metadata: 'any',
    sort: initialView === 'tracks' ? 'played-desc' : 'playback-desc',
  })

  const updateControls = <Key extends keyof MusicReviewControls>(
    key: Key,
    value: MusicReviewControls[Key],
  ) => {
    const next = { ...controls, [key]: value }
    setControls(next)
    onControlsChange?.(next)
  }

  const changeView = (nextView: MusicView) => {
    setView(nextView)
    setSelection(null)
    setInspectorTab('details')
    updateControls('sort', nextView === 'tracks' ? 'played-desc' : 'playback-desc')
  }

  const selected = useMemo<SelectedEntity | null>(() => {
    if (!selection) return null
    if (selection.kind === 'track') {
      const item = data.tracks.find((track) => track.id === selection.id)
      return item ? { kind: 'track', item } : null
    }
    if (selection.kind === 'album') {
      const item = data.albums.find((album) => album.id === selection.id)
      return item ? { kind: 'album', item } : null
    }
    const item = data.artists.find((artist) => artist.id === selection.id)
    return item ? { kind: 'artist', item } : null
  }, [data.albums, data.artists, data.tracks, selection])

  const visibleItems = useMemo(() => {
    const query = controls.query.trim().toLocaleLowerCase()
    const items = view === 'tracks' ? data.tracks : view === 'albums' ? data.albums : data.artists
    const filtered = items.filter((item) => {
      const aggregate = selectAggregate(item)
      const searchable =
        view === 'tracks'
          ? `${trackTitle(item as MusicTrackSummary)} ${artistNames((item as MusicTrackSummary).artists, '')} ${(item as MusicTrackSummary).album?.name ?? ''} ${(item as MusicTrackSummary).isrc ?? ''} ${(item as MusicTrackSummary).spotifyUri ?? ''}`
          : view === 'albums'
            ? `${albumTitle(item as MusicAlbumSummary)} ${artistNames((item as MusicAlbumSummary).artists, '')} ${(item as MusicAlbumSummary).spotifyUri ?? ''}`
            : `${artistName(item as MusicArtistSummary)} ${(item as MusicArtistSummary).spotifyUri ?? ''}`
      if (query && !searchable.toLocaleLowerCase().includes(query)) return false
      if (!playbackBucketMatches(aggregate.qualifyingPlaybackCount, controls.playbackCount))
        return false
      if (!sourceMatches(aggregate, controls.source)) return false
      if (controls.metadata !== 'any' && item.catalogState !== controls.metadata) return false
      return true
    })

    const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })
    return filtered.toSorted((left, right) => {
      const leftAggregate = selectAggregate(left)
      const rightAggregate = selectAggregate(right)
      if (controls.sort === 'played-desc') {
        return (
          Date.parse(rightAggregate.latestPlayedAt ?? '') -
          Date.parse(leftAggregate.latestPlayedAt ?? '')
        )
      }
      if (controls.sort === 'playback-desc') {
        return rightAggregate.qualifyingPlaybackCount - leftAggregate.qualifyingPlaybackCount
      }
      if (controls.sort === 'time-desc') return rightAggregate.observedMs - leftAggregate.observedMs
      if (controls.sort === 'tracks-desc') {
        const leftCount =
          'uniqueTracksHeard' in left
            ? left.uniqueTracksHeard
            : leftAggregate.qualifyingPlaybackCount
        const rightCount =
          'uniqueTracksHeard' in right
            ? right.uniqueTracksHeard
            : rightAggregate.qualifyingPlaybackCount
        return rightCount - leftCount
      }
      if (controls.sort === 'releases-desc') {
        return (
          (right as MusicArtistSummary).releasesHeard - (left as MusicArtistSummary).releasesHeard
        )
      }
      if (controls.sort === 'artist-asc') {
        return collator.compare(
          artistNames((left as MusicTrackSummary).artists),
          artistNames((right as MusicTrackSummary).artists),
        )
      }
      if (controls.sort === 'album-asc') {
        return collator.compare(
          (left as MusicTrackSummary).album?.name ?? '',
          (right as MusicTrackSummary).album?.name ?? '',
        )
      }
      const leftLabel =
        view === 'tracks'
          ? trackTitle(left as MusicTrackSummary)
          : view === 'albums'
            ? albumTitle(left as MusicAlbumSummary)
            : artistName(left as MusicArtistSummary)
      const rightLabel =
        view === 'tracks'
          ? trackTitle(right as MusicTrackSummary)
          : view === 'albums'
            ? albumTitle(right as MusicAlbumSummary)
            : artistName(right as MusicArtistSummary)
      return collator.compare(leftLabel, rightLabel)
    })
  }, [controls, data.albums, data.artists, data.tracks, view])

  const activeFilterCount =
    Number(controls.source !== 'all') +
    Number(controls.account !== 'all') +
    Number(controls.playbackCount !== 'any') +
    Number(controls.metadata !== 'any')

  const clearFilters = () => {
    const next = {
      ...controls,
      query: '',
      source: 'all' as const,
      account: 'all',
      playbackCount: 'any' as const,
      metadata: 'any' as const,
    }
    setControls(next)
    onControlsChange?.(next)
  }

  const periodLabel = data.periodLabel ?? 'All time'
  const history = selected?.item.history ?? []
  const visibleHistory = history.filter((entry) => {
    const excluded =
      entry.qualification === 'under_30_seconds' || entry.qualification === 'zero_duration'
    if ((historyMode === 'excluded') !== excluded) return false
    if (onlyCurrentPeriod && !entry.matchesCurrentPeriod) return false
    return true
  })

  const searchPlaceholder =
    view === 'tracks'
      ? 'Search tracks, artists, albums, ISRC, or Spotify URI'
      : view === 'albums'
        ? 'Search albums or artists'
        : 'Search artists or Spotify URI'

  return (
    <div className={joinClassNames('music-review', className)}>
      <header className="music-review-header">
        <div>
          <p>Playback history</p>
          <h1>Music</h1>
        </div>
        <div className="music-review-header-summary">
          <strong>{formatCount(data.counts.tracks)}</strong>
          <span>tracks with qualifying playback</span>
        </div>
      </header>

      <nav className="music-review-view-tabs" aria-label="Music views">
        {(['tracks', 'albums', 'artists'] as const).map((item) => (
          <button
            key={item}
            type="button"
            className={view === item ? 'is-active' : ''}
            aria-pressed={view === item}
            onClick={() => changeView(item)}
          >
            {viewLabels[item]}
            <span>{formatCount(data.counts[item])}</span>
          </button>
        ))}
      </nav>

      <div className="music-review-body">
        <section className="music-review-collection" aria-label={`${viewLabels[view]} collection`}>
          <div className="music-review-toolbar">
            <label className="music-review-search">
              <Search aria-hidden="true" />
              <span className="sr-only">{searchPlaceholder}</span>
              <input
                type="search"
                value={controls.query}
                placeholder={searchPlaceholder}
                onChange={(event) => updateControls('query', event.target.value)}
              />
              {controls.query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => updateControls('query', '')}
                >
                  <X aria-hidden="true" />
                </button>
              )}
            </label>
            <label className="music-review-select-control">
              <CalendarRange aria-hidden="true" />
              <span className="sr-only">Playback period</span>
              <select
                value={controls.period}
                onChange={(event) => updateControls('period', event.target.value as MusicPeriod)}
              >
                <option value="all">All time</option>
                <option value="year">This year</option>
                <option value="last12months">Last 12 months</option>
                <option value="range">Custom range</option>
              </select>
            </label>
            <button
              className={joinClassNames(
                'music-review-control',
                (filtersOpen || activeFilterCount > 0) && 'is-active',
              )}
              type="button"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((value) => !value)}
            >
              <SlidersHorizontal aria-hidden="true" />
              Filters
              {activeFilterCount > 0 && <span>{activeFilterCount}</span>}
            </button>
            <label className="music-review-select-control music-review-sort-control">
              <ArrowDownWideNarrow aria-hidden="true" />
              <span className="sr-only">Sort</span>
              <select
                value={controls.sort}
                onChange={(event) => updateControls('sort', event.target.value)}
              >
                {sortOptions(view).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {(filtersOpen || controls.period === 'range') && (
            <div className="music-review-filter-drawer">
              {controls.period === 'range' && (
                <div className="music-review-date-range">
                  <label>
                    From
                    <input
                      type="date"
                      value={controls.from}
                      onChange={(event) => updateControls('from', event.target.value)}
                    />
                  </label>
                  <label>
                    To
                    <input
                      type="date"
                      value={controls.to}
                      onChange={(event) => updateControls('to', event.target.value)}
                    />
                  </label>
                  {data.timeZone && <small>Calendar dates use {data.timeZone}.</small>}
                </div>
              )}
              {filtersOpen && (
                <>
                  <label>
                    Activity source
                    <select
                      value={controls.source}
                      onChange={(event) =>
                        updateControls('source', event.target.value as MusicActivitySource)
                      }
                    >
                      <option value="all">All activity</option>
                      <option value="export">Extended Streaming History</option>
                      <option value="recent_api">Recently Played API</option>
                    </select>
                  </label>
                  {data.accountOptions && data.accountOptions.length > 1 && (
                    <label>
                      Spotify account
                      <select
                        value={controls.account}
                        onChange={(event) => updateControls('account', event.target.value)}
                      >
                        <option value="all">All accounts</option>
                        {data.accountOptions.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label>
                    Playback count
                    <select
                      value={controls.playbackCount}
                      onChange={(event) =>
                        updateControls('playbackCount', event.target.value as MusicPlaybackBucket)
                      }
                    >
                      <option value="any">Any</option>
                      <option value="once">Once</option>
                      <option value="2to9">2–9</option>
                      <option value="10to49">10–49</option>
                      <option value="50plus">50+</option>
                    </select>
                  </label>
                  <label>
                    Metadata
                    <select
                      value={controls.metadata}
                      onChange={(event) =>
                        updateControls('metadata', event.target.value as MusicMetadataFilter)
                      }
                    >
                      <option value="any">Any</option>
                      <option value="current">Current Spotify details</option>
                      <option value="export_only">Export details only</option>
                      <option value="unavailable">Details unavailable</option>
                      <option value="expired">Spotify details expired</option>
                    </select>
                  </label>
                </>
              )}
            </div>
          )}

          <div className="music-review-result-meta">
            <div>
              <strong>{summaryForView(view, data)}</strong>
              {missingDurationCount({
                ...emptyAggregate,
                qualifyingPlaybackCount: data.counts.filteredQualifyingPlaybacks,
                playbacksWithObservedDuration: data.counts.filteredPlaybacksWithObservedDuration,
              }) > 0 && (
                <span>
                  {formatCount(
                    data.counts.filteredQualifyingPlaybacks -
                      data.counts.filteredPlaybacksWithObservedDuration,
                  )}{' '}
                  qualifying playbacks have no observed duration
                </span>
              )}
              {view === 'artists' && (
                <span>Multi-artist tracks contribute to each credited artist.</span>
              )}
            </div>
            {(controls.query || activeFilterCount > 0) && (
              <button className="music-review-clear-filters" type="button" onClick={clearFilters}>
                <X aria-hidden="true" /> Clear filters
              </button>
            )}
            <CoverageDisclosure coverage={data.coverage} />
          </div>

          {view === 'tracks' && (
            <TracksView
              tracks={visibleItems as MusicTrackSummary[]}
              selectedId={selection?.kind === 'track' ? selection.id : null}
              showLifetime={periodLabel.toLocaleLowerCase() !== 'all time'}
              onSelect={(id) => setSelection({ kind: 'track', id })}
              onOpenSpotify={onOpenSpotify}
            />
          )}
          {view === 'albums' && (
            <AlbumsView
              albums={visibleItems as MusicAlbumSummary[]}
              selectedId={selection?.kind === 'album' ? selection.id : null}
              onSelect={(id) => setSelection({ kind: 'album', id })}
              onOpenSpotify={onOpenSpotify}
            />
          )}
          {view === 'artists' && (
            <ArtistsView
              artists={visibleItems as MusicArtistSummary[]}
              selectedId={selection?.kind === 'artist' ? selection.id : null}
              onSelect={(id) => setSelection({ kind: 'artist', id })}
              onOpenSpotify={onOpenSpotify}
            />
          )}
        </section>

        {selected && (
          <aside className="music-review-inspector" aria-label={`${selected.kind} details`}>
            <div className="music-review-inspector-bar">
              <span>{selected.kind}</span>
              <button type="button" aria-label="Close inspector" onClick={() => setSelection(null)}>
                <X aria-hidden="true" />
              </button>
            </div>
            <InspectorHeader selected={selected} onOpenSpotify={onOpenSpotify} />
            <div className="music-review-inspector-tabs" role="tablist">
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
                History <span>{formatCount(history.length)}</span>
              </button>
            </div>
            <div className="music-review-inspector-scroll">
              {inspectorTab === 'details' ? (
                <>
                  {selected.kind === 'track' && (
                    <TrackDetails track={selected.item} periodLabel={periodLabel} />
                  )}
                  {selected.kind === 'album' && (
                    <AlbumDetails album={selected.item} periodLabel={periodLabel} />
                  )}
                  {selected.kind === 'artist' && (
                    <ArtistDetails artist={selected.item} periodLabel={periodLabel} />
                  )}
                </>
              ) : (
                <>
                  <div className="music-review-history-controls">
                    <label>
                      <ListFilter aria-hidden="true" />
                      <select
                        value={historyMode}
                        onChange={(event) =>
                          setHistoryMode(event.target.value as 'qualifying' | 'excluded')
                        }
                      >
                        <option value="qualifying">Qualifying playbacks</option>
                        <option value="excluded">Excluded observations</option>
                      </select>
                    </label>
                    <label className="music-review-check-control">
                      <input
                        type="checkbox"
                        checked={onlyCurrentPeriod}
                        onChange={(event) => setOnlyCurrentPeriod(event.target.checked)}
                      />
                      Current period only
                    </label>
                  </div>
                  <HistoryRows history={visibleHistory} />
                </>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}

function CoverageDisclosure({ coverage }: { coverage?: MusicCoverage | undefined }) {
  if (!coverage) return null
  const warnings = [
    coverage.importIncomplete &&
      'Spotify import incomplete · totals include processed records only',
    coverage.newExportAwaitingReconciliation && 'New export awaiting playback reconciliation',
    coverage.possibleOverlap && 'Recent activity may overlap this export',
    coverage.possibleRecentGap && 'Recent API coverage may contain a gap',
  ].filter(Boolean) as string[]
  return (
    <details className="music-review-coverage">
      <summary>
        <Clock3 aria-hidden="true" /> Coverage
        {warnings.length > 0 && <span>{warnings.length}</span>}
      </summary>
      <div>
        {coverage.exportLabel && (
          <p>
            <strong>Export</strong>
            {coverage.exportLabel}
          </p>
        )}
        {coverage.recentPollLabel && (
          <p>
            <strong>Recent activity</strong>
            {coverage.recentPollLabel}
          </p>
        )}
        {coverage.checkpointLabel && (
          <p>
            <strong>Checkpoint</strong>
            {coverage.checkpointLabel}
          </p>
        )}
        {coverage.tracksAwaitingAlbumIdentity != null && (
          <p>{formatCount(coverage.tracksAwaitingAlbumIdentity)} tracks awaiting album identity</p>
        )}
        {coverage.tracksAwaitingArtistIdentity != null && (
          <p>
            {formatCount(coverage.tracksAwaitingArtistIdentity)} tracks awaiting artist identity
          </p>
        )}
        {warnings.map((warning) => (
          <p className="is-warning" key={warning}>
            {warning}
          </p>
        ))}
      </div>
    </details>
  )
}

function TracksView({
  tracks,
  selectedId,
  showLifetime,
  onSelect,
  onOpenSpotify,
}: {
  tracks: MusicTrackSummary[]
  selectedId: string | null
  showLifetime: boolean
  onSelect: (id: string) => void
  onOpenSpotify?: ((href: string) => void) | undefined
}) {
  if (tracks.length === 0) {
    return <EmptyCollection icon={<Music2 />} title="No tracks match these filters" />
  }
  return (
    <div className="music-review-table-scroll">
      <div className="music-review-track-table" role="table" aria-label="Tracks">
        <div className="music-review-track-head" role="row">
          <span role="columnheader">Track</span>
          <span role="columnheader">Artist</span>
          <span role="columnheader">Album</span>
          <span role="columnheader">Playbacks</span>
          <span role="columnheader">Observed time</span>
          <span role="columnheader">Last played</span>
          <span role="columnheader" className="sr-only">
            Source
          </span>
        </div>
        {tracks.map((track) => (
          <div
            key={track.id}
            className={joinClassNames(
              'music-review-track-row',
              selectedId === track.id && 'is-selected',
            )}
            role="row"
          >
            <button
              className="music-review-row-target"
              type="button"
              aria-label={`Inspect ${trackTitle(track)}`}
              onClick={() => onSelect(track.id)}
            />
            <span className="music-review-track-identity" role="cell">
              <Artwork artwork={track.artwork} label={trackTitle(track)} size="row" />
              <span>
                <strong>{trackTitle(track)}</strong>
                {track.explicit === true && <small>Explicit</small>}
                {track.catalogState !== 'current' && (
                  <small>{catalogLabels[track.catalogState]}</small>
                )}
                <small className="music-review-track-secondary">
                  {artistNames(track.artists, track.importedArtistText ?? 'Artist unavailable')} ·{' '}
                  {track.album?.name ?? track.importedAlbumText ?? 'Album unavailable'}
                </small>
              </span>
            </span>
            <span className="music-review-clamped" role="cell">
              {artistNames(track.artists, track.importedArtistText ?? 'Artist unavailable')}
            </span>
            <span className="music-review-clamped is-muted" role="cell">
              {track.album?.name ?? track.importedAlbumText ?? 'Album unavailable'}
            </span>
            <span role="cell">
              <span className="music-review-metric-stack">
                <strong>{formatCount(track.period.qualifyingPlaybackCount)}</strong>
                {showLifetime && (
                  <small>{formatCount(track.lifetime.qualifyingPlaybackCount)} lifetime</small>
                )}
              </span>
            </span>
            <span role="cell">
              <span className="music-review-metric-stack">
                <strong>{formatObserved(track.period.observedMs)}</strong>
                {missingDurationCount(track.period) > 0 && (
                  <small>+{formatCount(missingDurationCount(track.period))} no duration</small>
                )}
              </span>
            </span>
            <span className="music-review-date-cell" role="cell">
              {dateLabel(track.period.latestPlayedAt ?? track.lifetime.latestPlayedAt)}
            </span>
            <span className="music-review-source-cell" role="cell">
              <SourceLink href={track.spotifyHref} onOpen={onOpenSpotify} compact />
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AlbumsView({
  albums,
  selectedId,
  onSelect,
  onOpenSpotify,
}: {
  albums: MusicAlbumSummary[]
  selectedId: string | null
  onSelect: (id: string) => void
  onOpenSpotify?: ((href: string) => void) | undefined
}) {
  if (albums.length === 0) {
    return <EmptyCollection icon={<Disc3 />} title="No albums with verified identities" />
  }
  return (
    <div className="music-review-grid-scroll">
      <div className="music-review-album-grid">
        {albums.map((album) => (
          <article
            key={album.id}
            className={joinClassNames(
              'music-review-album-card',
              selectedId === album.id && 'is-selected',
            )}
          >
            <button
              className="music-review-card-target"
              type="button"
              aria-label={`Inspect ${albumTitle(album)}`}
              onClick={() => onSelect(album.id)}
            />
            <Artwork artwork={album.artwork} label={albumTitle(album)} size="card" />
            <strong>{albumTitle(album)}</strong>
            <span>{artistNames(album.artists)}</span>
            <small>{formatCount(album.uniqueTracksHeard)} tracks heard</small>
            <div>
              <span>{formatCount(album.period.qualifyingPlaybackCount)} playbacks</span>
              <span>{formatObserved(album.period.observedMs)}</span>
            </div>
            <footer>
              <span>{dateLabel(album.period.latestPlayedAt ?? album.lifetime.latestPlayedAt)}</span>
              <SourceLink href={album.spotifyHref} onOpen={onOpenSpotify} compact />
            </footer>
          </article>
        ))}
      </div>
    </div>
  )
}

function ArtistsView({
  artists,
  selectedId,
  onSelect,
  onOpenSpotify,
}: {
  artists: MusicArtistSummary[]
  selectedId: string | null
  onSelect: (id: string) => void
  onOpenSpotify?: ((href: string) => void) | undefined
}) {
  if (artists.length === 0) {
    return <EmptyCollection icon={<UserRound />} title="No artists with verified identities" />
  }
  return (
    <div className="music-review-table-scroll">
      <div className="music-review-artist-table" role="table" aria-label="Artists">
        <div className="music-review-artist-head" role="row">
          <span role="columnheader">Artist</span>
          <span role="columnheader">Tracks heard</span>
          <span role="columnheader">Releases heard</span>
          <span role="columnheader">Playbacks</span>
          <span role="columnheader">Observed time</span>
          <span role="columnheader">Last played</span>
          <span role="columnheader" className="sr-only">
            Source
          </span>
        </div>
        {artists.map((artist) => (
          <div
            key={artist.id}
            className={joinClassNames(
              'music-review-artist-row',
              selectedId === artist.id && 'is-selected',
            )}
            role="row"
          >
            <button
              className="music-review-row-target"
              type="button"
              aria-label={`Inspect ${artistName(artist)}`}
              onClick={() => onSelect(artist.id)}
            />
            <span className="music-review-artist-identity" role="cell">
              <span className="music-review-artist-mark" aria-hidden="true">
                <UserRound />
              </span>
              <span>
                <strong>{artistName(artist)}</strong>
                {artist.catalogState !== 'current' && (
                  <small>{catalogLabels[artist.catalogState]}</small>
                )}
              </span>
            </span>
            <strong role="cell">{formatCount(artist.uniqueTracksHeard)}</strong>
            <span role="cell">{formatCount(artist.releasesHeard)}</span>
            <span role="cell">
              <strong>{formatCount(artist.period.qualifyingPlaybackCount)}</strong>
            </span>
            <span role="cell">
              <CountWithCoverage aggregate={artist.period} />
              <small className="music-review-observed-value">
                {formatObserved(artist.period.observedMs)} observed
              </small>
            </span>
            <span className="music-review-date-cell" role="cell">
              {dateLabel(artist.period.latestPlayedAt ?? artist.lifetime.latestPlayedAt)}
            </span>
            <span className="music-review-source-cell" role="cell">
              <SourceLink href={artist.spotifyHref} onOpen={onOpenSpotify} compact />
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function InspectorHeader({
  selected,
  onOpenSpotify,
}: {
  selected: SelectedEntity
  onOpenSpotify?: ((href: string) => void) | undefined
}) {
  const isTrack = selected.kind === 'track'
  const isAlbum = selected.kind === 'album'
  const title = isTrack
    ? trackTitle(selected.item)
    : isAlbum
      ? albumTitle(selected.item)
      : artistName(selected.item)
  const artwork = selected.item.artwork
  const artists = isTrack || isAlbum ? artistNames(selected.item.artists) : null
  const album = isTrack ? selected.item.album?.name : null
  return (
    <header className="music-review-inspector-header">
      {selected.kind !== 'artist' || artwork ? (
        <Artwork artwork={artwork} label={title} size="inspector" />
      ) : (
        <span className="music-review-artist-hero" aria-hidden="true">
          <UserRound />
        </span>
      )}
      <div>
        <h2>{title}</h2>
        {artists && <p>{artists}</p>}
        {album && <p>{album}</p>}
        <SourceLink href={selected.item.spotifyHref} onOpen={onOpenSpotify} />
      </div>
    </header>
  )
}

function EmptyCollection({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="music-review-empty">
      <span aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      <p>Adjust the search or clear filters to show more results.</p>
    </div>
  )
}
