import { createHash } from 'node:crypto'

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
  filmUrl: string | null
  entryHash: string
}

export interface LetterboxdRssSnapshot {
  fetchedAt: string
  responseHash: string
  cache: {
    cacheControl: string | null
    etag: string | null
    lastModified: string | null
  }
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

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
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

export function parseLetterboxdRss(xml: string): LetterboxdRssEntry[] {
  const root = asObject(parser.parse(xml) as XmlValue)
  const rss = asObject(root?.rss)
  const channel = asObject(rss?.channel)

  if (channel === undefined) {
    throw new Error('Invalid Letterboxd RSS: missing rss.channel')
  }

  return items(channel.item).map((item) => {
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
      filmUrl: text(item.link),
      entryHash: hash(JSON.stringify(item)),
    }
  })
}

export async function fetchLetterboxdRss(username: string): Promise<LetterboxdRssSnapshot> {
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    throw new Error('Letterboxd username contains unsupported characters')
  }

  const response = await fetch(`https://letterboxd.com/${username}/rss/`, {
    headers: {
      Accept: 'application/rss+xml',
      'User-Agent': 'MediaTracker/0.0.0 (personal-use RSS probe)',
    },
  })

  if (!response.ok) {
    throw new Error(`Letterboxd RSS returned ${response.status}`)
  }

  const body = await response.text()
  return {
    fetchedAt: new Date().toISOString(),
    responseHash: hash(body),
    cache: {
      cacheControl: response.headers.get('cache-control'),
      etag: response.headers.get('etag'),
      lastModified: response.headers.get('last-modified'),
    },
    entries: parseLetterboxdRss(body),
  }
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
