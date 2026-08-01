export interface SavedEpisode {
  addedAt: string
  durationMs: number | null
  fullyPlayed: boolean | null
  hasExternalIdentity: boolean
  resumePositionMs: number | null
  show: string | null
  title: string | null
}

export type SavedEpisodeDisposition =
  'archive_fully_played' | 'archive_partially_played' | 'queue_unplayed' | 'unresolved_playback'

export interface ProbeEpisode extends SavedEpisode {
  disposition: SavedEpisodeDisposition
  percentPlayed: number | null
}

export function classifySavedEpisode(
  episode: Pick<SavedEpisode, 'fullyPlayed' | 'resumePositionMs'>,
): SavedEpisodeDisposition {
  if (episode.fullyPlayed === true) return 'archive_fully_played'
  if ((episode.resumePositionMs ?? 0) > 0) return 'archive_partially_played'
  if (episode.resumePositionMs === null) return 'unresolved_playback'
  return 'queue_unplayed'
}

export function toProbeEpisode(episode: SavedEpisode): ProbeEpisode {
  const percentPlayed =
    episode.resumePositionMs === null || episode.durationMs === null || episode.durationMs <= 0
      ? null
      : Math.round((episode.resumePositionMs / episode.durationMs) * 1000) / 10

  return {
    ...episode,
    disposition: classifySavedEpisode(episode),
    percentPlayed,
  }
}

export function summarizeSavedEpisodes(episodes: SavedEpisode[], totalReported: number) {
  const probed = episodes.map(toProbeEpisode)
  const archive = probed.filter((episode) => episode.disposition.startsWith('archive_'))
  const queue = probed.filter((episode) => episode.disposition === 'queue_unplayed')
  const unresolved = probed.filter((episode) => episode.disposition === 'unresolved_playback')

  return {
    totalReported,
    rowsReturned: probed.length,
    classification: {
      archive: archive.length,
      fullyPlayed: archive.filter((episode) => episode.disposition === 'archive_fully_played')
        .length,
      partiallyPlayed: archive.filter(
        (episode) => episode.disposition === 'archive_partially_played',
      ).length,
      queue: queue.length,
      unresolved: unresolved.length,
      unavailableMetadata: probed.filter(
        (episode) => episode.title === null || episode.show === null || episode.durationMs === null,
      ).length,
      missingExternalIdentity: probed.filter((episode) => !episode.hasExternalIdentity).length,
    },
    archive,
    queue,
    unresolved,
  }
}
