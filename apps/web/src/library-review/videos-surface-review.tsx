import { useMemo, useState, type ReactNode } from 'react'
import {
  ArrowDownUp,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  ExternalLink,
  Grid2X2,
  Library,
  List,
  ListFilter,
  PlaySquare,
  Search,
  Tv,
  UserRound,
  X,
} from 'lucide-react'

import './videos-surface-review.css'

export type VideoReviewMode = 'archive' | 'queue' | 'channels'
export type VideoReviewLayout = 'list' | 'grid'
export type VideoInspectorTab = 'details' | 'history' | 'channel'
export type ChannelInspectorTab = 'details' | 'library'
export type VideoReviewAvailability = 'available' | 'unavailable' | 'unchecked' | 'stale' | 'error'
export type VideoReviewFormat = 'Live' | 'Upcoming' | 'Recorded live' | 'YouTube Music'

export type VideoReviewThumbnail = {
  src: string
  alt?: string
  attributionLabel?: string
}

export type VideoReviewLink = {
  label: string
  href: string
}

export type VideoReviewFact = {
  label: string
  value: string
  tone?: 'default' | 'muted' | 'warning'
}

export type VideoReviewChannelSummary = {
  id: string | null
  displayTitle: string | null
}

export type VideoReviewWatch = {
  id: string
  watchedLabel: string | null
  accountLabel: string
  matchesCurrentFilters?: boolean
  historicalTitle?: string | null
  historicalChannel?: string | null
  productLabel?: 'YouTube' | 'YouTube Music'
  sourceLink?: VideoReviewLink
  evidenceLabel?: string
}

export type VideoReviewQueueRelationship = {
  id: string
  accountLabel: string
  addedLabel: string | null
  sourceLabel?: string
  observedLabel?: string
}

export type VideoReviewFollowingRelationship = {
  id: string
  accountLabel: string
  source: 'Takeout' | 'OAuth'
  subscribedLabel: string | null
  observedLabel?: string
  freshnessLabel?: string
}

export type VideoReviewChannelLibraryItem = {
  id: string
  title: string | null
  thumbnail: VideoReviewThumbnail | null
  channelTitle?: string | null
  relationshipLabel: string | null
  durationLabel?: string | null
}

export type VideoReviewVideoInspector = {
  description?: string | null
  overviewFacts?: VideoReviewFact[]
  relationshipFacts?: VideoReviewFact[]
  availabilityFacts?: VideoReviewFact[]
  queueRelationships?: VideoReviewQueueRelationship[]
  sourceFacts?: VideoReviewFact[]
  links?: VideoReviewLink[]
  history?: VideoReviewWatch[]
  channel?: {
    description?: string | null
    followingAccountLabels?: string[]
    recentlyWatched?: VideoReviewChannelLibraryItem[]
    queued?: VideoReviewChannelLibraryItem[]
    links?: VideoReviewLink[]
  } | null
}

export type VideoReviewVideo = {
  id: string
  youtubeVideoId?: string | null
  displayTitle: string | null
  thumbnail: VideoReviewThumbnail | null
  channel: VideoReviewChannelSummary | null
  durationLabel?: string | null
  publishedLabel?: string | null
  formats?: VideoReviewFormat[]
  availability: {
    state: VideoReviewAvailability
    checkedLabel?: string | null
  }
  archive: {
    active: boolean
    lifetimeWatchCount: number
    matchingWatchCount?: number | null
    referenceWatchedLabel: string | null
    /** ISO/date-sortable value for the displayed reference occurrence. */
    referenceWatchedSortValue?: string | null
    activeConnectionCount?: number
  }
  queue: {
    active: boolean
    activeRelationshipCount: number
    referenceAddedLabel: string | null
    /** ISO/date-sortable value for the displayed reference Watch Later relationship. */
    referenceAddedSortValue?: string | null
    activeConnectionCount?: number
  }
  inspector?: VideoReviewVideoInspector
}

export type VideoReviewChannelInspector = {
  description?: string | null
  aboutFacts?: VideoReviewFact[]
  relationships?: VideoReviewFollowingRelationship[]
  sourceFacts?: VideoReviewFact[]
  links?: VideoReviewLink[]
  archiveVideos?: VideoReviewChannelLibraryItem[]
  queueVideos?: VideoReviewChannelLibraryItem[]
}

export type VideoReviewChannel = {
  id: string
  displayTitle: string | null
  thumbnail: VideoReviewThumbnail | null
  customUrl?: string | null
  following: {
    activeRelationshipCount: number
    knownSubscribedLabel: string | null
    activeConnectionLabels: string[]
  }
  library: {
    archiveVideoCount: number
    watchOccurrenceCount: number
    latestWatchedLabel?: string | null
    queueVideoCount: number
  }
  metadataAvailable?: boolean
  inspector?: VideoReviewChannelInspector
}

export type VideosSurfaceReviewProps = {
  videos: VideoReviewVideo[]
  channels: VideoReviewChannel[]
  counts: {
    archiveVideos: number
    archiveWatches: number
    queueVideos: number
    queueRelationships?: number
    channels: number
    followedChannels: number
    followingRelationships?: number
  }
  initialMode?: VideoReviewMode
  initialLayout?: VideoReviewLayout
  initialSelectedId?: string | null
  initialVideoInspectorTab?: VideoInspectorTab
  initialChannelInspectorTab?: ChannelInspectorTab
  filterSummary?: string[]
  sourceStatusLabel?: string
  className?: string
}

type SortValue =
  'relationship-desc' | 'relationship-asc' | 'title-asc' | 'channel-asc' | 'count-desc'

type Selection = { kind: 'video' | 'channel'; id: string }
type OverlapFilter = 'any' | 'yes' | 'no'
type WatchFilter = 'any' | 'once' | 'rewatched'
type FollowingFilter = 'any' | 'followed'

const modeLabels: Record<VideoReviewMode, string> = {
  archive: 'Archive',
  queue: 'Queue',
  channels: 'Channels',
}

const cx = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' ')

function videoTitle(video: Pick<VideoReviewVideo, 'displayTitle' | 'availability'>) {
  if (video.displayTitle?.trim()) return video.displayTitle.trim()
  return video.availability.state === 'unavailable' ? 'Unavailable video' : 'Untitled video'
}

function channelTitle(channel: Pick<VideoReviewChannel, 'displayTitle'>) {
  return channel.displayTitle?.trim() || 'Channel unavailable'
}

function safeHref(href: string) {
  try {
    const parsed = new URL(href)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : undefined
  } catch {
    return undefined
  }
}

function plural(value: number, singular: string, pluralNoun = `${singular}s`) {
  return `${value.toLocaleString()} ${value === 1 ? singular : pluralNoun}`
}

function VideoThumbnail({
  thumbnail,
  title,
  size,
  durationLabel,
  format,
}: {
  thumbnail: VideoReviewThumbnail | null
  title: string
  size: 'row' | 'card' | 'inspector' | 'mini'
  durationLabel?: string | null | undefined
  format?: VideoReviewFormat | undefined
}) {
  const [imageFailed, setImageFailed] = useState(false)
  return (
    <span className={`videos-review-thumbnail videos-review-thumbnail--${size}`}>
      {thumbnail && !imageFailed ? (
        <img
          src={thumbnail.src}
          alt={thumbnail.alt ?? `Thumbnail for ${title}`}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="videos-review-thumbnail-fallback" role="img" aria-label="No thumbnail">
          <PlaySquare aria-hidden="true" />
        </span>
      )}
      {durationLabel && <small className="videos-review-duration-overlay">{durationLabel}</small>}
      {format && format !== 'YouTube Music' && (
        <small className="videos-review-format-overlay">{format}</small>
      )}
      {thumbnail?.attributionLabel && size === 'inspector' && (
        <small className="videos-review-artwork-credit">{thumbnail.attributionLabel}</small>
      )}
    </span>
  )
}

function ChannelThumbnail({
  thumbnail,
  title,
  size,
}: {
  thumbnail: VideoReviewThumbnail | null
  title: string
  size: 'row' | 'inspector'
}) {
  const [imageFailed, setImageFailed] = useState(false)
  return (
    <span className={`videos-review-channel-art videos-review-channel-art--${size}`}>
      {thumbnail && !imageFailed ? (
        <img
          src={thumbnail.src}
          alt={thumbnail.alt ?? `Artwork for ${title}`}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span role="img" aria-label="No channel artwork">
          <UserRound aria-hidden="true" />
        </span>
      )}
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
      className="videos-review-icon-button"
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function Facts({ facts }: { facts?: VideoReviewFact[] | undefined }) {
  if (!facts?.length) return null
  return (
    <dl className="videos-review-facts">
      {facts.map((fact, index) => (
        <div key={`${fact.label}-${index}`} className={fact.tone ? `is-${fact.tone}` : undefined}>
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="videos-review-inspector-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function SourceLinks({ links }: { links?: VideoReviewLink[] | undefined }) {
  const safeLinks = links?.flatMap((link) => {
    const href = safeHref(link.href)
    return href ? [{ ...link, href }] : []
  })
  if (!safeLinks?.length) return null
  return (
    <div className="videos-review-source-links">
      {safeLinks.map((link) => (
        <a key={`${link.label}-${link.href}`} href={link.href} target="_blank" rel="noreferrer">
          {link.label}
          <ExternalLink aria-hidden="true" />
        </a>
      ))}
    </div>
  )
}

function watchCountLabel(video: VideoReviewVideo, filtered: boolean) {
  const lifetime = video.archive.lifetimeWatchCount
  const matching = video.archive.matchingWatchCount
  if (filtered && matching != null && matching !== lifetime)
    return `${matching} of ${lifetime} watches`
  return plural(lifetime, 'watch')
}

function relationshipLabel(video: VideoReviewVideo, mode: VideoReviewMode) {
  if (mode === 'archive') return video.archive.referenceWatchedLabel ?? 'Watch date unavailable'
  return video.queue.referenceAddedLabel ?? 'Added date unavailable'
}

function VideoList({
  videos,
  mode,
  selectedId,
  filtered,
  onSelect,
}: {
  videos: VideoReviewVideo[]
  mode: Exclude<VideoReviewMode, 'channels'>
  selectedId?: string | undefined
  filtered: boolean
  onSelect: (id: string) => void
}) {
  return (
    <div className="videos-review-list" role="list">
      <div className={`videos-review-list-head is-${mode}`} aria-hidden="true">
        <span>Video</span>
        <span>Channel</span>
        <span>Duration</span>
        <span>Published</span>
        <span>{mode === 'archive' ? 'Last watched' : 'Added'}</span>
        <span>{mode === 'archive' ? 'Watches' : 'Accounts'}</span>
        <span>{mode === 'archive' ? 'Queue' : 'Archive'}</span>
      </div>
      {videos.map((video) => {
        const title = videoTitle(video)
        const accountCount =
          video.queue.activeConnectionCount ?? video.queue.activeRelationshipCount
        return (
          <button
            key={video.id}
            type="button"
            role="listitem"
            className={cx(
              'videos-review-list-row',
              `is-${mode}`,
              selectedId === video.id && 'is-selected',
            )}
            aria-pressed={selectedId === video.id}
            onClick={() => onSelect(video.id)}
          >
            <span className="videos-review-video-cell">
              <VideoThumbnail
                thumbnail={video.thumbnail}
                title={title}
                size="row"
                format={video.formats?.[0]}
              />
              <span className="videos-review-video-copy">
                <strong title={title}>{title}</strong>
                <small className="videos-review-mobile-channel">
                  {video.channel?.displayTitle || 'Channel unavailable'}
                </small>
                <small className="videos-review-mobile-metadata">
                  {video.durationLabel || 'Duration unavailable'}
                  <span aria-hidden="true"> · </span>
                  {video.publishedLabel || 'Publication date unavailable'}
                </small>
                {video.availability.state === 'unavailable' && (
                  <em>
                    <CircleAlert aria-hidden="true" /> Unavailable
                  </em>
                )}
              </span>
            </span>
            <span className="videos-review-cell-muted">
              {video.channel?.displayTitle || 'Channel unavailable'}
            </span>
            <span className="videos-review-cell-muted">{video.durationLabel || '—'}</span>
            <span className="videos-review-cell-muted">{video.publishedLabel || '—'}</span>
            <span className="videos-review-relationship-date">
              {relationshipLabel(video, mode)}
            </span>
            <span className="videos-review-cell-count">
              {mode === 'archive'
                ? watchCountLabel(video, filtered)
                : plural(accountCount, 'account')}
            </span>
            <span className="videos-review-overlap">
              {mode === 'archive'
                ? video.queue.active
                  ? 'Queued'
                  : '—'
                : video.archive.active
                  ? plural(video.archive.lifetimeWatchCount, 'watch')
                  : '—'}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function VideoGrid({
  videos,
  mode,
  selectedId,
  filtered,
  onSelect,
}: {
  videos: VideoReviewVideo[]
  mode: Exclude<VideoReviewMode, 'channels'>
  selectedId?: string | undefined
  filtered: boolean
  onSelect: (id: string) => void
}) {
  return (
    <div className="videos-review-grid">
      {videos.map((video) => {
        const title = videoTitle(video)
        const accountCount =
          video.queue.activeConnectionCount ?? video.queue.activeRelationshipCount
        const secondaryLine =
          mode === 'archive'
            ? [
                video.archive.lifetimeWatchCount > 1 ? watchCountLabel(video, filtered) : null,
                video.queue.active ? 'In Queue' : null,
              ]
                .filter(Boolean)
                .join(' · ')
            : [
                accountCount > 1 ? plural(accountCount, 'account') : null,
                video.archive.active
                  ? `Also in Archive · ${plural(video.archive.lifetimeWatchCount, 'watch')}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')
        return (
          <button
            key={video.id}
            type="button"
            className={cx('videos-review-grid-card', selectedId === video.id && 'is-selected')}
            aria-pressed={selectedId === video.id}
            onClick={() => onSelect(video.id)}
          >
            <VideoThumbnail
              thumbnail={video.thumbnail}
              title={title}
              size="card"
              durationLabel={video.durationLabel}
              format={video.formats?.[0]}
            />
            <span className="videos-review-grid-copy">
              <strong title={title}>{title}</strong>
              <span>{video.channel?.displayTitle || 'Channel unavailable'}</span>
              <small>{relationshipLabel(video, mode)}</small>
              {secondaryLine && <em>{secondaryLine}</em>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function ChannelList({
  channels,
  selectedId,
  onSelect,
}: {
  channels: VideoReviewChannel[]
  selectedId?: string | undefined
  onSelect: (id: string) => void
}) {
  return (
    <div className="videos-review-following" role="list">
      <div className="videos-review-following-head" aria-hidden="true">
        <span>Channel</span>
        <span>Videos watched</span>
        <span>Your views</span>
        <span>Last watched</span>
        <span>Queue</span>
      </div>
      {channels.map((channel) => {
        const title = channelTitle(channel)
        return (
          <button
            key={channel.id}
            type="button"
            role="listitem"
            className={cx(
              'videos-review-following-row',
              selectedId === channel.id && 'is-selected',
            )}
            aria-pressed={selectedId === channel.id}
            onClick={() => onSelect(channel.id)}
          >
            <span className="videos-review-channel-cell">
              <ChannelThumbnail thumbnail={channel.thumbnail} title={title} size="row" />
              <span>
                <strong title={title}>{title}</strong>
                {channel.customUrl && <small>{channel.customUrl}</small>}
                {channel.following.activeRelationshipCount > 0 && <em>Following</em>}
                {channel.metadataAvailable === false && <em>Metadata unavailable</em>}
              </span>
            </span>
            <span>{plural(channel.library.archiveVideoCount, 'video')}</span>
            <span>{plural(channel.library.watchOccurrenceCount, 'view')}</span>
            <span>{channel.library.latestWatchedLabel ?? 'Date unavailable'}</span>
            <span>{plural(channel.library.queueVideoCount, 'video')}</span>
          </button>
        )
      })}
    </div>
  )
}

function ChannelLibraryRows({ items }: { items?: VideoReviewChannelLibraryItem[] | undefined }) {
  if (!items?.length) return <p className="videos-review-empty-small">No Library videos.</p>
  return (
    <div className="videos-review-channel-library-list">
      {items.map((item) => {
        const title = item.title?.trim() || 'Untitled video'
        return (
          <div key={item.id}>
            <VideoThumbnail thumbnail={item.thumbnail} title={title} size="mini" />
            <span>
              <strong>{title}</strong>
              <small>{item.relationshipLabel ?? 'Date unavailable'}</small>
            </span>
          </div>
        )
      })}
    </div>
  )
}

function VideoInspector({
  video,
  tab,
  onTabChange,
  onClose,
}: {
  video: VideoReviewVideo
  tab: VideoInspectorTab
  onTabChange: (tab: VideoInspectorTab) => void
  onClose: () => void
}) {
  const title = videoTitle(video)
  const inspector = video.inspector
  const history = inspector?.history ?? []
  const hasChannelIdentity = Boolean(video.channel?.id)
  return (
    <aside className="videos-review-inspector" aria-label={`Details for ${title}`}>
      <div className="videos-review-inspector-topbar">
        <span>Video</span>
        <IconButton label="Close inspector" onClick={onClose}>
          <X aria-hidden="true" />
        </IconButton>
      </div>
      <div className="videos-review-video-header">
        <VideoThumbnail
          thumbnail={video.thumbnail}
          title={title}
          size="inspector"
          durationLabel={video.durationLabel}
          format={video.formats?.[0]}
        />
        <h2>{title}</h2>
        <p>{video.channel?.displayTitle || 'Channel unavailable'}</p>
        <div className="videos-review-header-meta">
          {video.durationLabel && <span>{video.durationLabel}</span>}
          {video.publishedLabel && <span>{video.publishedLabel}</span>}
          {video.availability.state === 'unavailable' && <span>Unavailable</span>}
        </div>
        <div className="videos-review-memberships">
          {video.archive.active && <span>Archive</span>}
          {video.queue.active && <span>Queue</span>}
        </div>
      </div>
      <div className="videos-review-inspector-tabs" role="tablist" aria-label="Video details">
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
          History <span>{video.archive.lifetimeWatchCount}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'channel'}
          aria-disabled={!hasChannelIdentity}
          disabled={!hasChannelIdentity}
          title={hasChannelIdentity ? 'Channel' : 'Channel identity unavailable'}
          className={tab === 'channel' ? 'is-active' : undefined}
          onClick={() => onTabChange('channel')}
        >
          Channel
        </button>
      </div>
      <div className="videos-review-inspector-scroll">
        {tab === 'details' && (
          <>
            {(inspector?.description || inspector?.overviewFacts?.length) && (
              <InspectorSection title="Overview">
                {inspector.description && <p>{inspector.description}</p>}
                <Facts facts={inspector.overviewFacts} />
              </InspectorSection>
            )}
            <InspectorSection title="Your relationship">
              <div className="videos-review-relationship-summary">
                {video.archive.active && (
                  <div>
                    <Library aria-hidden="true" />
                    <span>
                      <strong>{plural(video.archive.lifetimeWatchCount, 'watch')}</strong>
                      <small>
                        {video.archive.referenceWatchedLabel ?? 'Watch date unavailable'}
                      </small>
                    </span>
                  </div>
                )}
                {video.queue.active && (
                  <div>
                    <Clock3 aria-hidden="true" />
                    <span>
                      <strong>In Watch Later</strong>
                      <small>{video.queue.referenceAddedLabel ?? 'Added date unavailable'}</small>
                    </span>
                  </div>
                )}
              </div>
              {inspector?.queueRelationships?.map((relationship) => (
                <div className="videos-review-queue-relationship" key={relationship.id}>
                  <strong>{relationship.accountLabel}</strong>
                  <span>{relationship.addedLabel ?? 'Added date unavailable'}</span>
                </div>
              ))}
              <Facts facts={inspector?.relationshipFacts} />
            </InspectorSection>
            {(video.availability.state !== 'available' || inspector?.availabilityFacts?.length) && (
              <InspectorSection title="Availability">
                {video.availability.state === 'unavailable' && (
                  <p className="videos-review-warning">
                    Unavailable on YouTube
                    {video.availability.checkedLabel
                      ? ` when checked ${video.availability.checkedLabel}`
                      : ''}
                    .
                  </p>
                )}
                {video.availability.state !== 'unavailable' &&
                  video.availability.state !== 'available' && (
                    <p>Metadata {video.availability.state}.</p>
                  )}
                <Facts facts={inspector?.availabilityFacts} />
              </InspectorSection>
            )}
            {(inspector?.links?.length || inspector?.sourceFacts?.length) && (
              <InspectorSection title="Sources">
                <SourceLinks links={inspector.links} />
                <Facts facts={inspector.sourceFacts} />
              </InspectorSection>
            )}
          </>
        )}
        {tab === 'history' && (
          <div className="videos-review-history">
            {history.length ? (
              history.map((entry) => (
                <article key={entry.id}>
                  <div className="videos-review-history-marker">
                    <Check aria-hidden="true" />
                  </div>
                  <div>
                    <div className="videos-review-history-title">
                      <strong>{entry.watchedLabel ?? 'Watch date unavailable'}</strong>
                      {entry.matchesCurrentFilters && <span>Matches filter</span>}
                    </div>
                    <p>{entry.accountLabel}</p>
                    {entry.historicalTitle && entry.historicalTitle !== title && (
                      <small>Recorded as {entry.historicalTitle}</small>
                    )}
                    {entry.historicalChannel &&
                      entry.historicalChannel !== video.channel?.displayTitle && (
                        <small>Channel recorded as {entry.historicalChannel}</small>
                      )}
                    {entry.productLabel === 'YouTube Music' && <small>YouTube Music</small>}
                    <SourceLinks links={entry.sourceLink ? [entry.sourceLink] : undefined} />
                    {entry.evidenceLabel && <small>{entry.evidenceLabel}</small>}
                  </div>
                </article>
              ))
            ) : (
              <p className="videos-review-empty-small">No supported watch history.</p>
            )}
          </div>
        )}
        {tab === 'channel' && hasChannelIdentity && (
          <>
            {inspector?.channel?.description && (
              <InspectorSection title={video.channel?.displayTitle || 'Channel'}>
                <p>{inspector.channel.description}</p>
                <SourceLinks links={inspector.channel.links} />
              </InspectorSection>
            )}
            {inspector?.channel?.followingAccountLabels?.length ? (
              <InspectorSection title="Following">
                <p>{inspector.channel.followingAccountLabels.join(' · ')}</p>
              </InspectorSection>
            ) : null}
            <InspectorSection title="Recently watched">
              <ChannelLibraryRows items={inspector?.channel?.recentlyWatched} />
            </InspectorSection>
            <InspectorSection title="Watch Later">
              <ChannelLibraryRows items={inspector?.channel?.queued} />
            </InspectorSection>
          </>
        )}
      </div>
    </aside>
  )
}

function ChannelInspector({
  channel,
  tab,
  onTabChange,
  onClose,
}: {
  channel: VideoReviewChannel
  tab: ChannelInspectorTab
  onTabChange: (tab: ChannelInspectorTab) => void
  onClose: () => void
}) {
  const title = channelTitle(channel)
  const [membership, setMembership] = useState<'archive' | 'queue'>('archive')
  const inspector = channel.inspector
  return (
    <aside className="videos-review-inspector" aria-label={`Details for ${title}`}>
      <div className="videos-review-inspector-topbar">
        <span>Channel</span>
        <IconButton label="Close inspector" onClick={onClose}>
          <X aria-hidden="true" />
        </IconButton>
      </div>
      <div className="videos-review-channel-header">
        <ChannelThumbnail thumbnail={channel.thumbnail} title={title} size="inspector" />
        <div>
          <h2>{title}</h2>
          {channel.customUrl && <p>{channel.customUrl}</p>}
          {channel.following.activeRelationshipCount > 0 && <span>Following</span>}
        </div>
        <dl>
          <div>
            <dt>Watched</dt>
            <dd>{plural(channel.library.archiveVideoCount, 'video')}</dd>
          </div>
          <div>
            <dt>Watches</dt>
            <dd>{channel.library.watchOccurrenceCount.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Queue</dt>
            <dd>{channel.library.queueVideoCount.toLocaleString()}</dd>
          </div>
        </dl>
      </div>
      <div className="videos-review-inspector-tabs" role="tablist" aria-label="Channel details">
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
          aria-selected={tab === 'library'}
          className={tab === 'library' ? 'is-active' : undefined}
          onClick={() => onTabChange('library')}
        >
          Library
        </button>
      </div>
      <div className="videos-review-inspector-scroll">
        {tab === 'details' ? (
          <>
            {(inspector?.description || inspector?.aboutFacts?.length) && (
              <InspectorSection title="About">
                {inspector.description && <p>{inspector.description}</p>}
                <Facts facts={inspector.aboutFacts} />
              </InspectorSection>
            )}
            {channel.following.activeRelationshipCount > 0 && (
              <InspectorSection title="Following">
                {inspector?.relationships?.length ? (
                  <div className="videos-review-subscriptions">
                    {inspector.relationships.map((relationship) => (
                      <div key={relationship.id}>
                        <strong>{relationship.accountLabel}</strong>
                        <span>{relationship.subscribedLabel ?? 'Date unavailable'}</span>
                        <small>
                          {relationship.source}
                          {relationship.freshnessLabel ? ` · ${relationship.freshnessLabel}` : ''}
                        </small>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>{plural(channel.following.activeRelationshipCount, 'active relationship')}</p>
                )}
              </InspectorSection>
            )}
            {(inspector?.links?.length || inspector?.sourceFacts?.length) && (
              <InspectorSection title="Sources">
                <SourceLinks links={inspector.links} />
                <Facts facts={inspector.sourceFacts} />
              </InspectorSection>
            )}
          </>
        ) : (
          <>
            <div
              className="videos-review-library-switch"
              role="group"
              aria-label="Library membership"
            >
              <button
                type="button"
                className={membership === 'archive' ? 'is-active' : undefined}
                onClick={() => setMembership('archive')}
              >
                Archive {channel.library.archiveVideoCount}
              </button>
              <button
                type="button"
                className={membership === 'queue' ? 'is-active' : undefined}
                onClick={() => setMembership('queue')}
              >
                Queue {channel.library.queueVideoCount}
              </button>
            </div>
            <ChannelLibraryRows
              items={membership === 'archive' ? inspector?.archiveVideos : inspector?.queueVideos}
            />
          </>
        )}
      </div>
    </aside>
  )
}

export function VideosSurfaceReview({
  videos,
  channels,
  counts,
  initialMode = 'archive',
  initialLayout = 'list',
  initialSelectedId = null,
  initialVideoInspectorTab = 'details',
  initialChannelInspectorTab = 'details',
  filterSummary = [],
  sourceStatusLabel,
  className,
}: VideosSurfaceReviewProps) {
  const [mode, setMode] = useState<VideoReviewMode>(initialMode)
  const [layout, setLayout] = useState<VideoReviewLayout>(initialLayout)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortValue>(
    initialMode === 'channels' ? 'count-desc' : 'relationship-desc',
  )
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [watchFilter, setWatchFilter] = useState<WatchFilter>('any')
  const [overlapFilter, setOverlapFilter] = useState<OverlapFilter>('any')
  const [followingFilter, setFollowingFilter] = useState<FollowingFilter>('any')
  const [selection, setSelection] = useState<Selection | null | undefined>(
    initialSelectedId
      ? { kind: initialMode === 'channels' ? 'channel' : 'video', id: initialSelectedId }
      : undefined,
  )
  const [videoInspectorTab, setVideoInspectorTab] =
    useState<VideoInspectorTab>(initialVideoInspectorTab)
  const [channelInspectorTab, setChannelInspectorTab] = useState<ChannelInspectorTab>(
    initialChannelInspectorTab,
  )

  const collectionVideos = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    const matching = videos.filter((video) => {
      if (mode === 'channels') return false
      if (mode === 'archive' && !video.archive.active) return false
      if (mode === 'queue' && !video.queue.active) return false
      if (
        normalizedQuery &&
        ![video.displayTitle, video.channel?.displayTitle, video.youtubeVideoId]
          .filter(Boolean)
          .some((value) => value!.toLocaleLowerCase().includes(normalizedQuery))
      )
        return false
      if (mode === 'archive' && watchFilter !== 'any') {
        const rewatched = video.archive.lifetimeWatchCount > 1
        if (watchFilter === 'once' ? rewatched : !rewatched) return false
      }
      if (overlapFilter !== 'any') {
        const overlaps = mode === 'archive' ? video.queue.active : video.archive.active
        if ((overlapFilter === 'yes') !== overlaps) return false
      }
      return true
    })

    return [...matching].sort((a, b) => {
      if (sort === 'title-asc') return videoTitle(a).localeCompare(videoTitle(b))
      if (sort === 'channel-asc')
        return (a.channel?.displayTitle || '').localeCompare(b.channel?.displayTitle || '')
      if (sort === 'count-desc')
        return mode === 'archive'
          ? b.archive.lifetimeWatchCount - a.archive.lifetimeWatchCount
          : b.queue.activeRelationshipCount - a.queue.activeRelationshipCount
      const aLabel =
        mode === 'archive' ? a.archive.referenceWatchedSortValue : a.queue.referenceAddedSortValue
      const bLabel =
        mode === 'archive' ? b.archive.referenceWatchedSortValue : b.queue.referenceAddedSortValue
      if (!aLabel && !bLabel) return videos.indexOf(a) - videos.indexOf(b)
      const comparison = (aLabel || '').localeCompare(bLabel || '')
      return sort === 'relationship-asc' ? comparison : -comparison
    })
  }, [mode, overlapFilter, query, sort, videos, watchFilter])

  const collectionChannels = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    const matching = channels.filter((channel) => {
      if (
        normalizedQuery &&
        ![channel.displayTitle, channel.customUrl, channel.id]
          .filter(Boolean)
          .some((value) => value!.toLocaleLowerCase().includes(normalizedQuery))
      )
        return false
      if (followingFilter === 'followed' && channel.following.activeRelationshipCount === 0)
        return false
      return true
    })
    return [...matching].sort((a, b) => {
      if (sort === 'count-desc')
        return b.library.watchOccurrenceCount - a.library.watchOccurrenceCount
      return channelTitle(a).localeCompare(channelTitle(b))
    })
  }, [channels, followingFilter, query, sort])

  const effectiveSelection = useMemo<Selection | null>(() => {
    if (selection === null) return null
    const expectedKind = mode === 'channels' ? 'channel' : 'video'
    if (selection?.kind === expectedKind) {
      const remainsVisible =
        selection.kind === 'channel'
          ? collectionChannels.some((channel) => channel.id === selection.id)
          : collectionVideos.some((video) => video.id === selection.id)
      if (remainsVisible) return selection
      if (selection !== undefined) return null
    }
    const firstId = mode === 'channels' ? collectionChannels[0]?.id : collectionVideos[0]?.id
    return firstId ? { kind: expectedKind, id: firstId } : null
  }, [collectionChannels, collectionVideos, mode, selection])

  const selectedVideo =
    effectiveSelection?.kind === 'video'
      ? videos.find((video) => video.id === effectiveSelection.id)
      : undefined
  const selectedChannel =
    effectiveSelection?.kind === 'channel'
      ? channels.find((channel) => channel.id === effectiveSelection.id)
      : undefined
  const activeFilterCount =
    filterSummary.length +
    (mode === 'channels'
      ? followingFilter === 'any'
        ? 0
        : 1
      : (watchFilter === 'any' || mode === 'queue' ? 0 : 1) + (overlapFilter === 'any' ? 0 : 1))
  const filteredByOccurrence =
    mode === 'archive' && (watchFilter !== 'any' || filterSummary.length > 0)

  const headerCount =
    mode === 'archive'
      ? `${plural(counts.archiveVideos, 'video')} · ${plural(counts.archiveWatches, 'watch')}`
      : mode === 'queue'
        ? plural(counts.queueVideos, 'video')
        : `${plural(counts.channels, 'channel')} · ${plural(counts.followedChannels, 'followed channel')}`

  const selectMode = (next: VideoReviewMode) => {
    setMode(next)
    setQuery('')
    setSort(next === 'channels' ? 'count-desc' : 'relationship-desc')
    setFiltersOpen(false)
    setSelection(undefined)
    setVideoInspectorTab('details')
    setChannelInspectorTab('details')
  }

  return (
    <div className={cx('videos-review', className)}>
      <header className="videos-review-header">
        <div>
          <p>Library</p>
          <h1>Videos</h1>
        </div>
        {sourceStatusLabel && <span>{sourceStatusLabel}</span>}
      </header>
      <nav className="videos-review-mode-tabs" aria-label="Video collection">
        {(Object.keys(modeLabels) as VideoReviewMode[]).map((value) => {
          const count =
            value === 'archive'
              ? counts.archiveVideos
              : value === 'queue'
                ? counts.queueVideos
                : counts.channels
          return (
            <button
              key={value}
              type="button"
              className={mode === value ? 'is-active' : undefined}
              aria-current={mode === value ? 'page' : undefined}
              onClick={() => selectMode(value)}
            >
              {modeLabels[value]} <span>{count.toLocaleString()}</span>
            </button>
          )
        })}
      </nav>
      <div className="videos-review-body">
        <section className="videos-review-collection" aria-label={`${modeLabels[mode]} videos`}>
          <div className="videos-review-toolbar">
            <label className="videos-review-search">
              <Search aria-hidden="true" />
              <span className="sr-only">
                {mode === 'channels' ? 'Search channels' : 'Search videos or channels'}
              </span>
              <input
                value={query}
                placeholder={mode === 'channels' ? 'Search channels' : 'Search videos or channels'}
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
              className={cx('videos-review-filter-button', filtersOpen && 'is-active')}
              onClick={() => setFiltersOpen((value) => !value)}
            >
              <ListFilter aria-hidden="true" /> Filters
              {activeFilterCount > 0 && <span>{activeFilterCount}</span>}
            </button>
            <label className="videos-review-sort">
              <ArrowDownUp aria-hidden="true" />
              <span className="sr-only">Sort</span>
              <select value={sort} onChange={(event) => setSort(event.target.value as SortValue)}>
                {mode !== 'channels' && (
                  <>
                    <option value="relationship-desc">
                      {mode === 'archive' ? 'Recently watched' : 'Recently added'}
                    </option>
                    <option value="relationship-asc">
                      {mode === 'archive' ? 'Oldest watched' : 'Oldest added'}
                    </option>
                  </>
                )}
                <option value="title-asc">
                  {mode === 'channels' ? 'Channel A–Z' : 'Title A–Z'}
                </option>
                {mode !== 'channels' && <option value="channel-asc">Channel A–Z</option>}
                <option value="count-desc">
                  {mode === 'queue'
                    ? 'Most accounts'
                    : mode === 'channels'
                      ? 'Most viewed'
                      : 'Most watched'}
                </option>
              </select>
              <ChevronDown aria-hidden="true" />
            </label>
            {mode !== 'channels' && (
              <div className="videos-review-layout" role="group" aria-label="View">
                <IconButton
                  label="List view"
                  pressed={layout === 'list'}
                  onClick={() => setLayout('list')}
                >
                  <List aria-hidden="true" />
                </IconButton>
                <IconButton
                  label="Grid view"
                  pressed={layout === 'grid'}
                  onClick={() => setLayout('grid')}
                >
                  <Grid2X2 aria-hidden="true" />
                </IconButton>
              </div>
            )}
          </div>
          {filtersOpen && (
            <div className="videos-review-filter-tray">
              {filterSummary.map((filter) => (
                <span key={filter}>{filter}</span>
              ))}
              {mode === 'archive' && (
                <label>
                  Watches
                  <select
                    value={watchFilter}
                    onChange={(event) => setWatchFilter(event.target.value as WatchFilter)}
                  >
                    <option value="any">Any</option>
                    <option value="once">Watched once</option>
                    <option value="rewatched">Rewatched</option>
                  </select>
                </label>
              )}
              {mode !== 'channels' ? (
                <label>
                  {mode === 'archive' ? 'Queue status' : 'Archive status'}
                  <select
                    value={overlapFilter}
                    onChange={(event) => setOverlapFilter(event.target.value as OverlapFilter)}
                  >
                    <option value="any">Any</option>
                    <option value="yes">Included</option>
                    <option value="no">Not included</option>
                  </select>
                </label>
              ) : (
                <label>
                  Following
                  <select
                    value={followingFilter}
                    onChange={(event) => setFollowingFilter(event.target.value as FollowingFilter)}
                  >
                    <option value="any">All channels</option>
                    <option value="followed">Following only</option>
                  </select>
                </label>
              )}
            </div>
          )}
          <div className="videos-review-results-meta">
            <strong>{headerCount}</strong>
            <span>
              Showing {mode === 'channels' ? collectionChannels.length : collectionVideos.length} of{' '}
              {mode === 'channels'
                ? counts.channels.toLocaleString()
                : mode === 'archive'
                  ? counts.archiveVideos.toLocaleString()
                  : counts.queueVideos.toLocaleString()}
            </span>
          </div>
          <div className="videos-review-scroll">
            {mode === 'channels' ? (
              collectionChannels.length ? (
                <ChannelList
                  channels={collectionChannels}
                  selectedId={
                    effectiveSelection?.kind === 'channel' ? effectiveSelection.id : undefined
                  }
                  onSelect={(id) => {
                    setSelection({ kind: 'channel', id })
                    setChannelInspectorTab('details')
                  }}
                />
              ) : (
                <div className="videos-review-empty">
                  <Tv aria-hidden="true" />
                  <strong>
                    {query || activeFilterCount ? 'No matching channels' : 'No channels yet'}
                  </strong>
                  <p>Channels appear after video activity is imported.</p>
                </div>
              )
            ) : collectionVideos.length ? (
              layout === 'list' ? (
                <VideoList
                  videos={collectionVideos}
                  mode={mode}
                  selectedId={
                    effectiveSelection?.kind === 'video' ? effectiveSelection.id : undefined
                  }
                  filtered={filteredByOccurrence}
                  onSelect={(id) => {
                    setSelection({ kind: 'video', id })
                    setVideoInspectorTab('details')
                  }}
                />
              ) : (
                <VideoGrid
                  videos={collectionVideos}
                  mode={mode}
                  selectedId={
                    effectiveSelection?.kind === 'video' ? effectiveSelection.id : undefined
                  }
                  filtered={filteredByOccurrence}
                  onSelect={(id) => {
                    setSelection({ kind: 'video', id })
                    setVideoInspectorTab('details')
                  }}
                />
              )
            ) : (
              <div className="videos-review-empty">
                <PlaySquare aria-hidden="true" />
                <strong>
                  {query || activeFilterCount
                    ? 'No matching videos'
                    : `No videos in ${modeLabels[mode]}`}
                </strong>
                <p>
                  {mode === 'archive'
                    ? 'Archive comes from imported YouTube watch history.'
                    : 'Queue comes from a complete Watch Later import.'}
                </p>
              </div>
            )}
          </div>
        </section>
        {selectedVideo && (
          <VideoInspector
            video={selectedVideo}
            tab={videoInspectorTab}
            onTabChange={setVideoInspectorTab}
            onClose={() => setSelection(null)}
          />
        )}
        {selectedChannel && (
          <ChannelInspector
            channel={selectedChannel}
            tab={channelInspectorTab}
            onTabChange={setChannelInspectorTab}
            onClose={() => setSelection(null)}
          />
        )}
      </div>
    </div>
  )
}
