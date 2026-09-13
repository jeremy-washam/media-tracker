import { z } from 'zod'

const resumePointSchema = z
  .object({
    fully_played: z.boolean(),
    resume_position_ms: z.number().int().nonnegative().nullable(),
  })
  .nullable()
  .optional()

const episodeSchema = z.object({
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

const pageSchema = z.object({
  items: z.array(z.object({ added_at: z.string(), episode: episodeSchema })),
  limit: z.number().int().positive(),
  next: z.string().nullable().optional(),
  offset: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
})

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

export interface SpotifySavedEpisodesPage {
  readonly bytes: Uint8Array
  readonly contentType: string
  readonly items: readonly SpotifySavedEpisodeObservation[]
  readonly nextOffset: number | null
  readonly offset: number
  readonly total: number
}

export class SpotifyApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'SpotifyApiError'
    this.status = status
  }
}

export async function fetchSpotifySavedEpisodesPage(input: {
  accessToken: string
  offset?: number
  fetch?: typeof fetch
}): Promise<SpotifySavedEpisodesPage> {
  const fetcher = input.fetch ?? fetch
  const url = new URL('https://api.spotify.com/v1/me/episodes')
  url.searchParams.set('limit', '50')
  url.searchParams.set('offset', String(input.offset ?? 0))
  const response = await fetcher(url, { headers: { Authorization: `Bearer ${input.accessToken}` } })
  if (!response.ok) {
    throw new SpotifyApiError(`Spotify saved episodes returned ${response.status}`, response.status)
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  const page = pageSchema.parse(JSON.parse(new TextDecoder().decode(bytes)))
  const consumed = page.offset + page.items.length
  if (page.items.length === 0 && consumed < page.total) {
    throw new Error('Spotify returned an empty page before the saved episode scan completed')
  }
  return {
    bytes,
    contentType: response.headers.get('content-type') ?? 'application/json',
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
