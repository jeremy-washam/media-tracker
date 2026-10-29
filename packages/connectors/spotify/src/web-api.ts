import { z } from 'zod'

const resumePointSchema = z
  .object({
    fully_played: z.boolean(),
    resume_position_ms: z.number().int().nonnegative().nullable(),
  })
  .nullable()
  .optional()

const episodeSchema = z
  .object({
    id: z.string().nullable(),
    uri: z.string().nullable(),
    name: z.string().nullable(),
    description: z.string().nullable().optional(),
    duration_ms: z.number().int().nonnegative().nullable(),
    external_urls: z.object({ spotify: z.string().nullable().optional() }).nullable().optional(),
    images: z
      .array(z.object({ url: z.string() }))
      .nullable()
      .optional(),
    release_date: z.string().nullable().optional(),
    release_date_precision: z.enum(['day', 'month', 'year']).nullable().optional(),
    resume_point: resumePointSchema,
    show: z
      .object({
        id: z.string().nullable().optional(),
        uri: z.string().nullable().optional(),
        name: z.string().nullable(),
      })
      .nullable(),
  })
  .passthrough()

const pageSchema = z.object({
  items: z.array(z.object({ added_at: z.string(), episode: episodeSchema })),
  limit: z.number().int().positive(),
  next: z.string().nullable().optional(),
  offset: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
})

const showSchema = z.object({
  id: z.string().nullable(),
  uri: z.string().nullable(),
  name: z.string().nullable(),
  description: z.string().nullable().optional(),
  publisher: z.string().nullable().optional(),
  total_episodes: z.number().int().nonnegative().nullable().optional(),
  languages: z.array(z.string()).nullable().optional(),
  external_urls: z.object({ spotify: z.string().nullable().optional() }).nullable().optional(),
  images: z
    .array(z.object({ url: z.string() }))
    .nullable()
    .optional(),
})

const savedShowsPageSchema = z.object({
  items: z.array(z.object({ added_at: z.string(), show: showSchema })),
  limit: z.number().int().positive(),
  next: z.string().nullable().optional(),
  offset: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
})

const artistSchema = z.object({
  id: z.string().nullable(),
  uri: z.string().nullable(),
  name: z.string().nullable(),
})

const albumSchema = z.object({
  id: z.string().nullable(),
  uri: z.string().nullable(),
  name: z.string().nullable(),
  album_type: z.string().nullable().optional(),
  release_date: z.string().nullable().optional(),
  release_date_precision: z.enum(['day', 'month', 'year']).nullable().optional(),
  images: z
    .array(z.object({ url: z.string() }))
    .nullable()
    .optional(),
  artists: z.array(artistSchema).nullable().optional(),
})

const trackSchema = z
  .object({
    id: z.string().nullable(),
    uri: z.string().nullable(),
    name: z.string().nullable(),
    duration_ms: z.number().int().nonnegative().nullable().optional(),
    explicit: z.boolean().nullable().optional(),
    external_ids: z.object({ isrc: z.string().nullable().optional() }).nullable().optional(),
    external_urls: z.object({ spotify: z.string().nullable().optional() }).nullable().optional(),
    artists: z.array(artistSchema).nullable().optional(),
    album: albumSchema.nullable().optional(),
  })
  .passthrough()

const recentlyPlayedSchema = z.object({
  items: z.array(z.object({ played_at: z.string(), track: trackSchema })),
  next: z.string().nullable().optional(),
  cursors: z.object({ after: z.string().nullable().optional() }).nullable().optional(),
})
const tracksSchema = z.object({ tracks: z.array(trackSchema.nullable()) })

const playerSchema = z
  .object({
    timestamp: z.number().int().nonnegative().nullable().optional(),
    progress_ms: z.number().int().nonnegative().nullable().optional(),
    is_playing: z.boolean().nullable().optional(),
    currently_playing_type: z.string().nullable().optional(),
    item: z.union([episodeSchema, trackSchema]).nullable().optional(),
  })
  .passthrough()

export interface SpotifySavedEpisodeObservation {
  readonly addedAt: string
  readonly canonicalUrl: string | null
  readonly description: string | null
  readonly durationMs: number | null
  readonly episodeId: string | null
  readonly episodeUri: string | null
  readonly fullyPlayed: boolean | null
  readonly imageUrl: string | null
  readonly releaseDate: string | null
  readonly releaseDatePrecision: 'day' | 'month' | 'year' | null
  readonly resumePositionMs: number | null
  readonly showId: string | null
  readonly showName: string | null
  readonly showUri: string | null
  readonly title: string | null
}
export type SpotifyEpisodeCatalogObservation = Omit<SpotifySavedEpisodeObservation, 'addedAt'>

export interface SpotifySavedEpisodesPage {
  readonly bytes: Uint8Array
  readonly contentType: string
  readonly items: readonly SpotifySavedEpisodeObservation[]
  readonly nextOffset: number | null
  readonly offset: number
  readonly total: number
}

export interface SpotifySavedShowObservation {
  readonly addedAt: string
  readonly canonicalUrl: string | null
  readonly description: string | null
  readonly imageUrl: string | null
  readonly languages: readonly string[]
  readonly name: string | null
  readonly publisher: string | null
  readonly showId: string | null
  readonly showUri: string | null
  readonly totalEpisodes: number | null
}

export interface SpotifySavedShowsPage {
  readonly bytes: Uint8Array
  readonly contentType: string
  readonly items: readonly SpotifySavedShowObservation[]
  readonly nextOffset: number | null
  readonly offset: number
  readonly total: number
}

export interface SpotifyTrackObservation {
  readonly album: {
    readonly albumType: string | null
    readonly artists: readonly SpotifyArtistObservation[]
    readonly id: string | null
    readonly imageUrl: string | null
    readonly name: string | null
    readonly releaseDate: string | null
    readonly releaseDatePrecision: 'day' | 'month' | 'year' | null
    readonly uri: string | null
  } | null
  readonly artists: readonly SpotifyArtistObservation[]
  readonly canonicalUrl: string | null
  readonly durationMs: number | null
  readonly explicit: boolean | null
  readonly id: string | null
  readonly isrc: string | null
  readonly name: string | null
  readonly uri: string | null
}

export interface SpotifyArtistObservation {
  readonly id: string | null
  readonly name: string | null
  readonly uri: string | null
}

export interface SpotifyRecentlyPlayedItem {
  readonly playedAt: string
  readonly track: SpotifyTrackObservation
}

export interface SpotifyRecentlyPlayedPage {
  readonly after: string | null
  readonly bytes: Uint8Array
  readonly contentType: string
  readonly items: readonly SpotifyRecentlyPlayedItem[]
}

export interface SpotifyTracksResponse {
  readonly bytes: Uint8Array
  readonly contentType: string
  readonly tracks: readonly (SpotifyTrackObservation | null)[]
}

export interface SpotifyPlayerObservation {
  readonly bytes: Uint8Array
  readonly contentType: string | null
  readonly empty: boolean
  readonly isPlaying: boolean | null
  readonly item: SpotifySavedEpisodeObservation | SpotifyTrackObservation | null
  readonly itemType: 'episode' | 'track' | 'unknown' | null
  readonly progressMs: number | null
  readonly sourceTimestamp: string | null
}

export class SpotifyApiError extends Error {
  readonly status: number
  readonly retryAfterSeconds: number | null

  constructor(message: string, status: number, retryAfterSeconds: number | null = null) {
    super(message)
    this.name = 'SpotifyApiError'
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export async function fetchSpotifySavedEpisodesResponse(input: {
  accessToken: string
  offset?: number
  fetch?: typeof fetch
}): Promise<{ bytes: Uint8Array; contentType: string }> {
  const fetcher = input.fetch ?? fetch
  const url = new URL('https://api.spotify.com/v1/me/episodes')
  url.searchParams.set('limit', '50')
  url.searchParams.set('offset', String(input.offset ?? 0))
  const response = await fetcher(url, { headers: { Authorization: `Bearer ${input.accessToken}` } })
  if (!response.ok) {
    throw new SpotifyApiError(`Spotify saved episodes returned ${response.status}`, response.status)
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  return { bytes, contentType: response.headers.get('content-type') ?? 'application/json' }
}
export function parseSpotifySavedEpisodesPage(response: {
  bytes: Uint8Array
  contentType: string
}): SpotifySavedEpisodesPage {
  const { bytes, contentType } = response
  const page = pageSchema.parse(JSON.parse(new TextDecoder().decode(bytes)))
  const consumed = page.offset + page.items.length
  if (page.items.length === 0 && consumed < page.total) {
    throw new Error('Spotify returned an empty page before the saved episode scan completed')
  }
  return {
    bytes,
    contentType,
    items: page.items.map(({ added_at: addedAt, episode }) => ({
      addedAt,
      canonicalUrl: episode.external_urls?.spotify ?? null,
      description: episode.description ?? null,
      durationMs: episode.duration_ms,
      episodeId: episode.id,
      episodeUri: episode.uri,
      fullyPlayed: episode.resume_point?.fully_played ?? null,
      imageUrl: episode.images?.[0]?.url ?? null,
      releaseDate: episode.release_date ?? null,
      releaseDatePrecision: episode.release_date_precision ?? null,
      resumePositionMs: episode.resume_point?.resume_position_ms ?? null,
      showId: episode.show?.id ?? null,
      showName: episode.show?.name ?? null,
      showUri: episode.show?.uri ?? null,
      title: episode.name,
    })),
    nextOffset: page.next === null || consumed >= page.total ? null : consumed,
    offset: page.offset,
    total: page.total,
  }
}

export async function fetchSpotifySavedEpisodesPage(
  input: Parameters<typeof fetchSpotifySavedEpisodesResponse>[0],
): Promise<SpotifySavedEpisodesPage> {
  return parseSpotifySavedEpisodesPage(await fetchSpotifySavedEpisodesResponse(input))
}

function track(value: z.infer<typeof trackSchema>): SpotifyTrackObservation {
  return {
    album:
      value.album == null
        ? null
        : {
            albumType: value.album.album_type ?? null,
            artists: (value.album.artists ?? []).map((artist) => ({
              id: artist.id,
              name: artist.name,
              uri: artist.uri,
            })),
            id: value.album.id,
            imageUrl: value.album.images?.[0]?.url ?? null,
            name: value.album.name,
            releaseDate: value.album.release_date ?? null,
            releaseDatePrecision: value.album.release_date_precision ?? null,
            uri: value.album.uri,
          },
    artists: (value.artists ?? []).map((artist) => ({
      id: artist.id,
      name: artist.name,
      uri: artist.uri,
    })),
    canonicalUrl: value.external_urls?.spotify ?? null,
    durationMs: value.duration_ms ?? null,
    explicit: value.explicit ?? null,
    id: value.id,
    isrc: value.external_ids?.isrc ?? null,
    name: value.name,
    uri: value.uri,
  }
}

async function spotifyResponse(input: {
  accessToken: string
  fetch?: typeof fetch
  url: URL
  allowEmpty?: boolean
}): Promise<{ bytes: Uint8Array; contentType: string | null; status: number }> {
  const response = await (input.fetch ?? fetch)(input.url, {
    headers: { Authorization: `Bearer ${input.accessToken}` },
  })
  if (!response.ok && !(input.allowEmpty && response.status === 204)) {
    const retryAfter = Number(response.headers.get('retry-after'))
    throw new SpotifyApiError(
      `Spotify API returned ${response.status}`,
      response.status,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
    )
  }
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get('content-type'),
    status: response.status,
  }
}

export async function fetchSpotifyTrackResponse(input: {
  accessToken: string
  id: string
  fetch?: typeof fetch
}): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (!/^[A-Za-z0-9]+$/.test(input.id)) throw new TypeError('Invalid Spotify track ID')
  const url = new URL(`https://api.spotify.com/v1/tracks/${input.id}`)
  const response = await spotifyResponse({ ...input, url })
  return {
    bytes: response.bytes,
    contentType: response.contentType ?? 'application/json',
  }
}

export function parseSpotifyTrackResponse(response: {
  bytes: Uint8Array
}): SpotifyTrackObservation {
  return track(trackSchema.parse(JSON.parse(new TextDecoder().decode(response.bytes))))
}

export async function fetchSpotifyEpisodeResponse(input: {
  accessToken: string
  id: string
  fetch?: typeof fetch
}): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (!/^[A-Za-z0-9]+$/.test(input.id)) throw new TypeError('Invalid Spotify episode ID')
  const url = new URL(`https://api.spotify.com/v1/episodes/${input.id}`)
  const response = await spotifyResponse({ ...input, url })
  return {
    bytes: response.bytes,
    contentType: response.contentType ?? 'application/json',
  }
}

export function parseSpotifyEpisodeResponse(response: {
  bytes: Uint8Array
}): SpotifyEpisodeCatalogObservation {
  const value = episodeSchema.parse(JSON.parse(new TextDecoder().decode(response.bytes)))
  return {
    canonicalUrl: value.external_urls?.spotify ?? null,
    description: value.description ?? null,
    durationMs: value.duration_ms,
    episodeId: value.id,
    episodeUri: value.uri,
    fullyPlayed: value.resume_point?.fully_played ?? null,
    imageUrl: value.images?.[0]?.url ?? null,
    releaseDate: value.release_date ?? null,
    releaseDatePrecision: value.release_date_precision ?? null,
    resumePositionMs: value.resume_point?.resume_position_ms ?? null,
    showId: value.show?.id ?? null,
    showName: value.show?.name ?? null,
    showUri: value.show?.uri ?? null,
    title: value.name,
  }
}

export async function fetchSpotifySavedShowsResponse(input: {
  accessToken: string
  offset?: number
  fetch?: typeof fetch
}): Promise<{ bytes: Uint8Array; contentType: string }> {
  const url = new URL('https://api.spotify.com/v1/me/shows')
  url.searchParams.set('limit', '50')
  url.searchParams.set('offset', String(input.offset ?? 0))
  const response = await spotifyResponse({ ...input, url })
  return { bytes: response.bytes, contentType: response.contentType ?? 'application/json' }
}

export function parseSpotifySavedShowsPage(response: {
  bytes: Uint8Array
  contentType: string
}): SpotifySavedShowsPage {
  const page = savedShowsPageSchema.parse(JSON.parse(new TextDecoder().decode(response.bytes)))
  const consumed = page.offset + page.items.length
  if (page.items.length === 0 && consumed < page.total)
    throw new Error('Spotify returned an empty page before the saved show scan completed')
  return {
    bytes: response.bytes,
    contentType: response.contentType ?? 'application/json',
    items: page.items.map(({ added_at: addedAt, show }) => ({
      addedAt,
      canonicalUrl: show.external_urls?.spotify ?? null,
      description: show.description ?? null,
      imageUrl: show.images?.[0]?.url ?? null,
      languages: show.languages ?? [],
      name: show.name,
      publisher: show.publisher ?? null,
      showId: show.id,
      showUri: show.uri,
      totalEpisodes: show.total_episodes ?? null,
    })),
    nextOffset: page.next === null || consumed >= page.total ? null : consumed,
    offset: page.offset,
    total: page.total,
  }
}

export async function fetchSpotifyRecentlyPlayedResponse(input: {
  accessToken: string
  after?: string
  fetch?: typeof fetch
}): Promise<{ bytes: Uint8Array; contentType: string }> {
  const url = new URL('https://api.spotify.com/v1/me/player/recently-played')
  url.searchParams.set('limit', '50')
  if (input.after) url.searchParams.set('after', input.after)
  const response = await spotifyResponse({ ...input, url })
  return { bytes: response.bytes, contentType: response.contentType ?? 'application/json' }
}

export function parseSpotifyRecentlyPlayed(response: {
  bytes: Uint8Array
  contentType: string
}): SpotifyRecentlyPlayedPage {
  const page = recentlyPlayedSchema.parse(JSON.parse(new TextDecoder().decode(response.bytes)))
  return {
    after: page.cursors?.after ?? null,
    bytes: response.bytes,
    contentType: response.contentType ?? 'application/json',
    items: page.items.map((item) => ({ playedAt: item.played_at, track: track(item.track) })),
  }
}

export async function fetchSpotifyTracksResponse(input: {
  accessToken: string
  ids: readonly string[]
  fetch?: typeof fetch
}): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (input.ids.length < 1 || input.ids.length > 50)
    throw new TypeError('Spotify track lookup requires between 1 and 50 IDs')
  const url = new URL('https://api.spotify.com/v1/tracks')
  url.searchParams.set('ids', input.ids.join(','))
  const response = await spotifyResponse({ ...input, url })
  return { bytes: response.bytes, contentType: response.contentType ?? 'application/json' }
}

export function parseSpotifyTracks(response: {
  bytes: Uint8Array
  contentType: string
}): SpotifyTracksResponse {
  const body = tracksSchema.parse(JSON.parse(new TextDecoder().decode(response.bytes)))
  return {
    bytes: response.bytes,
    contentType: response.contentType ?? 'application/json',
    tracks: body.tracks.map((value) => (value === null ? null : track(value))),
  }
}

export async function fetchSpotifyPlayerResponse(input: {
  accessToken: string
  fetch?: typeof fetch
}): Promise<{ bytes: Uint8Array; contentType: string | null; status: number }> {
  const url = new URL('https://api.spotify.com/v1/me/player')
  return spotifyResponse({ ...input, url, allowEmpty: true })
}

export function parseSpotifyPlayer(response: {
  bytes: Uint8Array
  contentType: string | null
  status: number
}): SpotifyPlayerObservation {
  if (response.status === 204 || response.bytes.byteLength === 0) {
    return {
      bytes: response.bytes,
      contentType: response.contentType,
      empty: true,
      isPlaying: null,
      item: null,
      itemType: null,
      progressMs: null,
      sourceTimestamp: null,
    }
  }
  const value = playerSchema.parse(JSON.parse(new TextDecoder().decode(response.bytes)))
  const type =
    value.currently_playing_type === 'episode'
      ? 'episode'
      : value.currently_playing_type === 'track'
        ? 'track'
        : 'unknown'
  let item: SpotifySavedEpisodeObservation | SpotifyTrackObservation | null = null
  if (value.item != null && type === 'track') item = track(trackSchema.parse(value.item))
  if (value.item != null && type === 'episode') {
    const episode = episodeSchema.parse(value.item)
    item = {
      addedAt: '',
      canonicalUrl: episode.external_urls?.spotify ?? null,
      description: episode.description ?? null,
      durationMs: episode.duration_ms,
      episodeId: episode.id,
      episodeUri: episode.uri,
      fullyPlayed: episode.resume_point?.fully_played ?? null,
      imageUrl: episode.images?.[0]?.url ?? null,
      releaseDate: episode.release_date ?? null,
      releaseDatePrecision: episode.release_date_precision ?? null,
      resumePositionMs: episode.resume_point?.resume_position_ms ?? null,
      showId: episode.show?.id ?? null,
      showName: episode.show?.name ?? null,
      showUri: episode.show?.uri ?? null,
      title: episode.name,
    }
  }
  return {
    bytes: response.bytes,
    contentType: response.contentType,
    empty: false,
    isPlaying: value.is_playing ?? null,
    item,
    itemType: type,
    progressMs: value.progress_ms ?? null,
    sourceTimestamp: value.timestamp == null ? null : new Date(value.timestamp).toISOString(),
  }
}

export async function fetchSpotifySavedShowsPage(
  input: Parameters<typeof fetchSpotifySavedShowsResponse>[0],
) {
  return parseSpotifySavedShowsPage(await fetchSpotifySavedShowsResponse(input))
}
export async function fetchSpotifyRecentlyPlayed(
  input: Parameters<typeof fetchSpotifyRecentlyPlayedResponse>[0],
) {
  return parseSpotifyRecentlyPlayed(await fetchSpotifyRecentlyPlayedResponse(input))
}
export async function fetchSpotifyTracks(input: Parameters<typeof fetchSpotifyTracksResponse>[0]) {
  return parseSpotifyTracks(await fetchSpotifyTracksResponse(input))
}
export async function fetchSpotifyPlayer(input: Parameters<typeof fetchSpotifyPlayerResponse>[0]) {
  return parseSpotifyPlayer(await fetchSpotifyPlayerResponse(input))
}
