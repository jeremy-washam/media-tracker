import { z } from 'zod'

import type { SavedEpisode } from './saved-episodes.ts'

const resumePointSchema = z
  .object({
    fully_played: z.boolean(),
    resume_position_ms: z.number().int().nonnegative().nullable(),
  })
  .nullable()
  .optional()

const savedEpisodesPageSchema = z.object({
  items: z.array(
    z.object({
      added_at: z.string(),
      episode: z.object({
        duration_ms: z.number().int().nonnegative().nullable(),
        id: z.string().nullable(),
        name: z.string().nullable(),
        resume_point: resumePointSchema,
        show: z.object({ name: z.string().nullable() }),
        uri: z.string().nullable(),
      }),
    }),
  ),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
})

export class SpotifyApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'SpotifyApiError'
    this.status = status
  }
}

export async function fetchSavedEpisodes(
  accessToken: string,
): Promise<{ episodes: SavedEpisode[]; totalReported: number }> {
  const episodes: SavedEpisode[] = []
  let offset = 0
  let totalReported = 0

  do {
    const url = new URL('https://api.spotify.com/v1/me/episodes')
    url.searchParams.set('limit', '50')
    url.searchParams.set('offset', String(offset))

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!response.ok) {
      throw new SpotifyApiError(
        `Spotify saved episodes returned ${response.status}`,
        response.status,
      )
    }

    const page = savedEpisodesPageSchema.parse(await response.json())
    totalReported = page.total

    for (const item of page.items) {
      const resumePoint = item.episode.resume_point
      episodes.push({
        addedAt: item.added_at,
        durationMs: item.episode.duration_ms,
        fullyPlayed: resumePoint?.fully_played ?? null,
        hasExternalIdentity: item.episode.id !== null && item.episode.uri !== null,
        resumePositionMs: resumePoint?.resume_position_ms ?? null,
        show: item.episode.show.name,
        title: item.episode.name,
      })
    }

    if (page.items.length === 0 && episodes.length < totalReported) {
      throw new Error('Spotify returned an empty page before the saved episode scan completed')
    }
    offset += page.items.length
  } while (offset < totalReported)

  return { episodes, totalReported }
}
