import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

interface FieldStats {
  missing: number
  nulls: number
  types: Set<string>
}

interface SpotifyHistoryFile {
  name: string
  rows: unknown[]
}

interface DateRange {
  earliest: string | null
  latest: string | null
}

function valueType(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function increment(counts: Map<string, number>, value: unknown): void {
  const key = value === null ? 'null' : typeof value === 'string' ? value : String(value)
  counts.set(key, (counts.get(key) ?? 0) + 1)
}

function sortedCounts(counts: Map<string, number>): Record<string, number> {
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

function observeDate(range: DateRange, value: unknown): void {
  if (typeof value !== 'string') return
  if (range.earliest === null || value < range.earliest) range.earliest = value
  if (range.latest === null || value > range.latest) range.latest = value
}

function roundedHours(milliseconds: number): number {
  return Math.round((milliseconds / 3_600_000) * 10) / 10
}

export function inspectSpotifyHistoryFiles(files: SpotifyHistoryFile[]) {
  const fieldNames = new Set([
    'ts',
    'username',
    'platform',
    'ms_played',
    'conn_country',
    'ip_addr_decrypted',
    'user_agent_decrypted',
    'master_metadata_track_name',
    'master_metadata_album_artist_name',
    'master_metadata_album_album_name',
    'spotify_track_uri',
    'episode_name',
    'episode_show_name',
    'spotify_episode_uri',
    'reason_start',
    'reason_end',
    'shuffle',
    'skipped',
    'offline',
    'offline_timestamp',
    'incognito_mode',
  ])
  const fieldStats = new Map<string, FieldStats>()
  const reasonStart = new Map<string, number>()
  const reasonEnd = new Map<string, number>()
  const podcastReasonStart = new Map<string, number>()
  const podcastReasonEnd = new Map<string, number>()
  const exactHashes = new Map<string, string>()
  const episodeUris = new Set<string>()
  const positiveEpisodeUris = new Set<string>()
  const trackUris = new Set<string>()
  const audiobookUris = new Set<string>()
  const audiobookChapterUris = new Set<string>()
  const usernames = new Set<string>()
  const ipAddresses = new Set<string>()
  const totalRange: DateRange = { earliest: null, latest: null }
  const podcastRange: DateRange = { earliest: null, latest: null }
  const fileRows: Record<string, number> = {}
  let totalRows = 0
  let exactDuplicateRows = 0
  let exactDuplicateRowsWithinFile = 0
  let exactDuplicateRowsAcrossFiles = 0
  let episodeSegments = 0
  let positiveEpisodeSegments = 0
  let shortPositiveEpisodeSegments = 0
  let episodeSegmentsWithoutUri = 0
  let podcastMilliseconds = 0
  let trackSegments = 0
  let positiveTrackSegments = 0
  let trackMilliseconds = 0
  let audiobookSegments = 0
  let positiveAudiobookSegments = 0
  let audiobookMilliseconds = 0
  let unidentifiedSegments = 0
  let ambiguousSegments = 0
  let offlineRows = 0
  let incognitoRows = 0
  let skippedRows = 0

  for (const file of files) {
    fileRows[file.name] = file.rows.length
    for (const value of file.rows) {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`${file.name} contains a non-object history row`)
      }
      const row = value as Record<string, unknown>
      totalRows += 1

      for (const field of Object.keys(row)) {
        if (fieldNames.has(field)) continue
        fieldNames.add(field)
        fieldStats.set(field, {
          missing: totalRows - 1,
          nulls: 0,
          types: new Set<string>(),
        })
      }

      for (const field of fieldNames) {
        const stats = fieldStats.get(field) ?? { missing: 0, nulls: 0, types: new Set<string>() }
        if (!(field in row)) {
          stats.missing += 1
        } else {
          const type = valueType(row[field])
          stats.types.add(type)
          if (row[field] === null) stats.nulls += 1
        }
        fieldStats.set(field, stats)
      }

      const rowHash = createHash('sha256').update(JSON.stringify(row)).digest('hex')
      const firstFile = exactHashes.get(rowHash)
      if (firstFile !== undefined) {
        exactDuplicateRows += 1
        if (firstFile === file.name) exactDuplicateRowsWithinFile += 1
        else exactDuplicateRowsAcrossFiles += 1
      } else {
        exactHashes.set(rowHash, file.name)
      }

      observeDate(totalRange, row.ts)
      increment(reasonStart, row.reason_start)
      increment(reasonEnd, row.reason_end)
      if (typeof row.username === 'string') usernames.add(row.username)
      if (typeof row.ip_addr_decrypted === 'string') ipAddresses.add(row.ip_addr_decrypted)
      if (typeof row.ip_addr === 'string') ipAddresses.add(row.ip_addr)
      if (row.offline === true) offlineRows += 1
      if (row.incognito_mode === true) incognitoRows += 1
      if (row.skipped === true) skippedRows += 1

      const milliseconds = typeof row.ms_played === 'number' ? row.ms_played : 0
      const hasEpisode =
        typeof row.spotify_episode_uri === 'string' ||
        typeof row.episode_name === 'string' ||
        typeof row.episode_show_name === 'string'
      const hasTrack =
        typeof row.spotify_track_uri === 'string' ||
        typeof row.master_metadata_track_name === 'string'
      const hasAudiobook =
        typeof row.audiobook_uri === 'string' ||
        typeof row.audiobook_title === 'string' ||
        typeof row.audiobook_chapter_uri === 'string' ||
        typeof row.audiobook_chapter_title === 'string'
      const classifiedTypes = Number(hasEpisode) + Number(hasTrack) + Number(hasAudiobook)

      if (classifiedTypes > 1) ambiguousSegments += 1
      else if (hasEpisode) {
        episodeSegments += 1
        observeDate(podcastRange, row.ts)
        increment(podcastReasonStart, row.reason_start)
        increment(podcastReasonEnd, row.reason_end)
        if (typeof row.spotify_episode_uri === 'string') episodeUris.add(row.spotify_episode_uri)
        else episodeSegmentsWithoutUri += 1
        if (milliseconds > 0) {
          positiveEpisodeSegments += 1
          podcastMilliseconds += milliseconds
          if (typeof row.spotify_episode_uri === 'string')
            positiveEpisodeUris.add(row.spotify_episode_uri)
          if (milliseconds < 30_000) shortPositiveEpisodeSegments += 1
        }
      } else if (hasTrack) {
        trackSegments += 1
        if (typeof row.spotify_track_uri === 'string') trackUris.add(row.spotify_track_uri)
        if (milliseconds > 0) {
          positiveTrackSegments += 1
          trackMilliseconds += milliseconds
        }
      } else if (hasAudiobook) {
        audiobookSegments += 1
        if (typeof row.audiobook_uri === 'string') audiobookUris.add(row.audiobook_uri)
        if (typeof row.audiobook_chapter_uri === 'string')
          audiobookChapterUris.add(row.audiobook_chapter_uri)
        if (milliseconds > 0) {
          positiveAudiobookSegments += 1
          audiobookMilliseconds += milliseconds
        }
      } else {
        unidentifiedSegments += 1
      }
    }
  }

  return {
    files: {
      count: files.length,
      rows: Object.fromEntries(Object.entries(fileRows).sort(([a], [b]) => a.localeCompare(b))),
    },
    rows: {
      total: totalRows,
      exactDuplicates: exactDuplicateRows,
      exactDuplicatesWithinFile: exactDuplicateRowsWithinFile,
      exactDuplicatesAcrossFiles: exactDuplicateRowsAcrossFiles,
      dateRange: totalRange,
      offline: offlineRows,
      incognito: incognitoRows,
      skipped: skippedRows,
      distinctUsernames: usernames.size,
      distinctIpAddresses: ipAddresses.size,
    },
    podcasts: {
      segments: episodeSegments,
      positiveSegments: positiveEpisodeSegments,
      shortPositiveSegmentsUnder30Seconds: shortPositiveEpisodeSegments,
      uniqueEpisodeUris: episodeUris.size,
      uniqueEpisodesWithPositivePlayback: positiveEpisodeUris.size,
      uniqueEpisodesWithOnlyZeroPlayback: episodeUris.size - positiveEpisodeUris.size,
      segmentsWithoutEpisodeUri: episodeSegmentsWithoutUri,
      dateRange: podcastRange,
      listeningHours: roundedHours(podcastMilliseconds),
      reasonStart: sortedCounts(podcastReasonStart),
      reasonEnd: sortedCounts(podcastReasonEnd),
    },
    songs: {
      segments: trackSegments,
      positiveSegments: positiveTrackSegments,
      uniqueTrackUris: trackUris.size,
      listeningHours: roundedHours(trackMilliseconds),
    },
    audiobooks: {
      segments: audiobookSegments,
      positiveSegments: positiveAudiobookSegments,
      uniqueAudiobookUris: audiobookUris.size,
      uniqueChapterUris: audiobookChapterUris.size,
      listeningHours: roundedHours(audiobookMilliseconds),
    },
    classification: {
      ambiguousSegments,
      unidentifiedSegments,
    },
    allReasonStart: sortedCounts(reasonStart),
    allReasonEnd: sortedCounts(reasonEnd),
    fieldShape: Object.fromEntries(
      [...fieldStats.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([field, stats]) => [
          field,
          { missing: stats.missing, nulls: stats.nulls, types: [...stats.types].sort() },
        ]),
    ),
  }
}

export async function inspectSpotifyHistoryDirectory(directory: string) {
  const names = (await readdir(directory))
    .filter((name) => /^Streaming_History_(Audio|Video)_.*\.json$/.test(name))
    .sort()
  if (names.length === 0) throw new Error('No Spotify Extended Streaming History JSON files found')

  const files: SpotifyHistoryFile[] = []
  for (const name of names) {
    const parsed: unknown = JSON.parse(await readFile(join(directory, name), 'utf8'))
    if (!Array.isArray(parsed)) throw new Error(`${name} does not contain a JSON array`)
    files.push({ name, rows: parsed })
  }
  return inspectSpotifyHistoryFiles(files)
}
