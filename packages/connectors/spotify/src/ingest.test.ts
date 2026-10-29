import { describe, expect, it } from 'vitest'

import { latestPositivePodcastSegments, parseSpotifyHistoryMember } from './ingest.ts'

function bytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value))
}

describe('Spotify Extended Streaming History ingestion', () => {
  it('retains duplicate podcast segments by array position and defers other media', () => {
    const podcast = {
      ts: '2026-01-01T00:00:00Z',
      ms_played: 100,
      episode_name: 'Synthetic Episode',
      episode_show_name: 'Synthetic Show',
      spotify_episode_uri: 'spotify:episode:episode123',
    }
    const result = parseSpotifyHistoryMember(
      'history/Streaming_History_Audio_2026.json',
      bytes([
        podcast,
        podcast,
        { ms_played: 20, spotify_track_uri: 'spotify:track:track123' },
        { ms_played: 20, audiobook_uri: 'spotify:audiobook:book123' },
      ]),
    )

    expect(result).toMatchObject({ rows: 4, songRows: 1, audiobookRows: 1 })
    expect(result.podcastSegments).toHaveLength(2)
    expect(result.podcastSegments[0]?.recordPath).not.toBe(result.podcastSegments[1]?.recordPath)
  })

  it('admits only positive playback with a usable episode URI and keeps the latest timestamp', () => {
    const result = parseSpotifyHistoryMember(
      'Streaming_History_Audio_2026.json',
      bytes([
        {
          ts: '2026-01-01T00:00:00Z',
          ms_played: 50,
          episode_name: 'First title',
          spotify_episode_uri: 'spotify:episode:episode123',
        },
        {
          ts: '2026-02-01T00:00:00Z',
          ms_played: 1,
          episode_name: 'Latest title',
          spotify_episode_uri: 'spotify:episode:episode123',
        },
        {
          ts: '2026-03-01T00:00:00Z',
          ms_played: 0,
          spotify_episode_uri: 'spotify:episode:zero123',
        },
        { ts: '2026-04-01T00:00:00Z', ms_played: 10, episode_name: 'No identity' },
      ]),
    )

    const latest = latestPositivePodcastSegments(result.podcastSegments)
    expect([...latest.keys()]).toEqual(['spotify:episode:episode123'])
    expect(latest.get('spotify:episode:episode123')).toMatchObject({
      episodeName: 'Latest title',
      millisecondsPlayed: 1,
      occurredAt: '2026-02-01T00:00:00.000Z',
    })
  })
})

it.each(['2026-02-30T12:00:00Z', '2026-04-31T00:00:00Z', '2026-01-01T24:00:00Z'])(
  'preserves unknown export occurrence time for invalid source instant %s',
  (ts) => {
    const result = parseSpotifyHistoryMember(
      'Streaming_History_Audio_2026.json',
      bytes([
        { ts, ms_played: 100, spotify_episode_uri: 'spotify:episode:episode123' },
        { ts, ms_played: 100, spotify_track_uri: 'spotify:track:track123' },
      ]),
    )
    expect(result.podcastSegments[0]?.occurredAt).toBeNull()
    expect(result.songSegments[0]?.occurredAt).toBeNull()
    expect(result.rows).toBe(2)
  },
)
