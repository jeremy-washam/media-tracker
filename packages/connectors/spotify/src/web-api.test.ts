import { describe, expect, it, vi } from 'vitest'

import { fetchSpotifySavedEpisodesPage, SpotifyApiError } from './web-api.ts'

describe('Spotify saved episodes API', () => {
  it('returns exact response bytes and nullable observations', async () => {
    const body = JSON.stringify({
      items: [
        {
          added_at: '2026-01-01T00:00:00Z',
          episode: {
            id: 'episode123',
            uri: 'spotify:episode:episode123',
            name: 'Synthetic Episode',
            description: 'Synthetic description',
            duration_ms: 1000,
            external_urls: { spotify: 'https://open.spotify.com/episode/episode123' },
            images: [{ url: 'https://example.invalid/image.jpg' }],
            release_date: '2026-01-01',
            release_date_precision: 'day',
            resume_point: { fully_played: false, resume_position_ms: 1 },
            show: { id: 'show123', uri: 'spotify:show:show123', name: 'Synthetic Show' },
          },
        },
      ],
      limit: 50,
      next: null,
      offset: 0,
      total: 1,
    })
    const fetcher = vi.fn(
      async () => new Response(body, { headers: { 'content-type': 'application/json' } }),
    )
    const result = await fetchSpotifySavedEpisodesPage({ accessToken: 'secret', fetch: fetcher })

    expect(new TextDecoder().decode(result.bytes)).toBe(body)
    expect(result.items[0]).toMatchObject({
      episodeId: 'episode123',
      resumePositionMs: 1,
      showName: 'Synthetic Show',
    })
    expect(result.nextOffset).toBeNull()
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('surfaces authentication failures without including the token', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 401 }))
    const promise = fetchSpotifySavedEpisodesPage({ accessToken: 'do-not-print', fetch: fetcher })
    await expect(promise).rejects.toBeInstanceOf(SpotifyApiError)
    await expect(promise).rejects.not.toThrow('do-not-print')
  })
})
