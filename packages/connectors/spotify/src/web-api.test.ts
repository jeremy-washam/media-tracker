import { describe, expect, it, vi } from 'vitest'

import {
  fetchSpotifyPlayer,
  fetchSpotifyRecentlyPlayed,
  fetchSpotifySavedEpisodesPage,
  fetchSpotifySavedShowsPage,
  fetchSpotifyTracks,
  SpotifyApiError,
} from './web-api.ts'

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
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      void input
      return new Response(body, { headers: { 'content-type': 'application/json' } })
    })
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

describe('Spotify Podcasts and Music APIs', () => {
  it('retains saved-show fields and raw response bytes', async () => {
    const body = JSON.stringify({
      items: [
        {
          added_at: '2026-01-01T00:00:00Z',
          show: {
            id: 'show1',
            uri: 'spotify:show:show1',
            name: 'Show',
            publisher: 'Publisher',
            description: 'Description',
            total_episodes: 42,
            languages: ['en'],
            images: [],
            external_urls: { spotify: 'https://open.spotify.com/show/show1' },
          },
        },
      ],
      limit: 50,
      next: null,
      offset: 0,
      total: 1,
    })
    const result = await fetchSpotifySavedShowsPage({
      accessToken: 'secret',
      fetch: async () => new Response(body, { headers: { 'content-type': 'application/json' } }),
    })
    expect(new TextDecoder().decode(result.bytes)).toBe(body)
    expect(result.items[0]).toMatchObject({
      showId: 'show1',
      publisher: 'Publisher',
      totalEpisodes: 42,
    })
  })

  it('distinguishes a track from an episode in the current player', async () => {
    const body = JSON.stringify({
      timestamp: 1_700_000_000_000,
      progress_ms: 234,
      is_playing: true,
      currently_playing_type: 'track',
      item: {
        id: 'track1',
        uri: 'spotify:track:track1',
        name: 'Track',
        duration_ms: 1000,
        explicit: false,
        artists: [{ id: 'artist1', uri: 'spotify:artist:artist1', name: 'Artist' }],
        album: {
          id: 'album1',
          uri: 'spotify:album:album1',
          name: 'Album',
          images: [],
          artists: [],
        },
      },
    })
    const result = await fetchSpotifyPlayer({
      accessToken: 'secret',
      fetch: async () => new Response(body, { headers: { 'content-type': 'application/json' } }),
    })
    expect(result.itemType).toBe('track')
    expect(result.item).toMatchObject({ uri: 'spotify:track:track1', name: 'Track' })
  })

  it('retains recent-track metadata used by album and artist rollups', async () => {
    const body = JSON.stringify({
      items: [
        {
          played_at: '2026-01-01T00:00:00Z',
          track: {
            id: 'track1',
            uri: 'spotify:track:track1',
            name: 'Track',
            artists: [{ id: 'artist1', uri: 'spotify:artist:artist1', name: 'Artist' }],
            album: {
              id: 'album1',
              uri: 'spotify:album:album1',
              name: 'Album',
              images: [],
              artists: [],
            },
          },
        },
      ],
      next: null,
      cursors: { after: '1' },
    })
    const result = await fetchSpotifyRecentlyPlayed({
      accessToken: 'secret',
      fetch: async () => new Response(body, { headers: { 'content-type': 'application/json' } }),
    })
    expect(result.items[0]?.track).toMatchObject({
      name: 'Track',
      album: { name: 'Album' },
      artists: [{ name: 'Artist' }],
    })
  })

  it('batches catalog track metadata while retaining the exact response bytes', async () => {
    const body = JSON.stringify({
      tracks: [
        {
          id: 'track1',
          uri: 'spotify:track:track1',
          name: 'Track',
          duration_ms: 1234,
          explicit: false,
          external_ids: { isrc: 'US-SYN-26-00001' },
          external_urls: { spotify: 'https://open.spotify.com/track/track1' },
          artists: [{ id: 'artist1', uri: 'spotify:artist:artist1', name: 'Artist' }],
          album: {
            id: 'album1',
            uri: 'spotify:album:album1',
            name: 'Album',
            album_type: 'album',
            release_date: '2026',
            release_date_precision: 'year',
            images: [{ url: 'https://example.invalid/album.jpg' }],
            artists: [{ id: 'artist1', uri: 'spotify:artist:artist1', name: 'Artist' }],
          },
        },
        null,
      ],
    })
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      void input
      return new Response(body, { headers: { 'content-type': 'application/json' } })
    })
    const result = await fetchSpotifyTracks({
      accessToken: 'secret',
      ids: ['track1', 'missing'],
      fetch: fetcher,
    })

    expect(new TextDecoder().decode(result.bytes)).toBe(body)
    expect(result.tracks).toHaveLength(2)
    expect(result.tracks[0]).toMatchObject({
      id: 'track1',
      durationMs: 1234,
      isrc: 'US-SYN-26-00001',
      album: { id: 'album1', releaseDatePrecision: 'year' },
    })
    expect(result.tracks[1]).toBeNull()
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('ids=track1%2Cmissing')
  })
})
