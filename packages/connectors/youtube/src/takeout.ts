import { load } from 'cheerio'
import { parse } from 'csv-parse/sync'
import { strFromU8, unzipSync } from 'fflate'

interface DateRange {
  earliest: string | null
  latest: string | null
}

export interface YoutubeWatchEntry {
  action: string
  channelTitle: string | null
  channelUrl: string | null
  fromGoogleAds: boolean
  occurredAt: string | null
  occurredAtRaw: string | null
  product: 'youtube' | 'youtube_music' | 'unknown'
  title: string | null
  titleUrl: string | null
  videoId: string | null
}

export interface YoutubeWatchLaterEntry {
  addedAt: string | null
  videoId: string | null
}

export interface YoutubeSubscriptionEntry {
  channelId: string | null
  channelTitle: string | null
  channelUrl: string | null
}

export interface YoutubePlaylistEntry {
  addNewVideosToTop: boolean | null
  createdAt: string | null
  playlistId: string | null
  title: string | null
  updatedAt: string | null
  videoOrder: string | null
  visibility: string | null
}

export type YoutubeTakeoutComponentKind =
  'watch_history' | 'watch_later' | 'playlist_index' | 'subscriptions'

export interface YoutubeTakeoutComponent {
  errorCode: string | null
  kind: YoutubeTakeoutComponentKind
  memberName: string | null
  recordCount: number
  status: 'complete' | 'invalid' | 'missing'
}

export interface YoutubeTakeout {
  components: YoutubeTakeoutComponent[]
  label: string
  playlists: YoutubePlaylistEntry[]
  subscriptions: YoutubeSubscriptionEntry[]
  watchHistory: YoutubeWatchEntry[]
  watchLater: YoutubeWatchLaterEntry[]
}

function normalizeText(value: string): string {
  return value.replaceAll('\u00a0', ' ').replace(/\s+/g, ' ').trim()
}

function parseOccurredAt(value: string | undefined): string | null {
  if (value === undefined || value.length === 0) return null
  const replacements: Record<string, string> = {
    PDT: 'GMT-0700',
    PST: 'GMT-0800',
    UTC: 'GMT+0000',
  }
  let normalized = value
  for (const [abbreviation, offset] of Object.entries(replacements)) {
    normalized = normalized.replace(new RegExp(`\\b${abbreviation}\\b`), offset)
  }
  const milliseconds = Date.parse(normalized)
  return Number.isNaN(milliseconds) ? null : new Date(milliseconds).toISOString()
}

function isYoutubeVideoId(value: string): boolean {
  return /^[A-Za-z0-9_-]{11}$/.test(value)
}

function isYoutubeChannelId(value: string): boolean {
  return /^UC[A-Za-z0-9_-]{22}$/.test(value)
}

function isExactInstant(value: string | null): value is string {
  if (value === null) return false
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(
      value,
    )
  if (match === null) return false
  const [, year, month, day, hour, minute, second, offsetHour, offsetMinute] = match
  const yearValue = Number(year)
  const monthValue = Number(month)
  const dayValue = Number(day)
  return (
    monthValue >= 1 &&
    monthValue <= 12 &&
    dayValue >= 1 &&
    dayValue <= new Date(Date.UTC(yearValue, monthValue, 0)).getUTCDate() &&
    Number(hour) <= 23 &&
    Number(minute) <= 59 &&
    Number(second) <= 59 &&
    (offsetHour === undefined || Number(offsetHour) <= 23) &&
    (offsetMinute === undefined || Number(offsetMinute) <= 59) &&
    !Number.isNaN(Date.parse(value))
  )
}

function videoIdentity(value: string | null): {
  product: YoutubeWatchEntry['product']
  videoId: string | null
} {
  if (value === null) return { product: 'unknown', videoId: null }
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    const youtubeHosts = new Set([
      'm.youtube.com',
      'music.youtube.com',
      'www.youtube.com',
      'youtu.be',
      'youtube.com',
    ])
    if (!youtubeHosts.has(hostname)) return { product: 'unknown', videoId: null }
    const product = url.hostname === 'music.youtube.com' ? 'youtube_music' : 'youtube'
    const videoId =
      hostname === 'youtu.be'
        ? (url.pathname.split('/').filter(Boolean)[0] ?? null)
        : url.searchParams.get('v')
    return { product, videoId: videoId !== null && isYoutubeVideoId(videoId) ? videoId : null }
  } catch {
    return { product: 'unknown', videoId: null }
  }
}

export function youtubeChannelId(value: string | null): string | null {
  if (value === null) return null
  try {
    const url = new URL(value)
    if (!['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname.toLowerCase()))
      return null
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length !== 2 || parts[0] !== 'channel') return null
    const id = parts[1] ?? ''
    return isYoutubeChannelId(id) ? id : null
  } catch {
    return null
  }
}

export function parseYoutubeWatchHistoryHtml(html: string): YoutubeWatchEntry[] {
  const $ = load(html)
  const entries: YoutubeWatchEntry[] = []

  $('.outer-cell').each((_index, outerCell) => {
    const content = $(outerCell).find('.content-cell').first()
    if (content.length === 0) return

    const fragments = content
      .contents()
      .toArray()
      .filter((node) => node.type === 'text')
      .map((node) => normalizeText($(node).text()))
      .filter((value) => value.length > 0)
    const links = content
      .find('a')
      .toArray()
      .map((anchor) => ({
        href: $(anchor).attr('href') ?? null,
        text: normalizeText($(anchor).text()),
      }))
    const titleLink = links[0]
    const channelLink = links[1]
    const activityText = fragments[0] ?? ''
    const occurredAtRaw = fragments.at(-1) ?? null
    const identity = videoIdentity(titleLink?.href ?? null)

    entries.push({
      action: activityText.split(/\s+/, 1)[0] ?? 'unknown',
      channelTitle: channelLink?.text.length === 0 ? null : (channelLink?.text ?? null),
      channelUrl: channelLink?.href ?? null,
      fromGoogleAds: fragments.some((fragment) => fragment === 'From Google Ads'),
      occurredAt: parseOccurredAt(occurredAtRaw ?? undefined),
      occurredAtRaw,
      product: identity.product,
      title: titleLink?.text.length === 0 ? null : (titleLink?.text ?? null),
      titleUrl: titleLink?.href ?? null,
      videoId: identity.videoId,
    })
  })

  return entries
}

export function parseYoutubeWatchLaterCsv(csv: string): YoutubeWatchLaterEntry[] {
  const rows = csvRows(csv, ['Video ID', 'Playlist Video Creation Timestamp'])
  return rows.map((row) => ({
    addedAt: row['Playlist Video Creation Timestamp'] || null,
    videoId: row['Video ID'] || null,
  }))
}

function csvRows(csv: string, expectedHeaders: readonly string[]): Record<string, string>[] {
  let headers: string[] = []
  const rows = parse(csv, {
    columns(value: string[]) {
      headers = value.map((item) => item.replace(/^\uFEFF/, '').trim())
      return headers
    },
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[]
  if (
    headers.length !== expectedHeaders.length ||
    expectedHeaders.some((header, index) => headers[index] !== header)
  ) {
    throw new Error('unsupported_headers')
  }
  return rows
}

export function parseYoutubeSubscriptionsCsv(csv: string): YoutubeSubscriptionEntry[] {
  return csvRows(csv, ['Channel Id', 'Channel Url', 'Channel Title']).map((row) => ({
    channelId: isYoutubeChannelId(row['Channel Id'] ?? '')
      ? row['Channel Id']!
      : youtubeChannelId(row['Channel Url'] || null),
    channelTitle: row['Channel Title'] || null,
    channelUrl: row['Channel Url'] || null,
  }))
}

export function parseYoutubePlaylistsCsv(csv: string): YoutubePlaylistEntry[] {
  return csvRows(csv, [
    'Playlist ID',
    'Add new videos to top',
    'Playlist Title (Original)',
    'Playlist Title (Original) Language',
    'Playlist Create Timestamp',
    'Playlist Update Timestamp',
    'Playlist Video Order',
    'Playlist Visibility',
  ]).map((row) => ({
    addNewVideosToTop:
      (row['Add new videos to top'] ?? '') === ''
        ? null
        : (row['Add new videos to top'] ?? '').toLowerCase() === 'true',
    createdAt: row['Playlist Create Timestamp'] || null,
    playlistId: row['Playlist ID'] || null,
    title: row['Playlist Title (Original)'] || null,
    updatedAt: row['Playlist Update Timestamp'] || null,
    videoOrder: row['Playlist Video Order'] || null,
    visibility: row['Playlist Visibility'] || null,
  }))
}

function range(values: (string | null)[]): DateRange {
  const dates = values.filter((value): value is string => value !== null).sort()
  return { earliest: dates[0] ?? null, latest: dates.at(-1) ?? null }
}

function counts(values: string[]): Record<string, number> {
  const result = new Map<string, number>()
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1)
  return Object.fromEntries([...result.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

function summarizeTakeout(takeout: YoutubeTakeout) {
  const watched = takeout.watchHistory.filter((entry) => entry.action === 'Watched')
  const historyIds = watched
    .map((entry) => entry.videoId)
    .filter((value): value is string => value !== null)
  const historyIdSet = new Set(historyIds)
  const watchLaterIds = takeout.watchLater
    .map((entry) => entry.videoId)
    .filter((value): value is string => value !== null)

  return {
    label: takeout.label,
    history: {
      activityCards: takeout.watchHistory.length,
      watchedEntries: watched.length,
      watchedEntriesWithVideoId: historyIds.length,
      uniqueVideoIds: historyIdSet.size,
      repeatedOccurrences: historyIds.length - historyIdSet.size,
      watchedWithoutVideoId: watched.filter((entry) => entry.videoId === null).length,
      nonWatchActivityCards: takeout.watchHistory.length - watched.length,
      missingTimestamp: watched.filter((entry) => entry.occurredAt === null).length,
      fromGoogleAds: watched.filter((entry) => entry.fromGoogleAds).length,
      dateRange: range(watched.map((entry) => entry.occurredAt)),
      actions: counts(takeout.watchHistory.map((entry) => entry.action)),
      products: counts(watched.map((entry) => entry.product)),
    },
    watchLater: {
      entries: takeout.watchLater.length,
      uniqueVideoIds: new Set(watchLaterIds).size,
      missingVideoId: takeout.watchLater.filter((entry) => entry.videoId === null).length,
      dateRange: range(takeout.watchLater.map((entry) => entry.addedAt)),
      alreadyInHistory: new Set(watchLaterIds.filter((id) => historyIdSet.has(id))).size,
    },
  }
}

export function summarizeYoutubeTakeouts(takeouts: YoutubeTakeout[]) {
  const eventSources = new Map<string, Set<number>>()
  const uniqueVideoIds = new Set<string>()
  const videoSources = new Map<string, Set<number>>()
  const watchLaterSources = new Map<string, Set<number>>()
  let crossTakeoutDuplicateEvents = 0

  for (const [sourceIndex, takeout] of takeouts.entries()) {
    for (const entry of takeout.watchHistory.filter((row) => row.action === 'Watched')) {
      if (entry.videoId !== null) {
        uniqueVideoIds.add(entry.videoId)
        const sources = videoSources.get(entry.videoId) ?? new Set<number>()
        sources.add(sourceIndex)
        videoSources.set(entry.videoId, sources)
      }
      const identity = entry.videoId ?? entry.title ?? 'unavailable'
      const eventKey = `${identity}\u0000${entry.occurredAt ?? entry.occurredAtRaw ?? 'unknown'}`
      const sources = eventSources.get(eventKey) ?? new Set<number>()
      if (sources.size > 0 && !sources.has(sourceIndex)) crossTakeoutDuplicateEvents += 1
      sources.add(sourceIndex)
      eventSources.set(eventKey, sources)
    }
    for (const entry of takeout.watchLater) {
      if (entry.videoId === null) continue
      const sources = watchLaterSources.get(entry.videoId) ?? new Set<number>()
      sources.add(sourceIndex)
      watchLaterSources.set(entry.videoId, sources)
    }
  }

  return {
    takeouts: takeouts.map(summarizeTakeout),
    combined: {
      watchedEntries: takeouts.reduce(
        (sum, takeout) =>
          sum + takeout.watchHistory.filter((entry) => entry.action === 'Watched').length,
        0,
      ),
      uniqueVideoIds: uniqueVideoIds.size,
      videoIdsPresentInMultipleArchives: [...videoSources.values()].filter(
        (sources) => sources.size > 1,
      ).length,
      crossTakeoutDuplicateEvents,
      watchLaterEntries: takeouts.reduce((sum, takeout) => sum + takeout.watchLater.length, 0),
      subscriptionEntries: takeouts.reduce((sum, takeout) => sum + takeout.subscriptions.length, 0),
      watchLaterVideoIdsPresentInMultipleArchives: [...watchLaterSources.values()].filter(
        (sources) => sources.size > 1,
      ).length,
      sourceArchives: takeouts.length,
    },
  }
}

export function inspectYoutubeTakeoutBytes(bytes: Uint8Array, label: string): YoutubeTakeout {
  let members: ReturnType<typeof unzipSync>
  try {
    members = unzipSync(bytes, {
      filter: (file) =>
        file.name.endsWith('/history/watch-history.html') ||
        file.name.endsWith('/playlists/Watch later-videos.csv') ||
        file.name.endsWith('/playlists/playlists.csv') ||
        file.name.endsWith('/subscriptions/subscriptions.csv'),
    })
  } catch {
    throw new Error('The selected file is not a valid Google Takeout ZIP export')
  }
  const watchHistoryName = Object.keys(members).find((name) =>
    name.endsWith('/history/watch-history.html'),
  )
  const watchLaterName = Object.keys(members).find((name) =>
    name.endsWith('/playlists/Watch later-videos.csv'),
  )
  const playlistIndexName = Object.keys(members).find((name) =>
    name.endsWith('/playlists/playlists.csv'),
  )
  const subscriptionsName = Object.keys(members).find((name) =>
    name.endsWith('/subscriptions/subscriptions.csv'),
  )

  if (
    watchHistoryName === undefined &&
    watchLaterName === undefined &&
    playlistIndexName === undefined &&
    subscriptionsName === undefined
  ) {
    throw new Error('The Google Takeout export has no supported YouTube members')
  }

  const components: YoutubeTakeoutComponent[] = []
  function component<T>(
    kind: YoutubeTakeoutComponentKind,
    memberName: string | undefined,
    parseMember: (value: string) => T[],
    validateMember?: (values: T[]) => boolean,
  ): T[] {
    if (memberName === undefined) {
      components.push({
        kind,
        memberName: null,
        status: 'missing',
        recordCount: 0,
        errorCode: null,
      })
      return []
    }
    try {
      const values = parseMember(strFromU8(members[memberName]!))
      const valid = validateMember?.(values) ?? true
      components.push({
        kind,
        memberName,
        status: valid ? 'complete' : 'invalid',
        recordCount: values.length,
        errorCode: valid ? null : 'invalid_member_row',
      })
      return values
    } catch {
      components.push({
        kind,
        memberName,
        status: 'invalid',
        recordCount: 0,
        errorCode: 'unsupported_or_invalid_member',
      })
      return []
    }
  }

  const watchHistory = component('watch_history', watchHistoryName, parseYoutubeWatchHistoryHtml)
  const watchLater = component(
    'watch_later',
    watchLaterName,
    parseYoutubeWatchLaterCsv,
    (values) => {
      const identities = values.map((value) => value.videoId?.trim() ?? '')
      return (
        identities.every(isYoutubeVideoId) &&
        new Set(identities).size === identities.length &&
        values.every((value) => isExactInstant(value.addedAt))
      )
    },
  )
  const playlists = component('playlist_index', playlistIndexName, parseYoutubePlaylistsCsv)
  const subscriptions = component(
    'subscriptions',
    subscriptionsName,
    parseYoutubeSubscriptionsCsv,
    (values) => {
      const identities = values.map((value) => value.channelId ?? '')
      return (
        identities.every((value) => value.length > 0) &&
        new Set(identities).size === identities.length
      )
    },
  )

  return {
    components,
    label,
    playlists,
    subscriptions,
    watchHistory,
    watchLater,
  }
}
