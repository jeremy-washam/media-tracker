import type {
  ArticleInspectorData,
  ArticleRowData,
  ArticleSection,
  ArticleSubtype,
  ArticlesSurfaceData,
} from './articles-surface'
import type {
  BooksReviewBook,
  BooksReviewHistoryEntry,
  BooksSurfaceReviewProps,
} from './books-surface-review'
import type {
  MoviesReviewMovie,
  MoviesReviewViewing,
  MoviesSurfaceReviewProps,
} from './movies-surface-review'
import type {
  MusicAggregate,
  MusicAlbumSummary,
  MusicArtistSummary,
  MusicSurfaceData,
  MusicTrackSummary,
} from './music-surface-review'
import type {
  PodcastEpisodeInspector,
  PodcastEpisodeRow,
  PodcastInspector,
  PodcastsSurfaceReviewProps,
  PodcastShowInspector,
  PodcastShowRow,
} from './podcasts-surface-review'
import type {
  VideoReviewChannel,
  VideoReviewVideo,
  VideoReviewWatch,
  VideosSurfaceReviewProps,
} from './videos-surface-review'

export type MediaKey = 'books' | 'movies' | 'articles' | 'podcasts' | 'videos' | 'music'

export type SectionMap = Record<string, unknown[]>
export type ReviewLibrary = Partial<Record<MediaKey, SectionMap>>
export type ReviewFixture = {
  generatedAt?: string
  library?: ReviewLibrary
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function valueAt(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (value !== undefined && value !== null) return value
  }
  return undefined
}

function textAt(record: Record<string, unknown>, ...keys: string[]) {
  const value = valueAt(record, ...keys)
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberAt(record: Record<string, unknown>, ...keys: string[]) {
  const value = valueAt(record, ...keys)
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function booleanAt(record: Record<string, unknown>, ...keys: string[]) {
  const value = valueAt(record, ...keys)
  return typeof value === 'boolean' ? value : undefined
}

function recordAt(record: Record<string, unknown>, ...keys: string[]) {
  const value = valueAt(record, ...keys)
  return isRecord(value) ? value : undefined
}

function recordsAt(record: Record<string, unknown>, ...keys: string[]) {
  const value = valueAt(record, ...keys)
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function stringsAt(record: Record<string, unknown>, ...keys: string[]) {
  const value = valueAt(record, ...keys)
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item === 'string' && item.trim()) return [item.trim()]
    if (isRecord(item)) {
      const name = textAt(item, 'name', 'label', 'title')
      return name ? [name] : []
    }
    return []
  })
}

function idOf(record: Record<string, unknown>, fallback: string) {
  return textAt(record, 'id', 'mediaItemId', 'externalId', 'uri') ?? fallback
}

function formatDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const beforeCommonEra = value.match(/^(\d{1,4})-\d{2}-\d{2}\s+BC$/i)
  if (beforeCommonEra) return `${Number(beforeCommonEra[1])} BC`
  const parsed = new Date(value)
  if (Number.isNaN(parsed.valueOf())) return value
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed)
}

function dateFrom(record: Record<string, unknown>, ...keys: string[]) {
  const direct = valueAt(record, ...keys)
  if (typeof direct === 'string' && direct.trim()) return direct
  if (isRecord(direct)) {
    const value = textAt(direct, 'value', 'iso', 'label')
    if (value) return value
  }
  const dates = recordAt(record, 'dates')
  if (!dates) return undefined
  const nested = valueAt(dates, ...keys)
  if (typeof nested === 'string' && nested.trim()) return nested
  return isRecord(nested) ? textAt(nested, 'value', 'iso', 'label') : undefined
}

function ratingValue(record: Record<string, unknown>) {
  const direct = numberAt(record, 'rating', 'personalRating')
  if (direct !== undefined) return direct
  const rating = recordAt(record, 'rating', 'personalRating')
  return rating ? numberAt(rating, 'value') : undefined
}

function membershipsOf(record: Record<string, unknown>) {
  return recordAt(record, 'memberships', 'membership') ?? {}
}

function occurrencesOf(record: Record<string, unknown>) {
  return recordsAt(record, 'occurrences', 'history')
}

export function parseFixture(value: unknown): ReviewFixture {
  if (!isRecord(value) || !isRecord(value.library)) return {}
  const library: ReviewLibrary = {}
  const keys: MediaKey[] = ['books', 'movies', 'articles', 'podcasts', 'videos', 'music']
  for (const key of keys) {
    const candidate = value.library[key]
    if (!isRecord(candidate)) continue
    const sections: SectionMap = {}
    for (const [section, items] of Object.entries(candidate)) {
      if (Array.isArray(items)) sections[section] = items
    }
    library[key] = sections
  }
  return {
    ...(typeof value.generatedAt === 'string' ? { generatedAt: value.generatedAt } : {}),
    library,
  }
}

export function itemCount(fixture: ReviewFixture, media: MediaKey) {
  const sections = fixture.library?.[media]
  if (!sections) return 0
  const ids = new Set<string>()
  let anonymousCount = 0
  for (const items of Object.values(sections)) {
    for (const item of items) {
      if (!isRecord(item)) {
        anonymousCount += 1
        continue
      }
      const id = textAt(item, 'id', 'mediaItemId', 'externalId', 'uri')
      if (id) ids.add(id)
      else anonymousCount += 1
    }
  }
  return ids.size + anonymousCount
}

function bookHistory(record: Record<string, unknown>, prefix: string): BooksReviewHistoryEntry[] {
  return occurrencesOf(record).map((occurrence, index) => {
    const date = dateFrom(occurrence, 'consumedAt', 'finishedAt', 'readAt', 'date', 'occurredAt')
    const dateLabel = formatDate(date)
    const detail = textAt(occurrence, 'detail', 'note', 'review')
    const matchesFilters = booleanAt(occurrence, 'matchesFilters')
    const kind = textAt(occurrence, 'kind', 'type')
    const normalizedKind: BooksReviewHistoryEntry['kind'] =
      kind === 'rating' || kind === 'review' || kind === 'added' || kind === 'reading'
        ? kind
        : 'read'
    return {
      id: idOf(occurrence, `${prefix}-history-${index}`),
      kind: normalizedKind,
      label:
        textAt(occurrence, 'label', 'title') ?? (normalizedKind === 'read' ? 'Read' : 'Activity'),
      ...(dateLabel ? { dateLabel } : {}),
      ...(detail ? { detail } : {}),
      ...(matchesFilters !== undefined ? { matchesFilters } : {}),
    }
  })
}

function mapBook(record: Record<string, unknown>, index: number, section: 'archive' | 'queue') {
  const id = idOf(record, `book-${section}-${index}`)
  const memberships = membershipsOf(record)
  const authors = stringsAt(record, 'authors', 'authorNames', 'contributors').map(
    (name, authorIndex) => ({
      id: `${id}-author-${authorIndex}`,
      name,
    }),
  )
  const artworkUrl = textAt(record, 'artworkUrl', 'coverUrl', 'imageUrl')
  const readDate = dateFrom(
    record,
    'finishedAt',
    'readAt',
    'consumedAt',
    'latestReadAt',
    'lastConsumed',
  )
  const addedDate = dateFrom(record, 'addedAt', 'queueAddedAt', 'sourceAddedAt', 'added')
  const publicationDate = dateFrom(
    record,
    'publishedAt',
    'publicationDate',
    'releaseDate',
    'published',
  )
  const history = bookHistory(record, id)
  const source = recordAt(record, 'source')
  const currentlyReading = booleanAt(record, 'currentlyReading')
  const rating = ratingValue(record)
  const subtitle = textAt(record, 'subtitle')
  const description = textAt(record, 'description', 'summary')
  const pageCount = numberAt(record, 'pageCount', 'pages')
  const latestReadLabel = formatDate(readDate)
  const addedLabel = formatDate(addedDate)
  const publicationLabel = formatDate(publicationDate)
  const sourceHref = source ? textAt(source, 'url', 'href') : undefined
  const book: BooksReviewBook = {
    id,
    title: textAt(record, 'title', 'name') ?? 'Untitled book',
    ...(subtitle ? { subtitle } : {}),
    authors,
    ...(artworkUrl ? { cover: { src: artworkUrl, alt: '' } } : {}),
    memberships: {
      archive: booleanAt(memberships, 'archive') ?? section === 'archive',
      queue: booleanAt(memberships, 'queue') ?? section === 'queue',
      ...(currentlyReading !== undefined ? { currentlyReading } : {}),
    },
    ...(latestReadLabel ? { latestReadLabel } : {}),
    ...(addedLabel ? { addedLabel } : {}),
    ...(rating !== undefined ? { rating } : {}),
    ...(history.length
      ? { supportedReads: history.filter((entry) => entry.kind === 'read').length }
      : {}),
    ...(description ? { description } : {}),
    ...(publicationLabel ? { publicationLabel } : {}),
    ...(pageCount ? { pageCountLabel: `${pageCount} pages` } : {}),
    ...(source
      ? {
          source: {
            label: textAt(source, 'label', 'name') ?? 'Source',
            ...(sourceHref ? { href: sourceHref } : {}),
          },
        }
      : {}),
    history,
  }
  return book
}

export function booksSurfaceProps(fixture: ReviewFixture): BooksSurfaceReviewProps {
  const archive = fixture.library?.books?.archive ?? []
  const queue = fixture.library?.books?.queue ?? []
  const merged = new Map<string, BooksReviewBook>()
  for (const [section, values] of [
    ['archive', archive],
    ['queue', queue],
  ] as const) {
    values.filter(isRecord).forEach((record, index) => {
      const next = mapBook(record, index, section)
      const previous = merged.get(next.id)
      if (!previous) {
        merged.set(next.id, next)
        return
      }
      merged.set(next.id, {
        ...previous,
        ...next,
        memberships: {
          ...previous.memberships,
          ...next.memberships,
          archive: previous.memberships.archive || next.memberships.archive,
          queue: previous.memberships.queue || next.memberships.queue,
        },
        history: previous.history.length >= next.history.length ? previous.history : next.history,
      })
    })
  }
  return {
    books: [...merged.values()],
    counts: {
      archive: [...merged.values()].filter((book) => book.memberships.archive).length,
      queue: [...merged.values()].filter((book) => book.memberships.queue).length,
      supportedReads: [...merged.values()].reduce(
        (sum, book) => sum + (book.supportedReads ?? 0),
        0,
      ),
    },
  }
}

function subtypeOf(record: Record<string, unknown>): ArticleSubtype {
  const value = textAt(record, 'subtype', 'documentType', 'type')?.toLowerCase()
  if (value === 'pdf' || value === 'rss' || value === 'newsletter') return value
  return 'article'
}

function temporal(value: string | undefined) {
  if (!value) return null
  return { label: formatDate(value) ?? value, iso: value, basis: 'asserted' as const }
}

function mapArticleRow(
  record: Record<string, unknown>,
  index: number,
  section: ArticleSection,
): ArticleRowData {
  const id = idOf(record, `article-${section}-${index}`)
  const relationships = membershipsOf(record)
  const sectionDate =
    section === 'archive'
      ? dateFrom(record, 'archivedAt', 'consumedAt', 'activityAt', 'lastConsumed')
      : section === 'queue'
        ? dateFrom(record, 'addedAt', 'queueAddedAt', 'sourceAddedAt', 'added')
        : dateFrom(record, 'arrivedAt', 'feedAt', 'sourceAddedAt', 'added')
  const queueState = textAt(record, 'queueState', 'location')?.toLowerCase()
  const normalizedQueueState =
    queueState === 'later' || queueState === 'shortlist' ? queueState : 'inbox'
  const occurrences = occurrencesOf(record)
  const readingTime = textAt(record, 'readingTime')
  return {
    id,
    title: textAt(record, 'title', 'name') ?? null,
    subtype: subtypeOf(record),
    imageUrl: textAt(record, 'artworkUrl', 'imageUrl', 'thumbnailUrl') ?? null,
    author: textAt(record, 'author', 'authorName', 'creator') ?? null,
    publication: textAt(record, 'publication', 'siteName', 'domain') ?? null,
    publishedAt: temporal(dateFrom(record, 'publishedAt', 'publicationDate', 'published')),
    readingTimeMinutes:
      numberAt(record, 'readingTimeMinutes', 'readingTime') ??
      (readingTime ? Number.parseInt(readingTime, 10) || null : null),
    progress: numberAt(record, 'progress', 'readingProgress') ?? null,
    firstOpenedAt: dateFrom(record, 'firstOpenedAt') ?? null,
    ...(section === 'archive'
      ? {
          archive: {
            date: temporal(sectionDate),
            occurrenceCount: Math.max(occurrences.length, 1),
          },
        }
      : {}),
    ...(section === 'queue'
      ? { queue: { state: normalizedQueueState, addedAt: temporal(sectionDate) } }
      : {}),
    ...(section === 'feed' ? { feed: { arrivedAt: temporal(sectionDate) } } : {}),
    ...(booleanAt(relationships, 'archive') ? { archivedBefore: true } : {}),
  }
}

function mapArticleInspector(
  record: Record<string, unknown>,
  row: ArticleRowData,
  section: ArticleSection,
): ArticleInspectorData {
  const relationships = membershipsOf(record)
  const source = recordAt(record, 'source')
  const occurrences = occurrencesOf(record)
  const currentRelationships: ArticleInspectorData['currentRelationships'] = []
  if (booleanAt(relationships, 'archive') || section === 'archive')
    currentRelationships.push('archived')
  if (section === 'queue') currentRelationships.push(row.queue?.state ?? 'inbox')
  if (booleanAt(relationships, 'feed') || section === 'feed') currentRelationships.push('feed')
  return {
    id: row.id,
    title: row.title,
    subtype: row.subtype,
    imageUrl: row.imageUrl,
    author: row.author,
    publication: row.publication,
    summary: textAt(record, 'summary', 'description') ?? null,
    publishedAt: row.publishedAt,
    wordCount: numberAt(record, 'wordCount') ?? null,
    readingTimeLabel: row.readingTimeMinutes === null ? null : `${row.readingTimeMinutes} min read`,
    progressLabel:
      row.progress === null ? 'Progress unavailable' : `${Math.round(row.progress * 100)}% read`,
    firstOpenedLabel: formatDate(row.firstOpenedAt ?? undefined) ?? null,
    lastOpenedLabel: formatDate(dateFrom(record, 'lastOpenedAt')) ?? null,
    currentRelationships,
    originalUrl: textAt(record, 'url', 'originalUrl', 'canonicalUrl') ?? null,
    readerUrl: textAt(record, 'readerUrl') ?? null,
    sourceFacts: source
      ? Object.entries(source).flatMap(([label, value]) =>
          typeof value === 'string' ? [{ label, value }] : [],
        )
      : [],
    history: occurrences.map((occurrence, index) => ({
      id: idOf(occurrence, `${row.id}-history-${index}`),
      kind: 'archive' as const,
      title: textAt(occurrence, 'label', 'title') ?? 'Activity',
      date: temporal(dateFrom(occurrence, 'date', 'occurredAt', 'consumedAt')),
      body: textAt(occurrence, 'body', 'note', 'text') ?? null,
    })),
  }
}

export function articlesSurfaceData(fixture: ReviewFixture): ArticlesSurfaceData {
  const rows = { archive: [], queue: [], feed: [] } as Record<ArticleSection, ArticleRowData[]>
  const inspectors: ArticlesSurfaceData['inspectors'] = {}
  for (const section of ['archive', 'queue', 'feed'] as const) {
    const records = fixture.library?.articles?.[section] ?? []
    records.filter(isRecord).forEach((record, index) => {
      const row = mapArticleRow(record, index, section)
      rows[section].push(row)
      inspectors[row.id] = mapArticleInspector(record, row, section)
    })
  }
  return {
    rows,
    sectionCounts: {
      archive: rows.archive.length,
      queue: rows.queue.length,
      feed: rows.feed.length,
    },
    inspectors,
  }
}

function mapMovieViewing(
  occurrence: Record<string, unknown>,
  movieId: string,
  index: number,
): MoviesReviewViewing {
  const occurredAt = dateFrom(occurrence, 'occurredAt', 'watchedAt', 'date')
  const rating = ratingValue(occurrence)
  const connectionLabel = textAt(occurrence, 'connectionLabel')
  const reviewText = textAt(occurrence, 'review', 'reviewText')
  return {
    id: idOf(occurrence, `${movieId}-viewing-${index}`),
    watchedAt: occurredAt ? { label: formatDate(occurredAt) ?? occurredAt, iso: occurredAt } : null,
    ...(rating !== undefined ? { rating } : {}),
    ...(connectionLabel ? { connectionLabel } : {}),
    ...(reviewText ? { reviewText } : {}),
    evidenceRoles: stringsAt(occurrence, 'evidenceRoles', 'sources').length
      ? stringsAt(occurrence, 'evidenceRoles', 'sources')
      : [textAt(occurrence, 'source') ?? 'Imported viewing'],
  }
}

function mapMovie(record: Record<string, unknown>, index: number, section: 'archive' | 'queue') {
  const id = idOf(record, `movie-${section}-${index}`)
  const memberships = membershipsOf(record)
  const viewings = occurrencesOf(record).map((occurrence, occurrenceIndex) =>
    mapMovieViewing(occurrence, id, occurrenceIndex),
  )
  const releaseYear = numberAt(record, 'releaseYear', 'year')
  const rating = ratingValue(record)
  const artworkUrl = textAt(record, 'artworkUrl', 'posterUrl', 'imageUrl')
  const added = dateFrom(record, 'addedAt', 'queueAddedAt', 'added')
  const lastConsumed = dateFrom(record, 'lastConsumed', 'watchedAt')
  const canonicalUrl = textAt(record, 'letterboxdUri', 'canonicalUrl')
  const watchCount = numberAt(record, 'watchCount') ?? viewings.length
  const directors = stringsAt(record, 'directors').map((name, directorIndex) => ({
    id: `${id}-director-${directorIndex}`,
    name,
  }))
  const movie: MoviesReviewMovie = {
    id,
    displayTitle: textAt(record, 'title', 'name') ?? null,
    ...(releaseYear !== undefined ? { releaseYear } : {}),
    ...(artworkUrl ? { poster: { src: artworkUrl, alt: '' } } : {}),
    directors,
    personal: {
      ...(rating !== undefined ? { currentRating: rating } : {}),
      liked: booleanAt(record, 'liked') ?? false,
    },
    memberships: {
      archive: booleanAt(memberships, 'archive') ?? section === 'archive',
      queue: booleanAt(memberships, 'queue') ?? section === 'queue',
    },
    ...(section === 'archive' || watchCount > 0
      ? {
          archive: {
            lifetimeWatchCount: watchCount,
            referenceWatchedAt: lastConsumed
              ? { label: formatDate(lastConsumed) ?? lastConsumed, iso: lastConsumed }
              : null,
            latestKnownWatchedAt: lastConsumed
              ? { label: formatDate(lastConsumed) ?? lastConsumed, iso: lastConsumed }
              : null,
            hasUnknownWatchedDate: !lastConsumed,
          },
        }
      : {}),
    ...(section === 'queue'
      ? {
          queue: {
            addedAt: added ? { label: formatDate(added) ?? added, iso: added } : null,
          },
        }
      : {}),
    ...(canonicalUrl
      ? { sources: { links: [{ label: 'Letterboxd film', href: canonicalUrl }] } }
      : {}),
    viewings,
  }
  return movie
}

export function moviesSurfaceProps(fixture: ReviewFixture): MoviesSurfaceReviewProps {
  const archive = fixture.library?.movies?.archive ?? []
  const queue = fixture.library?.movies?.queue ?? []
  const merged = new Map<string, MoviesReviewMovie>()
  for (const [section, values] of [
    ['archive', archive],
    ['queue', queue],
  ] as const) {
    values.filter(isRecord).forEach((record, index) => {
      const next = mapMovie(record, index, section)
      const previous = merged.get(next.id)
      if (!previous) {
        merged.set(next.id, next)
        return
      }
      const archiveRelationship = previous.archive ?? next.archive
      const queueRelationship = previous.queue ?? next.queue
      merged.set(next.id, {
        ...previous,
        ...next,
        memberships: {
          archive: previous.memberships.archive || next.memberships.archive,
          queue: previous.memberships.queue || next.memberships.queue,
        },
        ...(archiveRelationship ? { archive: archiveRelationship } : {}),
        ...(queueRelationship ? { queue: queueRelationship } : {}),
        viewings:
          previous.viewings.length >= next.viewings.length ? previous.viewings : next.viewings,
      })
    })
  }
  return {
    movies: [...merged.values()],
    counts: {
      archive: [...merged.values()].filter((movie) => movie.memberships.archive).length,
      queue: [...merged.values()].filter((movie) => movie.memberships.queue).length,
      watchOccurrences: [...merged.values()].reduce(
        (sum, movie) => sum + (movie.archive?.lifetimeWatchCount ?? 0),
        0,
      ),
    },
  }
}

function durationLabel(milliseconds: number | undefined) {
  if (milliseconds === undefined) return undefined
  const totalMinutes = Math.max(0, Math.round(milliseconds / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (!hours) return `${minutes}m`
  if (!minutes) return `${hours}h`
  return `${hours}h ${minutes}m`
}

function podcastArtwork(record: Record<string, unknown>) {
  const src = textAt(record, 'artworkUrl', 'imageUrl')
  const href = textAt(record, 'spotifyUri', 'canonicalUrl')
  return src
    ? {
        src,
        alt: '',
        attributionLabel: 'Spotify',
        ...(href ? { href } : {}),
      }
    : null
}

function mapPodcastEpisode(
  record: Record<string, unknown>,
  index: number,
  section: 'archive' | 'queue',
): PodcastEpisodeRow {
  const memberships = membershipsOf(record)
  const id = idOf(record, `podcast-${section}-${index}`)
  const lastConsumed = dateFrom(record, 'lastConsumed')
  const added = dateFrom(record, 'added')
  const published = dateFrom(record, 'published')
  const observed = durationLabel(numberAt(record, 'observedMs'))
  const duration = durationLabel(numberAt(record, 'durationMs'))
  const showName = textAt(record, 'show', 'creator')
  const showId = textAt(record, 'showId')
  const title = textAt(record, 'title', 'name') ?? null
  return {
    kind: 'episode',
    id,
    title,
    artwork: podcastArtwork(record),
    show:
      showName || showId
        ? {
            ...(showId ? { id: showId } : {}),
            name: showName ?? null,
          }
        : null,
    memberships: {
      archive: booleanAt(memberships, 'archive') ?? section === 'archive',
      queue: booleanAt(memberships, 'queue') ?? section === 'queue',
      savedEpisode: section === 'queue',
    },
    displayActivity:
      section === 'archive'
        ? {
            kind: 'spotify_export',
            label: lastConsumed
              ? `Playback observed ${formatDate(lastConsumed) ?? lastConsumed}`
              : 'Playback detected · date unavailable',
            temporal: lastConsumed
              ? { label: formatDate(lastConsumed) ?? lastConsumed, iso: lastConsumed }
              : null,
          }
        : null,
    ...(observed ? { observedTimeLabel: `${observed} observed` } : {}),
    ...(duration ? { durationLabel: `${duration} episode` } : {}),
    ...(published ? { publishedLabel: `Published ${formatDate(published) ?? published}` } : {}),
    ...(section === 'queue'
      ? {
          queue: {
            savedLabel: added
              ? `Saved ${formatDate(added) ?? added}`
              : 'Saved in Spotify · date unavailable',
            ...((numberAt(record, 'observedMs') ?? 0) === 0
              ? { zeroObservedLabel: 'No playback observed' }
              : {}),
          },
        }
      : {}),
    availability: 'unknown',
  }
}

function mapPodcastShow(record: Record<string, unknown>, index: number): PodcastShowRow {
  const id = idOf(record, `podcast-show-${index}`)
  const name = textAt(record, 'title', 'name') ?? null
  const totalEpisodes = numberAt(record, 'totalEpisodes')
  const added = dateFrom(record, 'added')
  return {
    kind: 'show',
    id,
    name,
    artwork: podcastArtwork(record),
    publisher: textAt(record, 'publisher', 'creator') ?? null,
    savedLabel: added
      ? `Saved ${formatDate(added) ?? added}`
      : 'Saved in Spotify · date unavailable',
    ...(totalEpisodes !== undefined ? { totalEpisodesLabel: `${totalEpisodes} episodes` } : {}),
    availability: 'unknown',
  }
}

function podcastEpisodeInspector(
  record: Record<string, unknown>,
  row: PodcastEpisodeRow,
): PodcastEpisodeInspector {
  const observed = durationLabel(numberAt(record, 'observedMs'))
  const duration = durationLabel(numberAt(record, 'durationMs'))
  const published = dateFrom(record, 'published')
  const spotifyUri = textAt(record, 'spotifyUri', 'canonicalUrl')
  const history = occurrencesOf(record).map((occurrence, index) => {
    const occurredAt = dateFrom(occurrence, 'occurredAt')
    const source = textAt(occurrence, 'source')
    const detail = textAt(occurrence, 'connectionLabel')
    return {
      id: idOf(occurrence, `${row.id}-history-${index}`),
      kind: 'spotify_playback' as const,
      title: source ?? 'Playback observed',
      ...(occurredAt ? { dateLabel: formatDate(occurredAt) ?? occurredAt } : {}),
      ...(detail ? { detail } : {}),
    }
  })
  return {
    kind: 'episode',
    id: row.id,
    title: row.title,
    showName: row.show?.name ?? null,
    artwork: row.artwork,
    memberships: row.memberships,
    ...(spotifyUri
      ? { links: [{ label: 'Open in Spotify', href: spotifyUri, source: 'spotify' }] }
      : {}),
    listening: {
      ...(observed ? { observedTimeLabel: `${observed} observed` } : {}),
      playbackObservationCount: numberAt(record, 'positiveObservationCount', 'playCount') ?? 0,
      coverageNote: 'Observed time is source evidence, not a completion claim.',
    },
    episodeFacts: [
      ...(duration ? [{ label: 'Duration', value: duration }] : []),
      ...(published ? [{ label: 'Published', value: formatDate(published) ?? published }] : []),
    ],
    sourceFacts: [{ label: 'Source', value: 'Spotify' }],
    history,
  }
}

function podcastShowInspector(
  record: Record<string, unknown>,
  row: PodcastShowRow,
): PodcastShowInspector {
  const spotifyUri = textAt(record, 'spotifyUri', 'canonicalUrl')
  return {
    kind: 'show',
    id: row.id,
    name: row.name,
    publisher: row.publisher,
    artwork: row.artwork,
    following: true,
    ...(spotifyUri
      ? { links: [{ label: 'Open in Spotify', href: spotifyUri, source: 'spotify' }] }
      : {}),
    followingFacts: [{ label: 'Relationship', value: row.savedLabel }],
    ...(row.totalEpisodesLabel
      ? { aboutFacts: [{ label: 'Catalog episodes', value: row.totalEpisodesLabel }] }
      : {}),
    sourceFacts: [{ label: 'Source', value: 'Spotify saved shows' }],
    history: [],
  }
}

export function podcastsSurfaceProps(fixture: ReviewFixture): PodcastsSurfaceReviewProps {
  const archiveRecords = (fixture.library?.podcasts?.archive ?? []).filter(isRecord)
  const queueRecords = (fixture.library?.podcasts?.queue ?? []).filter(isRecord)
  const followingRecords = (fixture.library?.podcasts?.following ?? []).filter(isRecord)
  const archiveEpisodes = archiveRecords.map((record, index) =>
    mapPodcastEpisode(record, index, 'archive'),
  )
  const queueEpisodes = queueRecords.map((record, index) =>
    mapPodcastEpisode(record, index, 'queue'),
  )
  const followedShows = followingRecords.map(mapPodcastShow)
  const inspectors: Record<string, PodcastInspector | undefined> = {}
  archiveRecords.forEach((record, index) => {
    const row = archiveEpisodes[index]!
    inspectors[row.id] = podcastEpisodeInspector(record, row)
  })
  queueRecords.forEach((record, index) => {
    const row = queueEpisodes[index]!
    inspectors[row.id] = podcastEpisodeInspector(record, row)
  })
  followingRecords.forEach((record, index) => {
    const row = followedShows[index]!
    inspectors[row.id] = podcastShowInspector(record, row)
  })
  const totalObservedMs = archiveRecords.reduce(
    (sum, record) => sum + (numberAt(record, 'observedMs') ?? 0),
    0,
  )
  const totalObservedLabel = durationLabel(totalObservedMs)
  return {
    archiveEpisodes,
    queueEpisodes,
    followedShows,
    counts: {
      archiveEpisodes: archiveEpisodes.length,
      queueEpisodes: queueEpisodes.length,
      followedShows: followedShows.length,
    },
    inspectors,
    ...(totalObservedLabel ? { archiveObservedTimeLabel: totalObservedLabel } : {}),
    coverageNote: 'Playback evidence may be partial; observed time is not completion.',
  }
}

function musicAggregate(record: Record<string, unknown>): MusicAggregate {
  const playCount = numberAt(record, 'playCount') ?? 0
  const observedMs = numberAt(record, 'observedMs') ?? 0
  const firstPlayedAt = textAt(record, 'firstPlayedAt') ?? dateFrom(record, 'firstPlayed')
  const latestPlayedAt = textAt(record, 'lastPlayedAt') ?? dateFrom(record, 'lastConsumed')
  return {
    qualifyingPlaybackCount: playCount,
    exportBackedPlaybackCount: playCount,
    apiOnlyPlaybackCount: 0,
    reconciledPlaybackCount: 0,
    playbacksWithObservedDuration: observedMs > 0 ? playCount : 0,
    observedMs,
    ...(firstPlayedAt ? { firstPlayedAt } : {}),
    ...(latestPlayedAt ? { latestPlayedAt } : {}),
  }
}

function musicArtists(record: Record<string, unknown>, id: string) {
  const names = stringsAt(record, 'artists')
  const fallback = textAt(record, 'creator')
  const effectiveNames = names.length ? names : fallback ? [fallback] : []
  return effectiveNames.map((name, index) => ({ id: `${id}-artist-${index}`, name }))
}

function mapMusicTrack(record: Record<string, unknown>, index: number): MusicTrackSummary {
  const id = idOf(record, `track-${index}`)
  const artworkUrl = textAt(record, 'artworkUrl')
  const albumName = textAt(record, 'album')
  const spotifyUri = textAt(record, 'spotifyUri', 'canonicalUrl')
  const duration = durationLabel(numberAt(record, 'durationMs'))
  const release = dateFrom(record, 'published')
  const aggregate = musicAggregate(record)
  const explicit = booleanAt(record, 'explicit')
  return {
    id,
    title: textAt(record, 'title', 'name') ?? null,
    artists: musicArtists(record, id),
    ...(albumName ? { album: { id: `${id}-album`, name: albumName } } : {}),
    ...(artworkUrl ? { artwork: { src: artworkUrl, alt: '' } } : {}),
    ...(explicit !== undefined ? { explicit } : {}),
    ...(duration ? { durationLabel: duration } : {}),
    ...(release ? { releaseLabel: formatDate(release) ?? release } : {}),
    ...(spotifyUri ? { spotifyUri, spotifyHref: spotifyUri } : {}),
    catalogState: spotifyUri ? 'current' : 'export_only',
    period: aggregate,
    lifetime: aggregate,
    history: [],
    sourceFacts: [{ label: 'Source', value: spotifyUri ? 'Spotify' : 'Spotify export' }],
  }
}

function mapMusicAlbum(record: Record<string, unknown>, index: number): MusicAlbumSummary {
  const id = idOf(record, `album-${index}`)
  const artworkUrl = textAt(record, 'artworkUrl')
  const spotifyUri = textAt(record, 'spotifyUri', 'canonicalUrl')
  const release = dateFrom(record, 'published')
  const aggregate = musicAggregate(record)
  return {
    id,
    title: textAt(record, 'title', 'name') ?? null,
    artists: musicArtists(record, id),
    ...(artworkUrl ? { artwork: { src: artworkUrl, alt: '' } } : {}),
    ...(release ? { releaseLabel: formatDate(release) ?? release } : {}),
    uniqueTracksHeard: numberAt(record, 'uniqueTracksHeard') ?? 0,
    ...(spotifyUri ? { spotifyUri, spotifyHref: spotifyUri } : {}),
    catalogState: spotifyUri ? 'current' : 'export_only',
    period: aggregate,
    lifetime: aggregate,
    history: [],
    sourceFacts: [{ label: 'Source', value: spotifyUri ? 'Spotify' : 'Spotify export' }],
  }
}

function mapMusicArtist(record: Record<string, unknown>, index: number): MusicArtistSummary {
  const id = idOf(record, `artist-${index}`)
  const artworkUrl = textAt(record, 'artworkUrl')
  const spotifyUri = textAt(record, 'spotifyUri', 'canonicalUrl')
  const aggregate = musicAggregate(record)
  return {
    id,
    name: textAt(record, 'title', 'name', 'creator') ?? null,
    ...(artworkUrl ? { artwork: { src: artworkUrl, alt: '' } } : {}),
    ...(spotifyUri ? { spotifyUri, spotifyHref: spotifyUri } : {}),
    catalogState: spotifyUri ? 'current' : 'export_only',
    uniqueTracksHeard: numberAt(record, 'uniqueTracksHeard') ?? 0,
    releasesHeard: numberAt(record, 'uniqueAlbumsHeard') ?? 0,
    period: aggregate,
    lifetime: aggregate,
    history: [],
    sourceFacts: [{ label: 'Source', value: spotifyUri ? 'Spotify' : 'Spotify export' }],
  }
}

export function musicSurfaceData(fixture: ReviewFixture): MusicSurfaceData {
  const tracks = (fixture.library?.music?.tracks ?? []).filter(isRecord).map(mapMusicTrack)
  const albums = (fixture.library?.music?.albums ?? []).filter(isRecord).map(mapMusicAlbum)
  const artists = (fixture.library?.music?.artists ?? []).filter(isRecord).map(mapMusicArtist)
  const playbacks = tracks.reduce((sum, track) => sum + track.period.qualifyingPlaybackCount, 0)
  const observedMs = tracks.reduce((sum, track) => sum + track.period.observedMs, 0)
  const durationBacked = tracks.reduce(
    (sum, track) => sum + track.period.playbacksWithObservedDuration,
    0,
  )
  return {
    tracks,
    albums,
    artists,
    counts: {
      tracks: tracks.length,
      albums: albums.length,
      artists: artists.length,
      filteredTracks: tracks.length,
      filteredAlbums: albums.length,
      filteredArtists: artists.length,
      filteredUniqueTracks: tracks.length,
      filteredQualifyingPlaybacks: playbacks,
      filteredObservedMs: observedMs,
      filteredPlaybacksWithObservedDuration: durationBacked,
    },
    coverage: {
      exportLabel: 'Spotify streaming history sample',
      recentPollLabel: 'Recent playback may be partial',
    },
    periodLabel: 'All time',
  }
}

function mapVideoWatch(
  occurrence: Record<string, unknown>,
  videoId: string,
  index: number,
): VideoReviewWatch {
  const occurredAt = dateFrom(occurrence, 'occurredAt')
  const accountLabel = textAt(occurrence, 'connectionLabel') ?? 'Imported account'
  const source = textAt(occurrence, 'source')
  return {
    id: idOf(occurrence, `${videoId}-watch-${index}`),
    watchedLabel: occurredAt ? (formatDate(occurredAt) ?? occurredAt) : null,
    accountLabel,
    ...(source ? { evidenceLabel: source } : {}),
  }
}

function mapVideo(record: Record<string, unknown>, index: number, section: 'archive' | 'queue') {
  const id = idOf(record, `video-${section}-${index}`)
  const memberships = membershipsOf(record)
  const lastConsumed = dateFrom(record, 'lastConsumed')
  const added = dateFrom(record, 'added')
  const title = textAt(record, 'title', 'name') ?? null
  const artworkUrl = textAt(record, 'artworkUrl', 'thumbnailUrl')
  const channelTitle = textAt(record, 'channel', 'creator')
  const youtubeVideoId = textAt(record, 'youtubeVideoId')
  const canonicalUrl = textAt(record, 'canonicalUrl')
  const history = occurrencesOf(record).map((occurrence, occurrenceIndex) =>
    mapVideoWatch(occurrence, id, occurrenceIndex),
  )
  const watchCount = numberAt(record, 'watchCount') ?? (section === 'archive' ? history.length : 0)
  const video: VideoReviewVideo = {
    id,
    ...(youtubeVideoId ? { youtubeVideoId } : {}),
    displayTitle: title,
    thumbnail: artworkUrl ? { src: artworkUrl, alt: '' } : null,
    channel: channelTitle ? { id: null, displayTitle: channelTitle } : null,
    availability: { state: 'unchecked' },
    archive: {
      active: booleanAt(memberships, 'archive') ?? section === 'archive',
      lifetimeWatchCount: watchCount,
      matchingWatchCount: watchCount,
      referenceWatchedLabel: lastConsumed ? (formatDate(lastConsumed) ?? lastConsumed) : null,
      ...(lastConsumed ? { referenceWatchedSortValue: lastConsumed } : {}),
    },
    queue: {
      active: booleanAt(memberships, 'queue') ?? section === 'queue',
      activeRelationshipCount: section === 'queue' ? 1 : 0,
      referenceAddedLabel: added ? (formatDate(added) ?? added) : null,
      ...(added ? { referenceAddedSortValue: added } : {}),
    },
    inspector: {
      relationshipFacts: [
        ...(watchCount ? [{ label: 'Archive', value: `${watchCount} watches` }] : []),
        ...(section === 'queue'
          ? [
              {
                label: 'Watch Later',
                value: added ? (formatDate(added) ?? added) : 'Added date unavailable',
              },
            ]
          : []),
      ],
      ...(section === 'queue'
        ? {
            queueRelationships: [
              {
                id: `${id}-queue`,
                accountLabel: history[0]?.accountLabel ?? 'Imported account',
                addedLabel: added ? (formatDate(added) ?? added) : null,
                sourceLabel: 'YouTube Watch Later',
              },
            ],
          }
        : {}),
      history,
      ...(canonicalUrl ? { links: [{ label: 'Open on YouTube', href: canonicalUrl }] } : {}),
      sourceFacts: [
        { label: 'Source', value: section === 'queue' ? 'Watch Later' : 'Watch history' },
      ],
    },
  }
  return video
}

function channelKey(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase() ?? ''
}

function mapVideoChannel(
  displayTitle: string,
  index: number,
  videos: VideoReviewVideo[],
  followingRecord?: Record<string, unknown>,
): VideoReviewChannel {
  const id = followingRecord
    ? idOf(followingRecord, `video-channel-${index}`)
    : `video-channel-${index}`
  const artworkUrl = followingRecord
    ? textAt(followingRecord, 'artworkUrl', 'thumbnailUrl')
    : undefined
  const canonicalUrl = followingRecord ? textAt(followingRecord, 'canonicalUrl') : undefined
  const matchingVideos = videos.filter(
    (video) => channelKey(video.channel?.displayTitle) === channelKey(displayTitle),
  )
  const archiveVideos = matchingVideos.filter((video) => video.archive.active)
  const queueVideos = matchingVideos.filter((video) => video.queue.active)
  const watchOccurrences = archiveVideos.reduce(
    (sum, video) => sum + video.archive.lifetimeWatchCount,
    0,
  )
  const latestWatched = archiveVideos
    .filter((video) => video.archive.referenceWatchedSortValue)
    .toSorted((left, right) =>
      (right.archive.referenceWatchedSortValue ?? '').localeCompare(
        left.archive.referenceWatchedSortValue ?? '',
      ),
    )[0]
  const isFollowed = Boolean(followingRecord)
  return {
    id,
    displayTitle,
    thumbnail: artworkUrl ? { src: artworkUrl, alt: '' } : null,
    following: {
      activeRelationshipCount: isFollowed ? 1 : 0,
      knownSubscribedLabel: null,
      activeConnectionLabels: isFollowed ? ['Imported account'] : [],
    },
    library: {
      archiveVideoCount: archiveVideos.length,
      watchOccurrenceCount: watchOccurrences,
      ...(latestWatched?.archive.referenceWatchedLabel
        ? { latestWatchedLabel: latestWatched.archive.referenceWatchedLabel }
        : {}),
      queueVideoCount: queueVideos.length,
    },
    metadataAvailable: Boolean(displayTitle || artworkUrl),
    inspector: {
      ...(isFollowed
        ? {
            relationships: [
              {
                id: `${id}-following`,
                accountLabel: 'Imported account',
                source: 'Takeout' as const,
                subscribedLabel: null,
              },
            ],
          }
        : {}),
      sourceFacts: [
        {
          label: 'Channel rollup',
          value: isFollowed ? 'Video activity and YouTube subscriptions' : 'Video activity',
        },
      ],
      ...(canonicalUrl ? { links: [{ label: 'Open on YouTube', href: canonicalUrl }] } : {}),
      archiveVideos: archiveVideos.map((video) => ({
        id: video.id,
        title: video.displayTitle,
        thumbnail: video.thumbnail,
        channelTitle: video.channel?.displayTitle ?? null,
        relationshipLabel: video.archive.referenceWatchedLabel,
      })),
      queueVideos: queueVideos.map((video) => ({
        id: video.id,
        title: video.displayTitle,
        thumbnail: video.thumbnail,
        channelTitle: video.channel?.displayTitle ?? null,
        relationshipLabel: video.queue.referenceAddedLabel,
      })),
    },
  }
}

export function videosSurfaceProps(fixture: ReviewFixture): VideosSurfaceReviewProps {
  const archiveRecords = (fixture.library?.videos?.archive ?? []).filter(isRecord)
  const queueRecords = (fixture.library?.videos?.queue ?? []).filter(isRecord)
  const followingRecords = (fixture.library?.videos?.following ?? []).filter(isRecord)
  const merged = new Map<string, VideoReviewVideo>()
  for (const [section, records] of [
    ['archive', archiveRecords],
    ['queue', queueRecords],
  ] as const) {
    records.forEach((record, index) => {
      const next = mapVideo(record, index, section)
      const previous = merged.get(next.id)
      if (!previous) {
        merged.set(next.id, next)
        return
      }
      const mergedHistory =
        (previous.inspector?.history?.length ?? 0) >= (next.inspector?.history?.length ?? 0)
          ? previous.inspector?.history
          : next.inspector?.history
      merged.set(next.id, {
        ...previous,
        ...next,
        archive: previous.archive.active ? previous.archive : next.archive,
        queue: previous.queue.active ? previous.queue : next.queue,
        inspector: {
          ...previous.inspector,
          ...next.inspector,
          ...(mergedHistory ? { history: mergedHistory } : {}),
        },
      })
    })
  }
  const videos = [...merged.values()]
  const followingByChannel = new Map(
    followingRecords.flatMap((record) => {
      const title = textAt(record, 'title', 'name', 'creator')
      return title ? [[channelKey(title), record] as const] : []
    }),
  )
  const activityChannels = new Map<string, string>()
  for (const video of videos) {
    const title = video.channel?.displayTitle?.trim()
    if (title) activityChannels.set(channelKey(title), title)
  }
  const channels = [...activityChannels.entries()].map(([key, title], index) =>
    mapVideoChannel(title, index, videos, followingByChannel.get(key)),
  )
  return {
    videos,
    channels,
    counts: {
      archiveVideos: videos.filter((video) => video.archive.active).length,
      archiveWatches: videos.reduce((sum, video) => sum + video.archive.lifetimeWatchCount, 0),
      queueVideos: videos.filter((video) => video.queue.active).length,
      queueRelationships: videos.reduce(
        (sum, video) => sum + video.queue.activeRelationshipCount,
        0,
      ),
      channels: channels.length,
      followedChannels: channels.filter((channel) => channel.following.activeRelationshipCount > 0)
        .length,
      followingRelationships: channels.reduce(
        (sum, channel) => sum + channel.following.activeRelationshipCount,
        0,
      ),
    },
    sourceStatusLabel: 'YouTube Takeout sample',
  }
}
