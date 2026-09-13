import { z } from 'zod'

const historyRowSchema = z
  .object({
    ts: z.string().nullable().optional(),
    ms_played: z.number().finite().nullable().optional(),
    episode_name: z.string().nullable().optional(),
    episode_show_name: z.string().nullable().optional(),
    spotify_episode_uri: z.string().nullable().optional(),
    spotify_track_uri: z.string().nullable().optional(),
    audiobook_uri: z.string().nullable().optional(),
  })
  .passthrough()

export interface SpotifyPodcastSegment {
  readonly episodeId: string | null
  readonly episodeName: string | null
  readonly episodeUri: string | null
  readonly memberName: string
  readonly millisecondsPlayed: number
  readonly occurredAt: string | null
  readonly recordPath: string
  readonly rowIndex: number
  readonly showName: string | null
}

export interface SpotifyHistoryMemberProjection {
  readonly audiobookRows: number
  readonly podcastSegments: readonly SpotifyPodcastSegment[]
  readonly rows: number
  readonly songRows: number
  readonly unidentifiedRows: number
}

function normalizedInstant(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const milliseconds = Date.parse(value)
  return Number.isNaN(milliseconds) ? null : new Date(milliseconds).toISOString()
}

function episodeId(uri: string | null): string | null {
  if (uri === null) return null
  const match = /^spotify:episode:([A-Za-z0-9]+)$/.exec(uri)
  return match?.[1] ?? null
}

function recordPath(memberName: string, index: number): string {
  return `$.members[${JSON.stringify(memberName)}][${index}]`
}

export function isSpotifyHistoryMember(name: string): boolean {
  return /(?:^|\/)Streaming_History_(?:Audio|Video)_.+\.json$/i.test(name)
}

export function parseSpotifyHistoryMember(
  name: string,
  bytes: Uint8Array,
): SpotifyHistoryMemberProjection {
  if (!isSpotifyHistoryMember(name)) throw new TypeError(`${name} is not a Spotify history member`)
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes))
  if (!Array.isArray(value)) throw new TypeError(`${name} must contain a JSON array`)

  const podcastSegments: SpotifyPodcastSegment[] = []
  let songRows = 0
  let audiobookRows = 0
  let unidentifiedRows = 0

  for (const [index, input] of value.entries()) {
    const row = historyRowSchema.parse(input)
    const episodeUri = row.spotify_episode_uri ?? null
    const hasPodcast =
      episodeUri !== null || row.episode_name != null || row.episode_show_name != null
    const hasSong = row.spotify_track_uri != null
    const hasAudiobook = row.audiobook_uri != null

    if (hasPodcast) {
      podcastSegments.push({
        episodeId: episodeId(episodeUri),
        episodeName: row.episode_name ?? null,
        episodeUri,
        memberName: name,
        millisecondsPlayed: Math.max(0, row.ms_played ?? 0),
        occurredAt: normalizedInstant(row.ts),
        recordPath: recordPath(name, index),
        rowIndex: index,
        showName: row.episode_show_name ?? null,
      })
    } else if (hasSong) {
      songRows += 1
    } else if (hasAudiobook) {
      audiobookRows += 1
    } else {
      unidentifiedRows += 1
    }
  }

  return {
    audiobookRows,
    podcastSegments,
    rows: value.length,
    songRows,
    unidentifiedRows,
  }
}

export function latestPositivePodcastSegments(
  segments: readonly SpotifyPodcastSegment[],
): Map<string, SpotifyPodcastSegment> {
  const latest = new Map<string, SpotifyPodcastSegment>()
  for (const segment of segments) {
    if (
      segment.episodeId === null ||
      segment.episodeUri === null ||
      segment.millisecondsPlayed <= 0
    )
      continue
    const previous = latest.get(segment.episodeUri)
    if (
      previous === undefined ||
      (segment.occurredAt !== null &&
        (previous.occurredAt === null || segment.occurredAt > previous.occurredAt))
    ) {
      latest.set(segment.episodeUri, segment)
    }
  }
  return latest
}
