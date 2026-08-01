import { describe, expect, it } from 'vitest'

import { inspectSpotifyHistoryFiles } from './history.ts'

const base = {
  ts: '2026-01-01T00:00:00Z',
  username: 'synthetic-user',
  platform: 'synthetic-platform',
  ms_played: 12_000,
  conn_country: 'US',
  ip_addr_decrypted: '192.0.2.1',
  user_agent_decrypted: 'synthetic-agent',
  master_metadata_track_name: null,
  master_metadata_album_artist_name: null,
  master_metadata_album_album_name: null,
  spotify_track_uri: null,
  episode_name: 'Synthetic Episode',
  episode_show_name: 'Synthetic Show',
  spotify_episode_uri: 'spotify:episode:synthetic',
  reason_start: 'clickrow',
  reason_end: 'endplay',
  shuffle: false,
  skipped: false,
  offline: false,
  offline_timestamp: null,
  incognito_mode: false,
}

describe('Spotify Extended Streaming History inspection', () => {
  it('counts positive podcast segments and exact duplicates without exposing sensitive values', () => {
    const summary = inspectSpotifyHistoryFiles([
      {
        name: 'Streaming_History_Audio_2026.json',
        rows: [
          { ...base, future_field: 'synthetic-value' },
          { ...base, future_field: 'synthetic-value' },
        ],
      },
    ])

    expect(summary.rows).toMatchObject({
      total: 2,
      exactDuplicates: 1,
      exactDuplicatesWithinFile: 1,
      exactDuplicatesAcrossFiles: 0,
      distinctUsernames: 1,
      distinctIpAddresses: 1,
    })
    expect(summary.podcasts).toMatchObject({
      segments: 2,
      positiveSegments: 2,
      uniqueEpisodeUris: 1,
      uniqueEpisodesWithPositivePlayback: 1,
    })
    expect(JSON.stringify(summary)).not.toContain('synthetic-user')
    expect(JSON.stringify(summary)).not.toContain('192.0.2.1')
    expect(JSON.stringify(summary)).not.toContain('Synthetic Episode')
    expect(summary.fieldShape.future_field).toEqual({
      missing: 0,
      nulls: 0,
      types: ['string'],
    })
    expect(JSON.stringify(summary)).not.toContain('synthetic-value')
  })

  it('classifies audiobook rows separately from unidentified media', () => {
    const summary = inspectSpotifyHistoryFiles([
      {
        name: 'Streaming_History_Audio_2026.json',
        rows: [
          {
            ...base,
            episode_name: null,
            episode_show_name: null,
            spotify_episode_uri: null,
            audiobook_title: 'Synthetic Audiobook',
            audiobook_uri: 'spotify:audiobook:synthetic',
            audiobook_chapter_title: 'Synthetic Chapter',
            audiobook_chapter_uri: 'spotify:chapter:synthetic',
          },
        ],
      },
    ])

    expect(summary.audiobooks).toMatchObject({
      segments: 1,
      positiveSegments: 1,
      uniqueAudiobookUris: 1,
      uniqueChapterUris: 1,
    })
    expect(summary.classification.unidentifiedSegments).toBe(0)
    expect(JSON.stringify(summary)).not.toContain('Synthetic Audiobook')
  })
})
