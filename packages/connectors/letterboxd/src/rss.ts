import { XMLParser } from 'fast-xml-parser'

type XmlValue = string | number | boolean | null | XmlObject | XmlValue[]
interface XmlObject {
  [key: string]: XmlValue
}

export interface LetterboxdRssEntry {
  guid: string
  kind: 'watch' | 'review' | 'list' | 'other'
  publishedAt: string | null
  watchedOn: string | null
  rewatch: boolean | null
  rating: number | null
  liked: boolean | null
  tmdbMovieId: string | null
  filmTitle: string | null
  filmYear: string | null
  entryUrl: string | null
  entryHash: string
}

export interface RawLetterboxdRssResponse {
  bytes: Uint8Array
  contentType: string
  fetchedAt: string
  responseHash: string
  cache: {
    cacheControl: string | null
    etag: string | null
    lastModified: string | null
  }
}

export interface LetterboxdRssSnapshot extends RawLetterboxdRssResponse {
  entries: LetterboxdRssEntry[]
}

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  processEntities: true,
  trimValues: true,
})

function asObject(value: XmlValue | undefined): XmlObject | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined
}

function text(value: XmlValue | undefined): string | null {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  const object = asObject(value)
  return object === undefined ? null : text(object['#text'])
}

function items(value: XmlValue | undefined): XmlObject[] {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value]
  return values.map(asObject).filter((item): item is XmlObject => item !== undefined)
}

async function hash(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
  const input = new Uint8Array(bytes.byteLength)
  input.set(bytes)
  const digest = await crypto.subtle.digest('SHA-256', input.buffer)
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('')
}

function entryKind(guid: string): LetterboxdRssEntry['kind'] {
  if (guid.startsWith('letterboxd-watch-')) return 'watch'
  if (guid.startsWith('letterboxd-review-')) return 'review'
  if (guid.startsWith('letterboxd-list-')) return 'list'
  return 'other'
}

function yesNo(value: string | null): boolean | null {
  if (value === 'Yes') return true
  if (value === 'No') return false
  return null
}

export async function parseLetterboxdRss(xml: string): Promise<LetterboxdRssEntry[]> {
  const root = asObject(parser.parse(xml) as XmlValue)
  const rss = asObject(root?.rss)
  const channel = asObject(rss?.channel)

  if (channel === undefined) {
    throw new Error('Invalid Letterboxd RSS: missing rss.channel')
  }

  return Promise.all(
    items(channel.item).map(async (item) => {
      const guid = text(item.guid)
      if (guid === null) throw new Error('Invalid Letterboxd RSS item: missing guid')

      const ratingText = text(item['letterboxd:memberRating'])
      const rating = ratingText === null ? null : Number(ratingText)

      return {
        guid,
        kind: entryKind(guid),
        publishedAt: text(item.pubDate),
        watchedOn: text(item['letterboxd:watchedDate']),
        rewatch: yesNo(text(item['letterboxd:rewatch'])),
        rating: rating === null || Number.isNaN(rating) ? null : rating,
        liked: yesNo(text(item['letterboxd:memberLike'])),
        tmdbMovieId: text(item['tmdb:movieId']),
        filmTitle: text(item['letterboxd:filmTitle']),
        filmYear: text(item['letterboxd:filmYear']),
        entryUrl: text(item.link),
        entryHash: await hash(JSON.stringify(item)),
      }
    }),
  )
}

export async function fetchLetterboxdRss(username: string): Promise<RawLetterboxdRssResponse> {
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    throw new Error('Letterboxd username contains unsupported characters')
  }

  const response = await fetch(`https://letterboxd.com/${username}/rss/`, {
    headers: {
      Accept: 'application/rss+xml',
      'User-Agent': 'MediaTracker/0.0.0 (personal-use RSS sync)',
    },
  })

  if (!response.ok) {
    throw new Error(`Letterboxd RSS returned ${response.status}`)
  }

  const bytes = new Uint8Array(await response.arrayBuffer())
  return {
    bytes,
    contentType: response.headers.get('content-type') ?? 'application/rss+xml',
    fetchedAt: new Date().toISOString(),
    responseHash: await hash(bytes),
    cache: {
      cacheControl: response.headers.get('cache-control'),
      etag: response.headers.get('etag'),
      lastModified: response.headers.get('last-modified'),
    },
  }
}

export async function parseLetterboxdRssResponse(
  response: RawLetterboxdRssResponse,
): Promise<LetterboxdRssSnapshot> {
  const body = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(response.bytes)
  return { ...response, entries: await parseLetterboxdRss(body) }
}

function range(values: (string | null)[]): { earliest: string | null; latest: string | null } {
  const present = values.filter((value): value is string => value !== null).sort()
  return { earliest: present[0] ?? null, latest: present.at(-1) ?? null }
}

function instantRange(values: (string | null)[]): {
  earliest: string | null
  latest: string | null
} {
  const present = values
    .filter((value): value is string => value !== null && !Number.isNaN(Date.parse(value)))
    .map((value) => new Date(value).toISOString())
    .sort()
  return { earliest: present[0] ?? null, latest: present.at(-1) ?? null }
}

export function summarizeLetterboxdRss(snapshot: LetterboxdRssSnapshot) {
  const movies = snapshot.entries.filter(
    (entry) => entry.kind === 'watch' || entry.kind === 'review',
  )
  return {
    fetchedAt: snapshot.fetchedAt,
    responseHash: snapshot.responseHash,
    cache: snapshot.cache,
    entries: snapshot.entries.length,
    kinds: Object.fromEntries(
      ['watch', 'review', 'list', 'other'].map((kind) => [
        kind,
        snapshot.entries.filter((entry) => entry.kind === kind).length,
      ]),
    ),
    movieEntries: movies.length,
    uniqueGuids: new Set(snapshot.entries.map((entry) => entry.guid)).size,
    uniqueTmdbMovies: new Set(movies.map((entry) => entry.tmdbMovieId).filter(Boolean)).size,
    ratedMovieEntries: movies.filter((entry) => entry.rating !== null).length,
    rewatchEntries: movies.filter((entry) => entry.rewatch === true).length,
    watchedDateRange: range(movies.map((entry) => entry.watchedOn)),
    publishedDateRange: instantRange(snapshot.entries.map((entry) => entry.publishedAt)),
  }
}

export function compareLetterboxdRss(
  previous: LetterboxdRssSnapshot,
  current: LetterboxdRssSnapshot,
) {
  const previousByGuid = new Map(previous.entries.map((entry) => [entry.guid, entry]))
  const currentByGuid = new Map(current.entries.map((entry) => [entry.guid, entry]))

  return {
    responseChanged: previous.responseHash !== current.responseHash,
    added: [...currentByGuid.keys()].filter((guid) => !previousByGuid.has(guid)),
    removed: [...previousByGuid.keys()].filter((guid) => !currentByGuid.has(guid)),
    updated: [...currentByGuid.entries()]
      .filter(([guid, entry]) => {
        const previousEntry = previousByGuid.get(guid)
        return previousEntry !== undefined && previousEntry.entryHash !== entry.entryHash
      })
      .map(([guid]) => guid),
  }
}
