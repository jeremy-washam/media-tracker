import { describe, expect, it } from 'vitest'

import {
  classifySavedEpisode,
  summarizeSavedEpisodes,
  type SavedEpisode,
} from './saved-episodes.ts'

function episode(overrides: Partial<SavedEpisode> = {}): SavedEpisode {
  return {
    addedAt: '2026-01-01T00:00:00Z',
    durationMs: 1_000_000,
    fullyPlayed: false,
    hasExternalIdentity: true,
    resumePositionMs: 0,
    show: 'Synthetic Show',
    title: 'Synthetic Episode',
    ...overrides,
  }
}

describe('Spotify saved episode classification', () => {
  it('keeps an untouched saved episode in Queue', () => {
    expect(classifySavedEpisode(episode())).toBe('queue_unplayed')
  })

  it('puts any partially played episode in Archive', () => {
    expect(classifySavedEpisode(episode({ resumePositionMs: 1 }))).toBe('archive_partially_played')
  })

  it('puts fully played episodes in Archive even when the resume position is zero', () => {
    expect(classifySavedEpisode(episode({ fullyPlayed: true }))).toBe('archive_fully_played')
  })

  it('summarizes titles without source IDs or credentials', () => {
    const summary = summarizeSavedEpisodes(
      [episode(), episode({ fullyPlayed: true, title: 'Completed Synthetic Episode' })],
      2,
    )

    expect(summary.classification).toEqual({
      archive: 1,
      fullyPlayed: 1,
      partiallyPlayed: 0,
      queue: 1,
      unresolved: 0,
      unavailableMetadata: 0,
      missingExternalIdentity: 0,
    })
    expect(summary.archive[0]?.title).toBe('Completed Synthetic Episode')
    expect(JSON.stringify(summary)).not.toContain('token')
    expect(JSON.stringify(summary)).not.toContain('spotify:episode:')
  })

  it('preserves unavailable saved episodes without inventing metadata', () => {
    const summary = summarizeSavedEpisodes(
      [episode({ durationMs: null, resumePositionMs: null, show: null, title: null })],
      1,
    )

    expect(summary.classification).toMatchObject({
      queue: 0,
      unresolved: 1,
      unavailableMetadata: 1,
    })
    expect(summary.unresolved[0]).toMatchObject({
      durationMs: null,
      disposition: 'unresolved_playback',
      percentPlayed: null,
      show: null,
      title: null,
    })
  })
})
