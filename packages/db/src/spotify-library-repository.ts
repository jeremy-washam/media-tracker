import {
  matchesQueryFingerprint,
  queryFingerprint as hashQueryFingerprint,
} from './query-fingerprint'
import type { DatabaseClient, DatabaseStatement, DatabaseValue } from './database'

// Spotify also returns audiobooks from /me/shows with type=show. Only exclude
// the explicit author/narrator metadata block; titles and publishers are not
// classification evidence. Keep unknown descriptions and the source rows.
const podcastShowPredicate = `NOT (
  COALESCE(s.description,'') LIKE 'Author(s):%'
  AND INSTR(REPLACE(COALESCE(s.description,''),char(13),''),char(10)||'Narrator(s):')>0
)`
const followingCount = `(SELECT COUNT(DISTINCT ss.show_id)
  FROM spotify_saved_shows ss JOIN spotify_podcast_shows s ON s.id=ss.show_id
  WHERE ss.active=1 AND ${podcastShowPredicate})`

function statement(database: DatabaseClient, query: string, values: readonly DatabaseValue[] = []) {
  return database.prepare(query).bind(...values)
}

function safeLike(value: string): string {
  return `%${value.replace(/[\\%_]/g, '\\$&')}%`
}

function ftsQuery(value: string): string {
  return value
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .map((term) => `"${term.replaceAll('"', '""')}"*`)
    .join(' AND ')
}

interface LibraryCursor {
  sort: string | number | null
  id: string
}

async function cursor(value: string | undefined, key: string): Promise<LibraryCursor | null> {
  if (value === undefined) return null
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as {
      sort?: unknown
      id?: unknown
      key?: unknown
    }
    if (
      !(await matchesQueryFingerprint(parsed.key, key)) ||
      typeof parsed.id !== 'string' ||
      parsed.id.length === 0 ||
      parsed.id.length > 256 ||
      (parsed.sort !== null &&
        typeof parsed.sort !== 'string' &&
        (typeof parsed.sort !== 'number' || !Number.isFinite(parsed.sort)))
    )
      throw new Error()
    return { sort: parsed.sort as LibraryCursor['sort'], id: parsed.id }
  } catch {
    throw new TypeError('Invalid Spotify Library pagination cursor')
  }
}

function cursorWhere(value: LibraryCursor | null, direction: 'asc' | 'desc') {
  if (value === null) return { sql: '', values: [] as DatabaseValue[] }
  if (value.sort === null)
    return {
      sql: '(page_sort IS NULL AND page_id>?)',
      values: [value.id] as DatabaseValue[],
    }
  return {
    sql: `(page_sort IS NULL OR page_sort${direction === 'asc' ? '>' : '<'}? OR (page_sort=? AND page_id>?))`,
    values: [value.sort, value.sort, value.id] as DatabaseValue[],
  }
}

function nextCursor(
  rows: readonly Record<string, string | number | null>[],
  limit: number,
  key: string,
) {
  if (rows.length <= limit) return null
  const last = rows[limit - 1]!
  return encodeURIComponent(JSON.stringify({ sort: last.page_sort, id: last.page_id, key }))
}

export interface SpotifyPodcastObservationProjection {
  id: string
  sourceRecordId: string
  connectionId: string
  mediaItemId: string | null
  episodeUri: string | null
  episodeId: string | null
  occurredAt: string | null
  millisecondsPlayed: number
  episodeTitle: string | null
  showName: string | null
  reasonStart: string | null
  reasonEnd: string | null
  skipped: boolean | null
  parserVersion: string
  updatedAt: string
}

export interface SpotifySongObservationProjection {
  id: string
  sourceRecordId: string
  connectionId: string
  mediaItemId: string
  trackUri: string
  trackId: string
  occurredAt: string | null
  millisecondsPlayed: number | null
  sourceKind: 'export' | 'recent_api'
  skipped: boolean | null
  trackName: string | null
  artistName: string | null
  albumName: string | null
  reasonStart: string | null
  reasonEnd: string | null
  parserVersion: string
  updatedAt: string
}

export interface SavedEpisodeProjection {
  connectionId: string
  sourceRecordId: string
  mediaItemId: string
  episodeUri: string
  episodeId: string
  addedAt: string | null
  resumePositionMs: number | null
  fullyPlayed: boolean | null
  observedAt: string
  title: string | null
  showId: string | null
  showUri: string | null
  showName: string | null
  description: string | null
  imageUrl: string | null
  canonicalUrl: string | null
  publishedAt: string | null
  publishedPrecision: string | null
  durationMs: number | null
}

export interface SavedShowProjection {
  connectionId: string
  sourceRecordId: string
  id: string
  showId: string
  showUri: string
  addedAt: string | null
  observedAt: string
  name: string | null
  publisher: string | null
  description: string | null
  imageUrl: string | null
  canonicalUrl: string | null
  languages: readonly string[]
  totalEpisodes: number | null
}

export interface TrackMetadataProjection {
  mediaItemId: string
  trackUri: string
  trackId: string
  title: string | null
  artists: readonly { id: string; uri: string; name: string | null }[]
  album: {
    id: string
    uri: string
    name: string | null
    albumType: string | null
    releaseDate: string | null
    releaseDatePrecision: string | null
    imageUrl: string | null
    artists: readonly { id: string; uri: string; name: string | null }[]
  } | null
  canonicalUrl: string | null
  durationMs: number | null
  explicit: boolean | null
  isrc: string | null
  observedAt: string
}

export type PodcastView = 'archive' | 'queue' | 'following'
export interface PodcastsListInput {
  view: PodcastView
  q?: string
  show?: string[]
  following?: 'all' | 'following' | 'not_following'
  dateFrom?: string
  dateTo?: string
  dateUnknown?: boolean
  publishedFrom?: string
  publishedTo?: string
  publishedUnknown?: boolean
  publisher?: string[]
  language?: string[]
  libraryEpisodes?: Array<'archive' | 'queue' | 'none'>
  duration?: string[]
  sort?: string
  direction?: 'asc' | 'desc'
  limit: number
  cursor?: string
}

export interface MusicListInput {
  view: 'tracks' | 'albums' | 'artists'
  q?: string
  from?: string
  to?: string
  source?: 'all' | 'export' | 'recent_api'
  minPlaybacks?: number
  playbackCount?: 'any' | 'once' | '2to9' | '10to49' | '50plus'
  metadata?: 'any' | 'current' | 'export_only' | 'unavailable'
  artist?: string[]
  album?: string[]
  explicit?: 'any' | 'yes' | 'no' | 'unknown'
  albumType?: 'any' | 'album' | 'single' | 'compilation' | 'other' | 'unknown'
  sort?: string
  direction?: 'asc' | 'desc'
  limit: number
  cursor?: string
}

export class SqlSpotifyLibraryRepository {
  constructor(private readonly database: DatabaseClient) {}

  async listMusicFilterOptions(
    input: MusicListInput,
    facet: 'artist' | 'album',
    optionQ: string | undefined,
    limit: number,
    cursorValue?: string,
  ) {
    if (input.view === 'artists' || (input.view === 'albums' && facet === 'album'))
      throw new TypeError('Facet is not valid for this Music view')
    const scope = this.musicOccurrenceScope(input)
    const clauses: string[] = []
    const values: DatabaseValue[] = []
    if (input.q) {
      if (input.view === 'tracks') {
        clauses.push(
          '(t.media_item_id IN (SELECT media_item_id FROM music_search WHERE music_search MATCH ?) OR t.isrc=? OR t.spotify_track_uri=? OR t.spotify_track_id=?)',
        )
        values.push(ftsQuery(input.q), input.q, input.q, input.q)
      } else {
        clauses.push(
          "(a.name LIKE ? ESCAPE '\\' OR a.artist_text LIKE ? ESCAPE '\\' OR a.spotify_album_uri=? OR a.spotify_album_id=?)",
        )
        values.push(safeLike(input.q), safeLike(input.q), input.q, input.q)
      }
    }
    if (input.view === 'tracks') {
      if (input.minPlaybacks) {
        clauses.push('m.playback_count>=?')
        values.push(input.minPlaybacks)
      }
      if (input.playbackCount === 'once') clauses.push('m.playback_count=1')
      if (input.playbackCount === '2to9') clauses.push('m.playback_count BETWEEN 2 AND 9')
      if (input.playbackCount === '10to49') clauses.push('m.playback_count BETWEEN 10 AND 49')
      if (input.playbackCount === '50plus') clauses.push('m.playback_count>=50')
      if (input.metadata === 'current') clauses.push("t.metadata_state='current'")
      if (input.metadata === 'export_only') clauses.push("t.metadata_state='export_only'")
      if (input.metadata === 'unavailable')
        clauses.push("t.metadata_state IN ('unavailable','expired','error')")
      if (input.explicit === 'yes') clauses.push('t.explicit=1')
      if (input.explicit === 'no') clauses.push('t.explicit=0')
      if (input.explicit === 'unknown') clauses.push('t.explicit IS NULL')
      if (facet === 'artist' && input.album?.length) {
        clauses.push(`t.album_id IN (${input.album.map(() => '?').join(',')})`)
        values.push(...input.album)
      }
      if (facet === 'album' && input.artist?.length) {
        clauses.push(
          `EXISTS(SELECT 1 FROM spotify_song_track_artists selected WHERE selected.media_item_id=t.media_item_id AND selected.artist_id IN (${input.artist.map(() => '?').join(',')}))`,
        )
        values.push(...input.artist)
      }
    } else {
      if (input.albumType === 'album') clauses.push("a.album_type='album'")
      if (input.albumType === 'single') clauses.push("a.album_type='single'")
      if (input.albumType === 'compilation') clauses.push("a.album_type='compilation'")
      if (input.albumType === 'other')
        clauses.push(
          "a.album_type IS NOT NULL AND a.album_type NOT IN ('album','single','compilation')",
        )
      if (input.albumType === 'unknown') clauses.push('a.album_type IS NULL')
      if (input.metadata && !['any', 'current'].includes(input.metadata)) clauses.push('1=0')
    }
    const albumHaving: string[] = []
    const havingValues: DatabaseValue[] = []
    if (input.view === 'albums') {
      if (input.minPlaybacks) {
        albumHaving.push('SUM(playback_count)>=?')
        havingValues.push(input.minPlaybacks)
      }
      if (input.playbackCount === 'once') albumHaving.push('SUM(playback_count)=1')
      if (input.playbackCount === '2to9') albumHaving.push('SUM(playback_count) BETWEEN 2 AND 9')
      if (input.playbackCount === '10to49')
        albumHaving.push('SUM(playback_count) BETWEEN 10 AND 49')
      if (input.playbackCount === '50plus') albumHaving.push('SUM(playback_count)>=50')
    }
    const cte = `${scope.cte}, eligible_tracks AS (
      SELECT t.media_item_id,t.album_id,m.playback_count
      FROM spotify_song_tracks t JOIN matching m ON m.media_item_id=t.media_item_id
      ${input.view === 'albums' ? 'JOIN spotify_song_albums a ON a.id=t.album_id' : ''}
      WHERE ${clauses.length ? clauses.join(' AND ') : '1=1'}
    )${
      input.view === 'albums'
        ? `, eligible_albums AS (
      SELECT album_id FROM eligible_tracks GROUP BY album_id
      ${albumHaving.length ? `HAVING ${albumHaving.join(' AND ')}` : ''}
    )`
        : ''
    }`
    const optionFilter = optionQ?.trim() ? "WHERE option_entity.name LIKE ? ESCAPE '\\'" : ''
    const optionValues: DatabaseValue[] = optionQ?.trim() ? [safeLike(optionQ.trim())] : []
    const table = facet === 'artist' ? 'spotify_song_artists' : 'spotify_song_albums'
    const joins =
      facet === 'artist'
        ? `JOIN spotify_song_track_artists credit ON credit.media_item_id=eligible_tracks.media_item_id
         JOIN ${table} option_entity ON option_entity.id=credit.artist_id`
        : `JOIN ${table} option_entity ON option_entity.id=eligible_tracks.album_id`
    const eligibleAlbumJoin =
      input.view === 'albums'
        ? 'JOIN eligible_albums ON eligible_albums.album_id=eligible_tracks.album_id'
        : ''
    const countBy =
      input.view === 'albums' ? 'eligible_tracks.album_id' : 'eligible_tracks.media_item_id'
    const query = `${cte} SELECT option_entity.id page_id,
      COALESCE(option_entity.name,${facet === 'artist' ? "'Unknown artist'" : "'Untitled album'"}) label,
      COUNT(DISTINCT ${countBy}) page_sort
      FROM eligible_tracks ${eligibleAlbumJoin} ${joins} ${optionFilter}
      GROUP BY option_entity.id`
    const key = await hashQueryFingerprint({
      input: { ...input, cursor: undefined },
      facet,
      optionQ,
      limit,
    })
    const page = cursorWhere(await cursor(cursorValue, key), 'desc')
    const rows = await statement(
      this.database,
      `SELECT * FROM (${query}) WHERE ${page.sql || '1=1'}
       ORDER BY page_sort DESC,page_id LIMIT ?`,
      [...scope.values, ...values, ...havingValues, ...optionValues, ...page.values, limit + 1],
    ).all<Record<string, string | number | null>>()
    return {
      data: rows.results.slice(0, limit).map((row) => ({
        value: String(row.page_id),
        label: String(row.label),
        count: Number(row.page_sort),
      })),
      nextCursor: nextCursor(rows.results, limit, key),
    }
  }

  async coverage() {
    const rows = await statement(
      this.database,
      `SELECT c.name,c.checkpoint_json,c.committed_at FROM sync_cursors c
       JOIN connections connection ON connection.id=c.connection_id
       WHERE connection.source='spotify' AND c.name IN ('saved-episodes','saved-shows','current-player','recent-tracks')
       ORDER BY c.committed_at DESC`,
    ).all<{ name: string; checkpoint_json: string; committed_at: string }>()
    const checkpoints = new Map<string, { value: Record<string, unknown>; committedAt: string }>()
    for (const row of rows.results) {
      if (checkpoints.has(row.name)) continue
      let value: Record<string, unknown> = {}
      try {
        const parsed: unknown = JSON.parse(row.checkpoint_json)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
          value = parsed as Record<string, unknown>
      } catch {
        // A malformed legacy checkpoint cannot prevent Library browsing.
      }
      checkpoints.set(row.name, { value, committedAt: row.committed_at })
    }
    const recent = checkpoints.get('recent-tracks')
    return {
      savedEpisodesAt: checkpoints.get('saved-episodes')?.committedAt ?? null,
      savedShowsAt: checkpoints.get('saved-shows')?.committedAt ?? null,
      playerAt: checkpoints.get('current-player')?.committedAt ?? null,
      recentPollAt: recent?.committedAt ?? null,
      possibleRecentGap: recent?.value.possibleGap === true,
    }
  }

  async projectHistory(input: {
    podcasts: readonly SpotifyPodcastObservationProjection[]
    songs: readonly SpotifySongObservationProjection[]
    rebuild?: boolean
  }): Promise<void> {
    const statements: DatabaseStatement[] = []
    const songItems = new Set<string>()
    for (const value of input.podcasts) {
      statements.push(
        statement(
          this.database,
          `INSERT OR IGNORE INTO spotify_podcast_playback_observations(
             id,source_record_id,connection_id,media_item_id,spotify_episode_uri,occurred_at,
             milliseconds_played,positive,episode_title,show_name,reason_start,reason_end,skipped,parser_version)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            value.id,
            value.sourceRecordId,
            value.connectionId,
            value.mediaItemId,
            value.episodeUri,
            value.occurredAt,
            value.millisecondsPlayed,
            value.millisecondsPlayed > 0 ? 1 : 0,
            value.episodeTitle,
            value.showName,
            value.reasonStart,
            value.reasonEnd,
            value.skipped === null ? null : value.skipped ? 1 : 0,
            value.parserVersion,
          ],
        ),
      )
      if (value.mediaItemId && value.episodeUri && value.episodeId) {
        statements.push(
          statement(
            this.database,
            `INSERT INTO spotify_podcast_episodes(
               media_item_id,spotify_episode_uri,spotify_episode_id,historical_title,show_name,
               canonical_url,updated_at)
             VALUES(?,?,?,?,?,?,?)
             ON CONFLICT(media_item_id) DO UPDATE SET
               historical_title=COALESCE(excluded.historical_title,spotify_podcast_episodes.historical_title),
               show_name=COALESCE(excluded.show_name,spotify_podcast_episodes.show_name),updated_at=excluded.updated_at`,
            [
              value.mediaItemId,
              value.episodeUri,
              value.episodeId,
              value.episodeTitle,
              value.showName,
              `https://open.spotify.com/episode/${value.episodeId}`,
              value.updatedAt,
            ],
          ),
        )
      }
    }
    for (const value of input.songs) {
      songItems.add(value.mediaItemId)
      statements.push(
        statement(
          this.database,
          `INSERT OR IGNORE INTO spotify_song_observations(
             id,source_record_id,connection_id,media_item_id,spotify_track_uri,source_kind,
             occurred_at,milliseconds_played,skipped,track_name,artist_name,album_name,
             reason_start,reason_end,parser_version)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            value.id,
            value.sourceRecordId,
            value.connectionId,
            value.mediaItemId,
            value.trackUri,
            value.sourceKind,
            value.occurredAt,
            value.millisecondsPlayed,
            value.skipped === null ? null : value.skipped ? 1 : 0,
            value.trackName,
            value.artistName,
            value.albumName,
            value.reasonStart,
            value.reasonEnd,
            value.parserVersion,
          ],
        ),
        statement(
          this.database,
          `INSERT INTO spotify_song_tracks(
             media_item_id,spotify_track_uri,spotify_track_id,title,artist_text,album_name,
             canonical_url,latest_played_at,first_played_at,playback_count,observed_ms,
             api_only_count,updated_at)
           VALUES(?,?,?,?,?,?,?,?,?,1,?,?,?)
           ON CONFLICT(media_item_id) DO UPDATE SET
             title=COALESCE(spotify_song_tracks.title,excluded.title),
             artist_text=COALESCE(spotify_song_tracks.artist_text,excluded.artist_text),
             album_name=COALESCE(spotify_song_tracks.album_name,excluded.album_name),
             latest_played_at=MAX(COALESCE(spotify_song_tracks.latest_played_at,excluded.latest_played_at),COALESCE(excluded.latest_played_at,spotify_song_tracks.latest_played_at)),
             first_played_at=MIN(COALESCE(spotify_song_tracks.first_played_at,excluded.first_played_at),COALESCE(excluded.first_played_at,spotify_song_tracks.first_played_at)),
             updated_at=excluded.updated_at`,
          [
            value.mediaItemId,
            value.trackUri,
            value.trackId,
            value.trackName,
            value.artistName,
            value.albumName,
            `https://open.spotify.com/track/${value.trackId}`,
            value.occurredAt,
            value.occurredAt,
            value.millisecondsPlayed ?? 0,
            value.sourceKind === 'recent_api' ? 1 : 0,
            value.updatedAt,
          ],
        ),
      )
    }
    for (const mediaItemId of songItems) {
      statements.push(
        statement(
          this.database,
          `UPDATE spotify_song_tracks SET
             playback_count=(SELECT COUNT(*) FROM spotify_song_observations o WHERE o.media_item_id=?),
             observed_ms=COALESCE((SELECT SUM(o.milliseconds_played) FROM spotify_song_observations o WHERE o.media_item_id=? AND o.source_kind='export'),0),
             api_only_count=(SELECT COUNT(*) FROM spotify_song_observations o WHERE o.media_item_id=? AND o.source_kind='recent_api'),
             latest_played_at=(SELECT MAX(o.occurred_at) FROM spotify_song_observations o WHERE o.media_item_id=?),
             first_played_at=(SELECT MIN(o.occurred_at) FROM spotify_song_observations o WHERE o.media_item_id=?)
           WHERE media_item_id=?`,
          [mediaItemId, mediaItemId, mediaItemId, mediaItemId, mediaItemId, mediaItemId],
        ),
      )
    }
    if (statements.length) await this.database.batch(statements)
    if (input.rebuild ?? true) {
      await this.rebuildPodcastProjection()
      await this.rebuildSearch()
    }
  }

  async upsertSavedEpisodes(values: readonly SavedEpisodeProjection[]): Promise<void> {
    const statements = values.flatMap((value) => [
      statement(
        this.database,
        `INSERT INTO spotify_podcast_episodes(
           media_item_id,spotify_episode_uri,spotify_episode_id,show_id,show_uri,current_title,
           show_name,description,image_url,canonical_url,published_at_value,published_at_precision,
           duration_ms,availability_state,metadata_observed_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'available',?,?)
         ON CONFLICT(media_item_id) DO UPDATE SET
           show_id=COALESCE(excluded.show_id,spotify_podcast_episodes.show_id),
           show_uri=COALESCE(excluded.show_uri,spotify_podcast_episodes.show_uri),
           current_title=COALESCE(excluded.current_title,spotify_podcast_episodes.current_title),
           show_name=COALESCE(excluded.show_name,spotify_podcast_episodes.show_name),
           description=COALESCE(excluded.description,spotify_podcast_episodes.description),
           image_url=COALESCE(excluded.image_url,spotify_podcast_episodes.image_url),
           canonical_url=COALESCE(excluded.canonical_url,spotify_podcast_episodes.canonical_url),
           published_at_value=COALESCE(excluded.published_at_value,spotify_podcast_episodes.published_at_value),
           published_at_precision=COALESCE(excluded.published_at_precision,spotify_podcast_episodes.published_at_precision),
           duration_ms=COALESCE(excluded.duration_ms,spotify_podcast_episodes.duration_ms),
           availability_state='available',metadata_observed_at=excluded.metadata_observed_at,
           updated_at=excluded.updated_at`,
        [
          value.mediaItemId,
          value.episodeUri,
          value.episodeId,
          value.showId,
          value.showUri,
          value.title,
          value.showName,
          value.description,
          value.imageUrl,
          value.canonicalUrl,
          value.publishedAt,
          value.publishedPrecision,
          value.durationMs,
          value.observedAt,
          value.observedAt,
        ],
      ),
      statement(
        this.database,
        `INSERT INTO spotify_saved_episodes(
           connection_id,spotify_episode_uri,media_item_id,source_record_id,added_at,
           resume_position_ms,fully_played,active,first_observed_at,last_observed_at,retired_observed_at)
         VALUES(?,?,?,?,?,?,?,1,?,?,NULL)
         ON CONFLICT(connection_id,spotify_episode_uri) DO UPDATE SET
           media_item_id=excluded.media_item_id,source_record_id=excluded.source_record_id,
           added_at=excluded.added_at,resume_position_ms=excluded.resume_position_ms,
           fully_played=excluded.fully_played,active=1,last_observed_at=excluded.last_observed_at,
           retired_observed_at=NULL`,
        [
          value.connectionId,
          value.episodeUri,
          value.mediaItemId,
          value.sourceRecordId,
          value.addedAt,
          value.resumePositionMs,
          value.fullyPlayed === null ? null : value.fullyPlayed ? 1 : 0,
          value.observedAt,
          value.observedAt,
        ],
      ),
    ])
    if (statements.length) await this.database.batch(statements)
  }

  async finalizeSavedEpisodes(connectionId: string, observedUris: readonly string[], at: string) {
    if (observedUris.length === 0) {
      await statement(
        this.database,
        `UPDATE spotify_saved_episodes SET active=0,retired_observed_at=?,last_observed_at=? WHERE connection_id=? AND active=1`,
        [at, at, connectionId],
      ).run()
    } else {
      await statement(
        this.database,
        `UPDATE spotify_saved_episodes SET active=0,retired_observed_at=?,last_observed_at=?
         WHERE connection_id=? AND active=1 AND spotify_episode_uri NOT IN (SELECT value FROM json_each(?))`,
        [at, at, connectionId, JSON.stringify(observedUris)],
      ).run()
    }
    await this.rebuildPodcastQueue(connectionId, at)
    await this.rebuildPodcastProjection()
    await this.rebuildPodcastSearch()
  }

  async upsertSavedShows(values: readonly SavedShowProjection[]): Promise<void> {
    const statements = values.flatMap((value) => [
      statement(
        this.database,
        `INSERT INTO spotify_podcast_shows(
           id,spotify_show_uri,spotify_show_id,name,publisher,description,image_url,canonical_url,
           languages_json,total_episodes,availability_state,metadata_observed_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,'available',?,?)
         ON CONFLICT(id) DO UPDATE SET name=COALESCE(excluded.name,spotify_podcast_shows.name),
           publisher=COALESCE(excluded.publisher,spotify_podcast_shows.publisher),
           description=COALESCE(excluded.description,spotify_podcast_shows.description),
           image_url=COALESCE(excluded.image_url,spotify_podcast_shows.image_url),
           canonical_url=COALESCE(excluded.canonical_url,spotify_podcast_shows.canonical_url),
           languages_json=excluded.languages_json,total_episodes=COALESCE(excluded.total_episodes,spotify_podcast_shows.total_episodes),
           availability_state='available',metadata_observed_at=excluded.metadata_observed_at,updated_at=excluded.updated_at`,
        [
          value.id,
          value.showUri,
          value.showId,
          value.name,
          value.publisher,
          value.description,
          value.imageUrl,
          value.canonicalUrl,
          JSON.stringify(value.languages),
          value.totalEpisodes,
          value.observedAt,
          value.observedAt,
        ],
      ),
      statement(
        this.database,
        `INSERT INTO spotify_saved_shows(connection_id,show_id,source_record_id,added_at,active,first_observed_at,last_observed_at,retired_observed_at)
         VALUES(?,?,?,?,1,?,?,NULL)
         ON CONFLICT(connection_id,show_id) DO UPDATE SET source_record_id=excluded.source_record_id,
           added_at=excluded.added_at,active=1,last_observed_at=excluded.last_observed_at,retired_observed_at=NULL`,
        [
          value.connectionId,
          value.id,
          value.sourceRecordId,
          value.addedAt,
          value.observedAt,
          value.observedAt,
        ],
      ),
    ])
    if (statements.length) await this.database.batch(statements)
  }

  async recordPlayerObservation(value: {
    id: string
    sourceRecordId: string | null
    connectionId: string
    mediaItemId: string | null
    itemType: 'episode' | 'track' | 'unknown' | null
    itemUri: string | null
    progressMs: number | null
    isPlaying: boolean | null
    sourceTimestamp: string | null
    observedAt: string
    empty: boolean
    episode?: {
      episodeId: string
      episodeUri: string
      title: string | null
      showId: string | null
      showUri: string | null
      showName: string | null
      description: string | null
      imageUrl: string | null
      canonicalUrl: string | null
      publishedAt: string | null
      publishedPrecision: string | null
      durationMs: number | null
    }
  }): Promise<void> {
    const statements: DatabaseStatement[] = []
    if (value.mediaItemId && value.episode) {
      statements.push(
        statement(
          this.database,
          `INSERT INTO spotify_podcast_episodes(media_item_id,spotify_episode_uri,spotify_episode_id,
           show_id,show_uri,current_title,show_name,description,image_url,canonical_url,published_at_value,
           published_at_precision,duration_ms,availability_state,metadata_observed_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'available',?,?)
         ON CONFLICT(media_item_id) DO UPDATE SET current_title=COALESCE(excluded.current_title,spotify_podcast_episodes.current_title),
           show_id=COALESCE(excluded.show_id,spotify_podcast_episodes.show_id),show_uri=COALESCE(excluded.show_uri,spotify_podcast_episodes.show_uri),
           show_name=COALESCE(excluded.show_name,spotify_podcast_episodes.show_name),description=COALESCE(excluded.description,spotify_podcast_episodes.description),
           image_url=COALESCE(excluded.image_url,spotify_podcast_episodes.image_url),duration_ms=COALESCE(excluded.duration_ms,spotify_podcast_episodes.duration_ms),
           metadata_observed_at=excluded.metadata_observed_at,updated_at=excluded.updated_at`,
          [
            value.mediaItemId,
            value.episode.episodeUri,
            value.episode.episodeId,
            value.episode.showId,
            value.episode.showUri,
            value.episode.title,
            value.episode.showName,
            value.episode.description,
            value.episode.imageUrl,
            value.episode.canonicalUrl,
            value.episode.publishedAt,
            value.episode.publishedPrecision,
            value.episode.durationMs,
            value.observedAt,
            value.observedAt,
          ],
        ),
      )
    }
    statements.push(
      statement(
        this.database,
        `INSERT INTO spotify_player_observations(id,source_record_id,connection_id,media_item_id,item_type,
         item_uri,progress_ms,is_playing,source_timestamp,observed_at,empty)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        [
          value.id,
          value.sourceRecordId,
          value.connectionId,
          value.mediaItemId,
          value.itemType,
          value.itemUri,
          value.progressMs,
          value.isPlaying === null ? null : value.isPlaying ? 1 : 0,
          value.sourceTimestamp,
          value.observedAt,
          value.empty ? 1 : 0,
        ],
      ),
    )
    await this.database.batch(statements)
    await this.rebuildPodcastProjection()
  }

  async finalizeSavedShows(connectionId: string, showIds: readonly string[], at: string) {
    if (showIds.length === 0) {
      await statement(
        this.database,
        `UPDATE spotify_saved_shows SET active=0,retired_observed_at=?,last_observed_at=? WHERE connection_id=? AND active=1`,
        [at, at, connectionId],
      ).run()
    } else {
      await statement(
        this.database,
        `UPDATE spotify_saved_shows SET active=0,retired_observed_at=?,last_observed_at=? WHERE connection_id=? AND active=1 AND show_id NOT IN (SELECT value FROM json_each(?))`,
        [at, at, connectionId, JSON.stringify(showIds)],
      ).run()
    }
    await this.rebuildPodcastProjection()
    await this.rebuildPodcastSearch()
  }

  async listTracksNeedingMetadata(
    limit = 50,
    staleBefore?: string,
  ): Promise<{ mediaItemId: string; trackId: string; trackUri: string }[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      throw new TypeError('Spotify metadata backlog limit must be between 1 and 50')
    const result = await statement(
      this.database,
      `SELECT media_item_id,spotify_track_id,spotify_track_uri
       FROM spotify_song_tracks
       WHERE metadata_state IN ('export_only','expired','error')
         OR (? IS NOT NULL AND metadata_observed_at<=?)
       ORDER BY latest_played_at DESC,media_item_id ASC LIMIT ?`,
      [staleBefore ?? null, staleBefore ?? null, limit],
    ).all<{ media_item_id: string; spotify_track_id: string; spotify_track_uri: string }>()
    return result.results.map((row) => ({
      mediaItemId: row.media_item_id,
      trackId: row.spotify_track_id,
      trackUri: row.spotify_track_uri,
    }))
  }

  async listArtistsNeedingArtwork(limit = 12, staleBefore?: string) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      throw new TypeError('Spotify artist backlog limit must be between 1 and 50')
    const rows = await statement(
      this.database,
      `
      SELECT a.id,a.spotify_artist_id,a.spotify_artist_uri
      FROM spotify_song_artists a
      JOIN spotify_song_track_artists ta ON ta.artist_id=a.id
      JOIN spotify_song_tracks t ON t.media_item_id=ta.media_item_id
      WHERE a.artwork_state='pending' OR (? IS NOT NULL AND a.artwork_observed_at<=?)
      GROUP BY a.id ORDER BY SUM(t.playback_count) DESC,a.id LIMIT ?`,
      [staleBefore ?? null, staleBefore ?? null, limit],
    ).all<{ id: string; spotify_artist_id: string; spotify_artist_uri: string }>()
    return rows.results.map((row) => ({
      artistId: row.id,
      spotifyId: row.spotify_artist_id,
      artistUri: row.spotify_artist_uri,
    }))
  }

  async applyArtistArtwork(value: {
    artistId: string
    spotifyId: string
    artistUri: string
    imageUrl: string | null
    observedAt: string
    unavailable?: boolean
  }): Promise<void> {
    await statement(
      this.database,
      `
      UPDATE spotify_song_artists SET image_url=?,artwork_state=?,artwork_observed_at=?,updated_at=?
      WHERE id=? AND spotify_artist_id=? AND spotify_artist_uri=?`,
      [
        value.imageUrl,
        value.unavailable ? 'unavailable' : 'available',
        value.observedAt,
        value.observedAt,
        value.artistId,
        value.spotifyId,
        value.artistUri,
      ],
    ).run()
  }

  async listPodcastEpisodesNeedingMetadata(
    limit = 10,
    staleBefore?: string,
  ): Promise<{ mediaItemId: string; episodeId: string; episodeUri: string }[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      throw new TypeError('Spotify episode metadata backlog limit must be between 1 and 50')
    const result = await statement(
      this.database,
      `SELECT media_item_id,spotify_episode_id,spotify_episode_uri
       FROM spotify_podcast_episodes
       WHERE availability_state IN ('unknown','error')
         OR (? IS NOT NULL AND metadata_observed_at<=?)
       ORDER BY media_item_id LIMIT ?`,
      [staleBefore ?? null, staleBefore ?? null, limit],
    ).all<{ media_item_id: string; spotify_episode_id: string; spotify_episode_uri: string }>()
    return result.results.map((row) => ({
      mediaItemId: row.media_item_id,
      episodeId: row.spotify_episode_id,
      episodeUri: row.spotify_episode_uri,
    }))
  }

  async applyEpisodeCatalogMetadata(value: {
    mediaItemId: string
    episodeId: string
    episodeUri: string
    title: string | null
    showId: string | null
    showUri: string | null
    showName: string | null
    description: string | null
    imageUrl: string | null
    canonicalUrl: string | null
    publishedAt: string | null
    publishedPrecision: string | null
    durationMs: number | null
    observedAt: string
  }): Promise<void> {
    await statement(
      this.database,
      `UPDATE spotify_podcast_episodes SET
         current_title=COALESCE(?,current_title),show_id=COALESCE(?,show_id),
         show_uri=COALESCE(?,show_uri),show_name=COALESCE(?,show_name),
         description=COALESCE(?,description),image_url=COALESCE(?,image_url),
         canonical_url=COALESCE(?,canonical_url),
         published_at_value=COALESCE(?,published_at_value),
         published_at_precision=COALESCE(?,published_at_precision),
         duration_ms=COALESCE(?,duration_ms),availability_state='available',
         metadata_observed_at=?,updated_at=?
       WHERE media_item_id=? AND spotify_episode_uri=? AND spotify_episode_id=?`,
      [
        value.title,
        value.showId,
        value.showUri,
        value.showName,
        value.description,
        value.imageUrl,
        value.canonicalUrl,
        value.publishedAt,
        value.publishedPrecision,
        value.durationMs,
        value.observedAt,
        value.observedAt,
        value.mediaItemId,
        value.episodeUri,
        value.episodeId,
      ],
    ).run()
  }

  async markEpisodeCatalogUnavailable(mediaItemId: string, at: string): Promise<void> {
    await statement(
      this.database,
      `UPDATE spotify_podcast_episodes SET availability_state='unavailable',
       metadata_observed_at=?,updated_at=? WHERE media_item_id=?`,
      [at, at, mediaItemId],
    ).run()
  }

  async catalogBacklogCounts(staleBefore?: string) {
    const row = await statement(
      this.database,
      `SELECT
       (SELECT COUNT(*) FROM spotify_song_tracks WHERE metadata_state IN ('export_only','expired','error') OR (? IS NOT NULL AND metadata_observed_at<=?)) tracks,
       (SELECT COUNT(*) FROM spotify_podcast_episodes WHERE availability_state IN ('unknown','error') OR (? IS NOT NULL AND metadata_observed_at<=?)) episodes,
       (SELECT COUNT(*) FROM spotify_song_artists a WHERE (artwork_state='pending' OR (? IS NOT NULL AND artwork_observed_at<=?)) AND EXISTS
         (SELECT 1 FROM spotify_song_track_artists ta WHERE ta.artist_id=a.id)) artists`,
      [
        staleBefore ?? null,
        staleBefore ?? null,
        staleBefore ?? null,
        staleBefore ?? null,
        staleBefore ?? null,
        staleBefore ?? null,
      ],
    ).first<{ tracks: number; episodes: number; artists: number }>()
    return { tracks: row?.tracks ?? 0, episodes: row?.episodes ?? 0, artists: row?.artists ?? 0 }
  }

  async markTrackMetadataUnavailable(mediaItemIds: readonly string[], at: string): Promise<void> {
    if (mediaItemIds.length === 0) return
    await this.database.batch(
      mediaItemIds.map((id) =>
        statement(
          this.database,
          `UPDATE spotify_song_tracks SET metadata_state='unavailable',metadata_observed_at=?,updated_at=?
           WHERE media_item_id=?`,
          [at, at, id],
        ),
      ),
    )
  }

  async applyTrackMetadata(
    value: TrackMetadataProjection,
    options: { rebuildSearch?: boolean } = {},
  ): Promise<void> {
    const artistText =
      value.artists
        .map((artist) => artist.name)
        .filter(Boolean)
        .join(', ') || null
    const statements: DatabaseStatement[] = [
      statement(
        this.database,
        `UPDATE spotify_song_tracks SET title=COALESCE(?,title),artist_text=COALESCE(?,artist_text),
           album_id=?,album_uri=?,album_name=COALESCE(?,album_name),image_url=?,canonical_url=COALESCE(?,canonical_url),
           duration_ms=?,explicit=?,isrc=?,metadata_state='current',metadata_observed_at=?,updated_at=?
         WHERE media_item_id=?`,
        [
          value.title,
          artistText,
          value.album?.id ?? null,
          value.album?.uri ?? null,
          value.album?.name ?? null,
          value.album?.imageUrl ?? null,
          value.canonicalUrl,
          value.durationMs,
          value.explicit === null ? null : value.explicit ? 1 : 0,
          value.isrc,
          value.observedAt,
          value.observedAt,
          value.mediaItemId,
        ],
      ),
    ]
    if (value.album) {
      statements.push(
        statement(
          this.database,
          `INSERT INTO spotify_song_albums(id,spotify_album_uri,spotify_album_id,name,artist_text,album_type,
             release_date_value,release_date_precision,image_url,canonical_url,metadata_observed_at,updated_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(id) DO UPDATE SET name=excluded.name,artist_text=excluded.artist_text,
             album_type=excluded.album_type,release_date_value=excluded.release_date_value,
             release_date_precision=excluded.release_date_precision,image_url=excluded.image_url,
             metadata_observed_at=excluded.metadata_observed_at,updated_at=excluded.updated_at`,
          [
            value.album.id,
            value.album.uri,
            value.album.id,
            value.album.name,
            value.album.artists
              .map((artist) => artist.name)
              .filter(Boolean)
              .join(', ') || null,
            value.album.albumType,
            value.album.releaseDate,
            value.album.releaseDatePrecision,
            value.album.imageUrl,
            `https://open.spotify.com/album/${value.album.id}`,
            value.observedAt,
            value.observedAt,
          ],
        ),
      )
    }
    for (const [index, artist] of value.artists.entries()) {
      statements.push(
        statement(
          this.database,
          `INSERT INTO spotify_song_artists(id,spotify_artist_uri,spotify_artist_id,name,canonical_url,metadata_observed_at,updated_at)
           VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,
             metadata_observed_at=excluded.metadata_observed_at,updated_at=excluded.updated_at`,
          [
            artist.id,
            artist.uri,
            artist.id,
            artist.name,
            `https://open.spotify.com/artist/${artist.id}`,
            value.observedAt,
            value.observedAt,
          ],
        ),
        statement(
          this.database,
          `INSERT INTO spotify_song_track_artists(media_item_id,artist_id,credit_order) VALUES(?,?,?)
           ON CONFLICT(media_item_id,artist_id) DO UPDATE SET credit_order=excluded.credit_order`,
          [value.mediaItemId, artist.id, index],
        ),
      )
    }
    await this.database.batch(statements)
    if (options.rebuildSearch !== false) await this.rebuildMusicSearch()
  }

  private async rebuildPodcastQueue(connectionId: string, at: string) {
    const candidates = await statement(
      this.database,
      `SELECT se.media_item_id,se.spotify_episode_uri,se.source_record_id,se.added_at,se.first_observed_at
       FROM spotify_saved_episodes se
       WHERE se.connection_id=? AND se.active=1 AND se.resume_position_ms=0 AND COALESCE(se.fully_played,0)=0
         AND NOT EXISTS(SELECT 1 FROM spotify_podcast_playback_observations p
           WHERE p.spotify_episode_uri=se.spotify_episode_uri AND p.positive=1)
         AND NOT EXISTS(SELECT 1 FROM archive_entries a
           WHERE a.media_item_id=se.media_item_id AND a.upstream_state='active')
         AND se.media_item_id IS NOT NULL`,
      [connectionId],
    ).all<{
      media_item_id: string
      spotify_episode_uri: string
      source_record_id: string
      added_at: string | null
      first_observed_at: string
    }>()
    const statements: DatabaseStatement[] = [
      statement(
        this.database,
        `UPDATE queue_entries SET upstream_state='removed',retired_observed_at=?,updated_at=?
         WHERE connection_id=? AND relationship_type='spotify_saved_episode' AND upstream_state='active'`,
        [at, at, connectionId],
      ),
    ]
    for (const row of candidates.results) {
      const id = `spotify_queue_${encodeURIComponent(connectionId)}_${encodeURIComponent(row.spotify_episode_uri)}`
      statements.push(
        statement(
          this.database,
          `INSERT INTO queue_entries(id,media_item_id,connection_id,source_membership_key,relationship_type,
             added_at_value,added_at_precision,added_at_basis,upstream_state,first_observed_at,last_observed_at,
             retired_observed_at,projection_version,created_at,updated_at)
           VALUES(?,?,?,?,?,?,CASE WHEN ? IS NULL THEN NULL ELSE 'instant' END,CASE WHEN ? IS NULL THEN NULL ELSE 'source_asserted' END,
             'active',?,?,NULL,1,?,?)
           ON CONFLICT(connection_id,source_membership_key) DO UPDATE SET media_item_id=excluded.media_item_id,
             added_at_value=excluded.added_at_value,added_at_precision=excluded.added_at_precision,
             added_at_basis=excluded.added_at_basis,upstream_state='active',last_observed_at=excluded.last_observed_at,
             retired_observed_at=NULL,updated_at=excluded.updated_at`,
          [
            id,
            row.media_item_id,
            connectionId,
            `saved-episode:${row.spotify_episode_uri}`,
            'spotify_saved_episode',
            row.added_at,
            row.added_at,
            row.added_at,
            row.first_observed_at,
            at,
            row.first_observed_at,
            at,
          ],
        ),
        statement(
          this.database,
          `INSERT OR IGNORE INTO queue_entry_evidence(id,queue_entry_id,source_record_id,role,linked_at) VALUES(?,?,?,?,?)`,
          [`${id}:${row.source_record_id}`, id, row.source_record_id, 'membership', at],
        ),
      )
    }
    await this.database.batch(statements)
  }

  async rebuildPodcastProjection(): Promise<void> {
    const at = new Date().toISOString()
    await this.database.batch([
      statement(this.database, 'DELETE FROM podcast_library_projection'),
      statement(
        this.database,
        `INSERT INTO podcast_library_projection(
           media_item_id,spotify_episode_uri,title,show_id,show_name,image_url,published_at_value,
           published_at_precision,duration_ms,in_archive,in_queue,saved_episode,following_show,
           latest_activity_at,saved_at,observed_ms,playback_observation_count,availability_state,
           source_refreshed_at,projection_version)
         SELECT e.media_item_id,e.spotify_episode_uri,COALESCE(e.current_title,e.historical_title,m.title),
           e.show_id,COALESCE(e.show_name,m.subtitle),e.image_url,e.published_at_value,e.published_at_precision,
           e.duration_ms,
           EXISTS(SELECT 1 FROM archive_entries a WHERE a.media_item_id=e.media_item_id AND a.upstream_state='active'),
           EXISTS(SELECT 1 FROM queue_entries q WHERE q.media_item_id=e.media_item_id AND q.relationship_type='spotify_saved_episode' AND q.upstream_state='active'),
           EXISTS(SELECT 1 FROM spotify_saved_episodes se WHERE se.media_item_id=e.media_item_id AND se.active=1),
           EXISTS(SELECT 1 FROM spotify_saved_shows ss WHERE ss.show_id=e.show_id AND ss.active=1),
           (SELECT MAX(p.occurred_at) FROM spotify_podcast_playback_observations p WHERE p.media_item_id=e.media_item_id AND p.positive=1),
           (SELECT MAX(se.added_at) FROM spotify_saved_episodes se WHERE se.media_item_id=e.media_item_id AND se.active=1),
           COALESCE((SELECT SUM(p.milliseconds_played) FROM spotify_podcast_playback_observations p WHERE p.media_item_id=e.media_item_id AND p.positive=1),0),
           COALESCE((SELECT COUNT(*) FROM spotify_podcast_playback_observations p WHERE p.media_item_id=e.media_item_id AND p.positive=1),0),
           e.availability_state,?,1
         FROM spotify_podcast_episodes e JOIN media_items m ON m.id=e.media_item_id
         WHERE EXISTS(SELECT 1 FROM archive_entries a WHERE a.media_item_id=e.media_item_id AND a.upstream_state='active')
            OR EXISTS(SELECT 1 FROM spotify_saved_episodes se WHERE se.media_item_id=e.media_item_id AND se.active=1)`,
        [at],
      ),
      statement(
        this.database,
        `INSERT INTO podcast_library_projection(
           media_item_id,spotify_episode_uri,title,show_id,show_name,image_url,published_at_value,
           published_at_precision,duration_ms,in_archive,in_queue,saved_episode,following_show,
           latest_activity_at,saved_at,observed_ms,playback_observation_count,availability_state,
           source_refreshed_at,projection_version)
         SELECT m.id,NULL,m.title,NULL,m.primary_creator_name,m.image_url,m.published_at_value,
           m.published_at_precision,m.duration_ms,1,0,0,0,
           (SELECT MAX(a.consumed_at_value) FROM archive_entries a
             WHERE a.media_item_id=m.id AND a.upstream_state='active'),
           NULL,0,0,'unknown',?,1
         FROM media_items m
         WHERE m.type='podcast_episode'
           AND EXISTS(SELECT 1 FROM archive_entries a
             WHERE a.media_item_id=m.id AND a.upstream_state='active')
           AND NOT EXISTS(SELECT 1 FROM podcast_library_projection p WHERE p.media_item_id=m.id)`,
        [at],
      ),
    ])
  }

  async rebuildSearch(): Promise<void> {
    await this.rebuildPodcastSearch()
    await this.rebuildMusicSearch()
  }

  async rebuildPodcastSearch(): Promise<void> {
    await this.database.batch([
      statement(this.database, 'DELETE FROM podcast_search'),
      statement(
        this.database,
        `INSERT INTO podcast_search(media_item_id,title,show_name,publisher)
         SELECT p.media_item_id,p.title,p.show_name,s.publisher FROM podcast_library_projection p
         LEFT JOIN spotify_podcast_shows s ON s.id=p.show_id`,
      ),
    ])
  }

  async rebuildMusicSearch(): Promise<void> {
    await this.database.batch([
      statement(this.database, 'DELETE FROM music_search'),
      statement(
        this.database,
        `INSERT INTO music_search(media_item_id,title,artist,album,isrc)
         SELECT media_item_id,title,artist_text,album_name,isrc FROM spotify_song_tracks`,
      ),
    ])
  }

  async listPodcasts(input: PodcastsListInput) {
    const [page, summary] = await Promise.all([
      this.listPodcastsItems(input),
      this.summarizePodcasts(input),
    ])
    return { ...page, ...summary }
  }

  async summarizePodcasts(input: PodcastsListInput) {
    return input.view === 'following'
      ? this.summarizeShowsRows(input)
      : this.summarizePodcastsRows(input)
  }

  async listPodcastsItems(input: PodcastsListInput) {
    const key = await hashQueryFingerprint({ ...input, cursor: undefined })
    const anchor = await cursor(input.cursor, key)
    if (input.view === 'following') return this.listShowItems(input, anchor, key)
    const { where, values, search, dateColumn } = this.podcastEpisodeFilters(input)
    const sort = input.sort ?? (input.view === 'archive' ? 'activityAt' : 'savedAt')
    const direction =
      input.direction ?? (['title', 'show', 'relevance'].includes(sort) ? 'asc' : 'desc')
    const order =
      sort === 'relevance' && search
        ? 'rank.score'
        : sort === 'title'
          ? 'p.title'
          : sort === 'show'
            ? 'p.show_name'
            : sort === 'publishedAt'
              ? 'p.published_at_value'
              : sort === 'duration'
                ? 'p.duration_ms'
                : sort === 'observedTime'
                  ? 'p.observed_ms'
                  : dateColumn
    const page = cursorWhere(anchor, direction)
    const rows = await statement(
      this.database,
      `SELECT * FROM (
         SELECT p.*,${order} page_sort,p.media_item_id page_id
         FROM podcast_library_projection p
         ${search ? 'JOIN (SELECT media_item_id,bm25(podcast_search) score FROM podcast_search WHERE podcast_search MATCH ?) rank ON rank.media_item_id=p.media_item_id' : ''}
         WHERE ${where}
       ) WHERE ${page.sql || '1=1'}
       ORDER BY (page_sort IS NULL),page_sort ${direction.toUpperCase()},page_id LIMIT ?`,
      [...(search ? [search] : []), ...values, ...page.values, input.limit + 1],
    ).all<Record<string, string | number | null>>()
    return {
      data: rows.results.slice(0, input.limit).map((row) => this.podcastRow(row)),
      nextCursor: nextCursor(rows.results, input.limit, key),
    }
  }

  private podcastEpisodeFilters(input: PodcastsListInput) {
    const clauses = [input.view === 'archive' ? 'p.in_archive=1' : 'p.in_queue=1']
    const values: DatabaseValue[] = []
    const search = input.q?.trim() ? ftsQuery(input.q) : null
    if (search) {
      clauses.push(
        'p.media_item_id IN (SELECT media_item_id FROM podcast_search WHERE podcast_search MATCH ?)',
      )
      values.push(search)
    }
    if (input.show?.length) {
      clauses.push(`p.show_id IN (${input.show.map(() => '?').join(',')})`)
      values.push(...input.show)
    }
    if (input.following === 'following') clauses.push('p.following_show=1')
    if (input.following === 'not_following') clauses.push('p.following_show=0')
    const dateColumn = input.view === 'archive' ? 'p.latest_activity_at' : 'p.saved_at'
    const dateClauses: string[] = []
    if (input.dateFrom) {
      dateClauses.push(`${dateColumn}>=?`)
      values.push(input.dateFrom)
    }
    if (input.dateTo) {
      dateClauses.push(`${dateColumn}<=?`)
      values.push(`${input.dateTo}T23:59:59.999Z`)
    }
    if (dateClauses.length || input.dateUnknown) {
      const dated = dateClauses.length ? `(${dateClauses.join(' AND ')})` : null
      clauses.push(
        `(${[dated, input.dateUnknown ? `${dateColumn} IS NULL` : null]
          .filter(Boolean)
          .join(' OR ')})`,
      )
    }
    const publishedLower = `CASE p.published_at_precision
      WHEN 'year' THEN p.published_at_value||'-01-01'
      WHEN 'month' THEN p.published_at_value||'-01'
      ELSE SUBSTR(p.published_at_value,1,10) END`
    const publishedUpper = `DATE(${publishedLower},CASE p.published_at_precision
      WHEN 'year' THEN '+1 year' WHEN 'month' THEN '+1 month' ELSE '+1 day' END)`
    const publishedClauses: string[] = []
    if (input.publishedFrom) {
      publishedClauses.push(`${publishedUpper}>?`)
      values.push(input.publishedFrom)
    }
    if (input.publishedTo) {
      publishedClauses.push(`${publishedLower}<=?`)
      values.push(input.publishedTo)
    }
    if (publishedClauses.length || input.publishedUnknown) {
      clauses.push(
        `(${[
          publishedClauses.length ? `(${publishedClauses.join(' AND ')})` : null,
          input.publishedUnknown ? 'p.published_at_value IS NULL' : null,
        ]
          .filter(Boolean)
          .join(' OR ')})`,
      )
    }
    if (input.duration?.length) {
      const durations = input.duration.map((value) => {
        if (value === 'under30') return '(p.duration_ms<1800000)'
        if (value === '30to59') return '(p.duration_ms>=1800000 AND p.duration_ms<3600000)'
        if (value === '1to2hours') return '(p.duration_ms>=3600000 AND p.duration_ms<=7200000)'
        if (value === 'over2hours') return '(p.duration_ms>7200000)'
        return '(p.duration_ms IS NULL)'
      })
      clauses.push(`(${durations.join(' OR ')})`)
    }
    const where = clauses.join(' AND ')
    return { where, values, search, dateColumn }
  }

  private async summarizePodcastsRows(input: PodcastsListInput) {
    const { where, values } = this.podcastEpisodeFilters(input)
    const count = await statement(
      this.database,
      `SELECT COUNT(*) value FROM podcast_library_projection p WHERE ${where}`,
      values,
    ).first<{ value: number }>()

    const counts = await statement(
      this.database,
      `SELECT SUM(in_archive) archive,SUM(in_queue) queue,
       ${followingCount} following
       FROM podcast_library_projection`,
    ).first<{ archive: number; queue: number; following: number }>()
    const total = count?.value ?? 0
    return {
      totalCount: total,
      filteredCount: total,
      sectionCounts: {
        archive: counts?.archive ?? 0,
        queue: counts?.queue ?? 0,
        following: counts?.following ?? 0,
      },
    }
  }

  async listPodcastFilterOptions(
    input: PodcastsListInput,
    facet: 'show' | 'publisher' | 'language',
    optionQ: string | undefined,
    limit: number,
    cursorValue?: string,
  ) {
    if ((input.view === 'following') !== (facet !== 'show'))
      throw new TypeError('Facet is not valid for this Podcast view')
    const clauses: string[] = []
    const values: DatabaseValue[] = []
    let source: string
    let option: string
    if (input.view !== 'following') {
      source = 'podcast_library_projection p LEFT JOIN spotify_podcast_shows s ON s.id=p.show_id'
      clauses.push(input.view === 'archive' ? 'p.in_archive=1' : 'p.in_queue=1')
      clauses.push('p.show_id IS NOT NULL')
      if (input.q?.trim()) {
        clauses.push(
          'p.media_item_id IN (SELECT media_item_id FROM podcast_search WHERE podcast_search MATCH ?)',
        )
        values.push(ftsQuery(input.q))
      }
      if (input.following === 'following') clauses.push('p.following_show=1')
      if (input.following === 'not_following') clauses.push('p.following_show=0')
      const dateColumn = input.view === 'archive' ? 'p.latest_activity_at' : 'p.saved_at'
      const dated: string[] = []
      if (input.dateFrom) {
        dated.push(`${dateColumn}>=?`)
        values.push(input.dateFrom)
      }
      if (input.dateTo) {
        dated.push(`${dateColumn}<=?`)
        values.push(`${input.dateTo}T23:59:59.999Z`)
      }
      if (dated.length || input.dateUnknown)
        clauses.push(
          `(${[dated.length ? `(${dated.join(' AND ')})` : null, input.dateUnknown ? `${dateColumn} IS NULL` : null].filter(Boolean).join(' OR ')})`,
        )
      const publishedLower = `CASE p.published_at_precision WHEN 'year' THEN p.published_at_value||'-01-01' WHEN 'month' THEN p.published_at_value||'-01' ELSE SUBSTR(p.published_at_value,1,10) END`
      const publishedUpper = `DATE(${publishedLower},CASE p.published_at_precision WHEN 'year' THEN '+1 year' WHEN 'month' THEN '+1 month' ELSE '+1 day' END)`
      const published: string[] = []
      if (input.publishedFrom) {
        published.push(`${publishedUpper}>?`)
        values.push(input.publishedFrom)
      }
      if (input.publishedTo) {
        published.push(`${publishedLower}<=?`)
        values.push(input.publishedTo)
      }
      if (published.length || input.publishedUnknown)
        clauses.push(
          `(${[published.length ? `(${published.join(' AND ')})` : null, input.publishedUnknown ? 'p.published_at_value IS NULL' : null].filter(Boolean).join(' OR ')})`,
        )
      if (input.duration?.length) {
        const duration = input.duration.map((value) =>
          value === 'under30'
            ? 'p.duration_ms<1800000'
            : value === '30to59'
              ? '(p.duration_ms>=1800000 AND p.duration_ms<3600000)'
              : value === '1to2hours'
                ? '(p.duration_ms>=3600000 AND p.duration_ms<=7200000)'
                : value === 'over2hours'
                  ? 'p.duration_ms>7200000'
                  : 'p.duration_ms IS NULL',
        )
        clauses.push(`(${duration.join(' OR ')})`)
      }
      option = `SELECT p.show_id page_id,COALESCE(MAX(s.name),MAX(p.show_name),'Unknown show') label,COUNT(*) page_sort FROM ${source} WHERE ${clauses.join(' AND ')} GROUP BY p.show_id`
    } else {
      source = 'spotify_podcast_shows s JOIN spotify_saved_shows ss ON ss.show_id=s.id'
      clauses.push('ss.active=1')
      clauses.push(podcastShowPredicate)
      if (input.q) {
        clauses.push("(s.name LIKE ? ESCAPE '\\' OR s.publisher LIKE ? ESCAPE '\\')")
        values.push(safeLike(input.q), safeLike(input.q))
      }
      const dated: string[] = []
      if (input.dateFrom) {
        dated.push('ss.added_at>=?')
        values.push(input.dateFrom)
      }
      if (input.dateTo) {
        dated.push('ss.added_at<=?')
        values.push(`${input.dateTo}T23:59:59.999Z`)
      }
      if (dated.length || input.dateUnknown)
        clauses.push(
          `(${[dated.length ? `(${dated.join(' AND ')})` : null, input.dateUnknown ? 'ss.added_at IS NULL' : null].filter(Boolean).join(' OR ')})`,
        )
      if (facet !== 'publisher' && input.publisher?.length) {
        const known = input.publisher.filter((value) => value !== '__unknown__')
        clauses.push(
          `(${[known.length ? `s.publisher IN (${known.map(() => '?').join(',')})` : null, input.publisher.includes('__unknown__') ? 's.publisher IS NULL' : null].filter(Boolean).join(' OR ')})`,
        )
        values.push(...known)
      }
      if (facet !== 'language' && input.language?.length) {
        const known = input.language.filter((value) => value !== '__unknown__')
        clauses.push(
          `(${[known.length ? `EXISTS(SELECT 1 FROM json_each(s.languages_json) language WHERE language.value IN (${known.map(() => '?').join(',')}))` : null, input.language.includes('__unknown__') ? "s.languages_json='[]'" : null].filter(Boolean).join(' OR ')})`,
        )
        values.push(...known)
      }
      if (input.libraryEpisodes?.length) {
        const predicates = input.libraryEpisodes.map((value) =>
          value === 'archive'
            ? 'EXISTS(SELECT 1 FROM podcast_library_projection p WHERE p.show_id=s.id AND p.in_archive=1)'
            : value === 'queue'
              ? 'EXISTS(SELECT 1 FROM podcast_library_projection p WHERE p.show_id=s.id AND p.in_queue=1)'
              : 'NOT EXISTS(SELECT 1 FROM podcast_library_projection p WHERE p.show_id=s.id AND (p.in_archive=1 OR p.in_queue=1))',
        )
        clauses.push(`(${predicates.join(' OR ')})`)
      }
      option =
        facet === 'publisher'
          ? `SELECT COALESCE(s.publisher,'__unknown__') page_id,COALESCE(s.publisher,'Unknown publisher') label,COUNT(DISTINCT s.id) page_sort FROM ${source} WHERE ${clauses.join(' AND ')} GROUP BY page_id`
          : `SELECT COALESCE(language.value,'__unknown__') page_id,COALESCE(language.value,'Unknown language') label,COUNT(DISTINCT s.id) page_sort FROM ${source} LEFT JOIN json_each(s.languages_json) language WHERE ${clauses.join(' AND ')} GROUP BY page_id`
    }
    const key = await hashQueryFingerprint({
      input: { ...input, cursor: undefined },
      facet,
      optionQ,
      limit,
    })
    const page = cursorWhere(await cursor(cursorValue, key), 'desc')
    const filtered = optionQ?.trim() ? "label LIKE ? ESCAPE '\\'" : '1=1'
    const rows = await statement(
      this.database,
      `SELECT * FROM (${option}) WHERE ${filtered} AND ${page.sql || '1=1'} ORDER BY page_sort DESC,page_id LIMIT ?`,
      [
        ...values,
        ...(optionQ?.trim() ? [safeLike(optionQ.trim())] : []),
        ...page.values,
        limit + 1,
      ],
    ).all<Record<string, string | number | null>>()
    return {
      data: rows.results.slice(0, limit).map((row) => ({
        value: String(row.page_id),
        label: String(row.label),
        count: Number(row.page_sort),
      })),
      nextCursor: nextCursor(rows.results, limit, key),
    }
  }

  private async listShowItems(input: PodcastsListInput, anchor: LibraryCursor | null, key: string) {
    const { where, values } = this.podcastShowFilters(input)
    const sort = input.sort ?? 'savedAt'
    const direction =
      input.direction ?? (['title', 'publisher', 'relevance'].includes(sort) ? 'asc' : 'desc')
    const order =
      sort === 'relevance' && input.q
        ? 'CASE WHEN LOWER(s.name)=LOWER(?) THEN 0 WHEN INSTR(LOWER(s.name),LOWER(?))=1 THEN 1 ELSE 2 END'
        : sort === 'title'
          ? 's.name'
          : sort === 'publisher'
            ? 's.publisher'
            : sort === 'episodeCount'
              ? 's.total_episodes'
              : 'saved_at'
    const page = cursorWhere(anchor, direction)
    const rows = await statement(
      this.database,
      `SELECT * FROM (
         SELECT s.*,MAX(ss.added_at) saved_at,
           (SELECT COUNT(*) FROM podcast_library_projection p WHERE p.show_id=s.id AND p.in_archive=1) archive_count,
           (SELECT COUNT(*) FROM podcast_library_projection p WHERE p.show_id=s.id AND p.in_queue=1) queue_count,
           ${order === 'saved_at' ? 'MAX(ss.added_at)' : order} page_sort,s.id page_id
         FROM spotify_podcast_shows s JOIN spotify_saved_shows ss ON ss.show_id=s.id WHERE ${where}
         GROUP BY s.id
       ) WHERE ${page.sql || '1=1'}
       ORDER BY (page_sort IS NULL),page_sort ${direction.toUpperCase()},page_id LIMIT ?`,
      [
        ...(sort === 'relevance' && input.q ? [input.q, input.q] : []),
        ...values,
        ...page.values,
        input.limit + 1,
      ],
    ).all<Record<string, string | number | null>>()
    return {
      data: rows.results.slice(0, input.limit).map((row) => ({
        id: String(row.id),
        kind: 'show' as const,
        title: (row.name as string | null) ?? 'Untitled show',
        subtitle: row.publisher as string | null,
        imageUrl: row.image_url as string | null,
        date: row.saved_at as string | null,
        durationMs: null,
        observedMs: 0,
        playbackCount: 0,
        inArchive: false,
        inQueue: false,
        following: true,
        archiveEpisodeCount: Number(row.archive_count ?? 0),
        queueEpisodeCount: Number(row.queue_count ?? 0),
        totalEpisodes: row.total_episodes as number | null,
        canonicalUrl: row.canonical_url as string | null,
      })),
      nextCursor: nextCursor(rows.results, input.limit, key),
    }
  }

  private podcastShowFilters(input: PodcastsListInput) {
    const clauses = ['ss.active=1', podcastShowPredicate]
    const values: DatabaseValue[] = []
    if (input.q) {
      clauses.push("(s.name LIKE ? ESCAPE '\\' OR s.publisher LIKE ? ESCAPE '\\')")
      values.push(safeLike(input.q), safeLike(input.q))
    }
    const dateClauses: string[] = []
    if (input.dateFrom) {
      dateClauses.push('ss.added_at>=?')
      values.push(input.dateFrom)
    }
    if (input.dateTo) {
      dateClauses.push('ss.added_at<=?')
      values.push(`${input.dateTo}T23:59:59.999Z`)
    }
    if (dateClauses.length || input.dateUnknown) {
      clauses.push(
        `(${[
          dateClauses.length ? `(${dateClauses.join(' AND ')})` : null,
          input.dateUnknown ? 'ss.added_at IS NULL' : null,
        ]
          .filter(Boolean)
          .join(' OR ')})`,
      )
    }
    if (input.publisher?.length) {
      const known = input.publisher.filter((value) => value !== '__unknown__')
      clauses.push(
        `(${[
          known.length ? `s.publisher IN (${known.map(() => '?').join(',')})` : null,
          input.publisher.includes('__unknown__') ? 's.publisher IS NULL' : null,
        ]
          .filter(Boolean)
          .join(' OR ')})`,
      )
      values.push(...known)
    }
    if (input.language?.length) {
      const known = input.language.filter((value) => value !== '__unknown__')
      clauses.push(
        `(${[
          known.length
            ? `EXISTS(SELECT 1 FROM json_each(s.languages_json) language WHERE language.value IN (${known
                .map(() => '?')
                .join(',')}))`
            : null,
          input.language.includes('__unknown__') ? `s.languages_json='[]'` : null,
        ]
          .filter(Boolean)
          .join(' OR ')})`,
      )
      values.push(...known)
    }
    if (input.libraryEpisodes?.length) {
      const predicates = input.libraryEpisodes.map((value) =>
        value === 'archive'
          ? `EXISTS(SELECT 1 FROM podcast_library_projection p WHERE p.show_id=s.id AND p.in_archive=1)`
          : value === 'queue'
            ? `EXISTS(SELECT 1 FROM podcast_library_projection p WHERE p.show_id=s.id AND p.in_queue=1)`
            : `NOT EXISTS(SELECT 1 FROM podcast_library_projection p WHERE p.show_id=s.id AND (p.in_archive=1 OR p.in_queue=1))`,
      )
      clauses.push(`(${predicates.join(' OR ')})`)
    }
    const where = clauses.join(' AND ')
    return { where, values }
  }

  private async summarizeShowsRows(input: PodcastsListInput) {
    const { where, values } = this.podcastShowFilters(input)
    const count = await statement(
      this.database,
      `SELECT COUNT(DISTINCT s.id) value FROM spotify_podcast_shows s JOIN spotify_saved_shows ss ON ss.show_id=s.id WHERE ${where}`,
      values,
    ).first<{ value: number }>()

    const counts = await statement(
      this.database,
      `SELECT SUM(in_archive) archive,SUM(in_queue) queue,${followingCount} following FROM podcast_library_projection`,
    ).first<{ archive: number; queue: number; following: number }>()
    const total = count?.value ?? 0
    return {
      totalCount: total,
      filteredCount: total,
      sectionCounts: {
        archive: counts?.archive ?? 0,
        queue: counts?.queue ?? 0,
        following: counts?.following ?? 0,
      },
    }
  }

  private podcastRow(row: Record<string, string | number | null>) {
    return {
      id: String(row.media_item_id),
      kind: 'episode' as const,
      title: (row.title as string | null) ?? 'Untitled episode',
      subtitle: row.show_name as string | null,
      imageUrl: row.image_url as string | null,
      date: (row.latest_activity_at ?? row.saved_at) as string | null,
      publishedAt: row.published_at_value as string | null,
      durationMs: row.duration_ms as number | null,
      observedMs: Number(row.observed_ms ?? 0),
      playbackCount: Number(row.playback_observation_count ?? 0),
      inArchive: Number(row.in_archive) === 1,
      inQueue: Number(row.in_queue) === 1,
      following: Number(row.following_show) === 1,
      archiveEpisodeCount: 0,
      queueEpisodeCount: 0,
      totalEpisodes: null,
      canonicalUrl: row.spotify_episode_uri
        ? `https://open.spotify.com/episode/${String(row.spotify_episode_uri).split(':').at(-1)}`
        : null,
    }
  }

  async findPodcast(id: string) {
    const item = await statement(
      this.database,
      `SELECT p.*,COALESCE(e.description,m.description) description,
         COALESCE(e.canonical_url,m.canonical_url) canonical_url,
         s.publisher,s.description show_description,s.canonical_url show_url
       FROM podcast_library_projection p JOIN media_items m ON m.id=p.media_item_id
       LEFT JOIN spotify_podcast_episodes e ON e.media_item_id=p.media_item_id
       LEFT JOIN spotify_podcast_shows s ON s.id=p.show_id WHERE p.media_item_id=?`,
      [id],
    ).first<Record<string, string | number | null>>()
    if (!item) return null
    return {
      ...this.podcastRow(item),
      showId: item.show_id as string | null,
      firstObservedAt: null,
      lastObservedAt: null,
      canonicalUrl: item.canonical_url as string | null,
      description: item.description as string | null,
      publisher: item.publisher as string | null,
      showDescription: item.show_description as string | null,
      showUrl: item.show_url as string | null,
      availability: item.availability_state as string,
    }
  }

  async findPodcastShow(id: string) {
    const item = await statement(
      this.database,
      `SELECT s.*,MAX(CASE WHEN ss.active=1 THEN ss.added_at END) saved_at,
         COALESCE(MAX(ss.active),0) following,
         MIN(ss.first_observed_at) first_observed_at,
         MAX(ss.last_observed_at) last_observed_at,
         (SELECT COUNT(*) FROM podcast_library_projection p WHERE p.show_id=s.id AND p.in_archive=1) archive_count,
         (SELECT COUNT(*) FROM podcast_library_projection p WHERE p.show_id=s.id AND p.in_queue=1) queue_count
       FROM spotify_podcast_shows s LEFT JOIN spotify_saved_shows ss ON ss.show_id=s.id
       WHERE s.id=? AND ${podcastShowPredicate}
         AND (EXISTS(SELECT 1 FROM spotify_saved_shows saved WHERE saved.show_id=s.id AND saved.active=1)
           OR EXISTS(SELECT 1 FROM podcast_library_projection p WHERE p.show_id=s.id AND (p.in_archive=1 OR p.in_queue=1)))
       GROUP BY s.id`,
      [id],
    ).first<Record<string, string | number | null>>()
    if (!item) return this.findPodcastShowFromEpisodes(id)
    return {
      id: String(item.id),
      showId: String(item.id),
      firstObservedAt: item.first_observed_at as string | null,
      lastObservedAt: item.last_observed_at as string | null,
      kind: 'show' as const,
      title: (item.name as string | null) ?? 'Untitled show',
      subtitle: item.publisher as string | null,
      imageUrl: item.image_url as string | null,
      date: item.saved_at as string | null,
      durationMs: null,
      observedMs: 0,
      playbackCount: 0,
      inArchive: false,
      inQueue: false,
      following: Number(item.following) === 1,
      archiveEpisodeCount: Number(item.archive_count ?? 0),
      queueEpisodeCount: Number(item.queue_count ?? 0),
      totalEpisodes: item.total_episodes as number | null,
      canonicalUrl: item.canonical_url as string | null,
      description: item.description as string | null,
      publisher: item.publisher as string | null,
      showDescription: item.description as string | null,
      showUrl: item.canonical_url as string | null,
      availability: String(item.availability_state),
    }
  }

  private async findPodcastShowFromEpisodes(id: string) {
    // Episode imports can identify a show before its separate catalog metadata
    // arrives. Keep those local Library relationships inspectable.
    const item = await statement(
      this.database,
      `
      SELECT p.show_name,
        (SELECT e.show_uri FROM spotify_podcast_episodes e WHERE e.show_id=p.show_id AND e.show_uri IS NOT NULL LIMIT 1) show_uri,
        (SELECT COUNT(*) FROM podcast_library_projection related WHERE related.show_id=p.show_id AND related.in_archive=1) archive_count,
        (SELECT COUNT(*) FROM podcast_library_projection related WHERE related.show_id=p.show_id AND related.in_queue=1) queue_count
      FROM podcast_library_projection p LEFT JOIN spotify_podcast_shows s ON s.id=p.show_id
      WHERE p.show_id=? AND s.id IS NULL AND (p.in_archive=1 OR p.in_queue=1)
      ORDER BY p.source_refreshed_at DESC,p.media_item_id LIMIT 1`,
      [id],
    ).first<{
      show_name: string | null
      show_uri: string | null
      archive_count: number
      queue_count: number
    }>()
    if (!item) return null
    const spotifyId = item.show_uri?.match(/^spotify:show:([a-zA-Z0-9]+)$/)?.[1]
    const url = spotifyId ? `https://open.spotify.com/show/${spotifyId}` : null
    return {
      id,
      showId: id,
      kind: 'show' as const,
      title: item.show_name ?? 'Untitled show',
      subtitle: null,
      imageUrl: null,
      date: null,
      durationMs: null,
      observedMs: 0,
      playbackCount: 0,
      inArchive: false,
      inQueue: false,
      following: false,
      archiveEpisodeCount: item.archive_count,
      queueEpisodeCount: item.queue_count,
      totalEpisodes: null,
      canonicalUrl: url,
      description: null,
      publisher: null,
      showDescription: null,
      showUrl: url,
      availability: 'unknown',
      firstObservedAt: null,
      lastObservedAt: null,
    }
  }

  async listPodcastHistory(id: string, limit: number, cursorValue?: string) {
    const key = await hashQueryFingerprint({ id, limit })
    const page = cursorWhere(await cursor(cursorValue, key), 'desc')
    const count = await statement(
      this.database,
      `SELECT
         (SELECT COUNT(*) FROM spotify_podcast_playback_observations WHERE media_item_id=?) +
         (SELECT COUNT(*) FROM archive_entries WHERE media_item_id=? AND admission_reason='readwise_archive_state' AND upstream_state='active') value`,
      [id, id],
    ).first<{ value: number }>()
    const rows = await statement(
      this.database,
      `SELECT * FROM (
         SELECT occurred_at,NULL date_precision,milliseconds_played,skipped,reason_start,reason_end,positive,
           'spotify' source,occurred_at page_sort,id page_id
         FROM spotify_podcast_playback_observations WHERE media_item_id=?
         UNION ALL
         SELECT consumed_at_value occurred_at,consumed_at_precision date_precision,NULL milliseconds_played,
           NULL skipped,NULL reason_start,NULL reason_end,1 positive,'reader' source,
           consumed_at_value page_sort,id page_id
         FROM archive_entries WHERE media_item_id=? AND admission_reason='readwise_archive_state'
           AND upstream_state='active'
       ) WHERE ${page.sql || '1=1'}
       ORDER BY (page_sort IS NULL),page_sort DESC,page_id LIMIT ?`,
      [id, id, ...page.values, limit + 1],
    ).all<Record<string, string | number | null>>()
    const total = count?.value ?? 0
    return {
      data: rows.results.slice(0, limit).map((row) => ({
        occurredAt: row.occurred_at as string | null,
        source: String(row.source),
        observedMs: row.milliseconds_played === null ? null : Number(row.milliseconds_played),
        positive: Number(row.positive) === 1,
        skipped: row.skipped === null ? null : Number(row.skipped) === 1,
        reasonStart: row.reason_start as string | null,
        reasonEnd: row.reason_end as string | null,
      })),
      nextCursor: nextCursor(rows.results, limit, key),
      totalCount: total,
    }
  }

  async listMusic(input: MusicListInput) {
    const [page, summary] = await Promise.all([
      this.listMusicItems(input),
      this.summarizeMusic(input),
    ])
    return { ...page, ...summary }
  }

  async summarizeMusic(input: MusicListInput) {
    return input.view === 'albums'
      ? this.summarizeAlbumsRows(input)
      : input.view === 'artists'
        ? this.summarizeArtistsRows(input)
        : this.summarizeMusicRows(input)
  }

  async listMusicItems(input: MusicListInput) {
    const key = await hashQueryFingerprint({ ...input, cursor: undefined })
    const anchor = await cursor(input.cursor, key)
    if (input.view === 'albums') return this.listAlbumItems(input, anchor, key)
    if (input.view === 'artists') return this.listArtistItems(input, anchor, key)
    const { scope, values, search, ranked, where } = this.musicTrackFilters(input)
    const sort = input.sort ?? 'playedAt'
    const direction =
      input.direction ?? (['title', 'artist', 'album', 'relevance'].includes(sort) ? 'asc' : 'desc')
    const order =
      sort === 'relevance' && search
        ? 'COALESCE(rank.score,-100)'
        : sort === 'title'
          ? 't.title'
          : sort === 'artist'
            ? 't.artist_text'
            : sort === 'album'
              ? 't.album_name'
              : sort === 'playbackCount'
                ? 'm.playback_count'
                : sort === 'observedTime'
                  ? 'm.observed_ms'
                  : 'm.latest_played_at'
    const page = cursorWhere(anchor, direction)
    const rows = await statement(
      this.database,
      `${scope.cte} SELECT * FROM (
         SELECT t.*,m.playback_count matching_playback_count,m.observed_ms matching_observed_ms,
           m.latest_played_at matching_latest_played_at,m.duration_known_count,
           ${order} page_sort,t.media_item_id page_id
         FROM spotify_song_tracks t JOIN matching m ON m.media_item_id=t.media_item_id ${ranked} WHERE ${where}
       ) WHERE ${page.sql || '1=1'}
       ORDER BY (page_sort IS NULL),page_sort ${direction.toUpperCase()},page_id LIMIT ?`,
      [
        ...scope.values,
        ...(search ? [search] : []),
        ...values.slice(scope.values.length),
        ...page.values,
        input.limit + 1,
      ],
    ).all<Record<string, string | number | null>>()
    return {
      data: rows.results.slice(0, input.limit).map((row) => ({
        id: String(row.media_item_id),
        kind: 'track' as const,
        title: (row.title as string | null) ?? 'Untitled track',
        subtitle: row.artist_text as string | null,
        album: row.album_name as string | null,
        imageUrl: row.image_url as string | null,
        latestPlayedAt: row.matching_latest_played_at as string | null,
        playbackCount: Number(row.matching_playback_count),
        observedMs: Number(row.matching_observed_ms),
        observedDurationKnown: Number(row.duration_known_count) > 0,
        durationUnknownCount:
          Number(row.matching_playback_count) - Number(row.duration_known_count),
        trackCount: 1,
        releaseCount: row.album_id ? 1 : 0,
        explicit: row.explicit === null ? null : Number(row.explicit) === 1,
        metadataState: String(row.metadata_state),
        canonicalUrl: row.canonical_url as string | null,
      })),
      nextCursor: nextCursor(rows.results, input.limit, key),
    }
  }

  private musicTrackFilters(input: MusicListInput) {
    const scope = this.musicOccurrenceScope(input)
    const clauses = ['1=1']
    const values: DatabaseValue[] = [...scope.values]
    const search = input.q?.trim() ? ftsQuery(input.q) : null
    const ranked = search
      ? 'LEFT JOIN (SELECT media_item_id,bm25(music_search) score FROM music_search WHERE music_search MATCH ?) rank ON rank.media_item_id=t.media_item_id'
      : ''
    if (search) {
      clauses.push(
        '(rank.media_item_id IS NOT NULL OR t.isrc=? OR t.spotify_track_uri=? OR t.spotify_track_id=?)',
      )
      values.push(input.q!, input.q!, input.q!)
    }
    if (input.minPlaybacks) {
      clauses.push('m.playback_count>=?')
      values.push(input.minPlaybacks)
    }
    if (input.playbackCount === 'once') clauses.push('m.playback_count=1')
    if (input.playbackCount === '2to9') clauses.push('m.playback_count BETWEEN 2 AND 9')
    if (input.playbackCount === '10to49') clauses.push('m.playback_count BETWEEN 10 AND 49')
    if (input.playbackCount === '50plus') clauses.push('m.playback_count>=50')
    if (input.metadata === 'current') clauses.push("t.metadata_state='current'")
    if (input.metadata === 'export_only') clauses.push("t.metadata_state='export_only'")
    if (input.metadata === 'unavailable')
      clauses.push("t.metadata_state IN ('unavailable','expired','error')")
    if (input.artist?.length) {
      clauses.push(
        `EXISTS(SELECT 1 FROM spotify_song_track_artists ta WHERE ta.media_item_id=t.media_item_id AND ta.artist_id IN (${input.artist
          .map(() => '?')
          .join(',')}))`,
      )
      values.push(...input.artist)
    }
    if (input.album?.length) {
      clauses.push(`t.album_id IN (${input.album.map(() => '?').join(',')})`)
      values.push(...input.album)
    }
    if (input.explicit === 'yes') clauses.push('t.explicit=1')
    if (input.explicit === 'no') clauses.push('t.explicit=0')
    if (input.explicit === 'unknown') clauses.push('t.explicit IS NULL')
    const where = clauses.join(' AND ')
    return { scope, values, search, ranked, where }
  }

  private async summarizeMusicRows(input: MusicListInput) {
    const { scope, values, search, ranked, where } = this.musicTrackFilters(input)
    const count = await statement(
      this.database,
      `${scope.cte} SELECT COUNT(*) value FROM spotify_song_tracks t JOIN matching m ON m.media_item_id=t.media_item_id ${ranked} WHERE ${where}`,
      [...scope.values, ...(search ? [search] : []), ...values.slice(scope.values.length)],
    ).first<{ value: number }>()

    const counts = await this.musicCounts()
    const total = count?.value ?? 0
    return {
      totalCount: total,
      filteredCount: total,
      sectionCounts: counts,
    }
  }

  private musicOccurrenceScope(input: MusicListInput) {
    const clauses = ['1=1']
    const values: DatabaseValue[] = []
    if (input.from) {
      clauses.push('o.occurred_at>=?')
      values.push(input.from)
    }
    if (input.to) {
      clauses.push('o.occurred_at<=?')
      values.push(`${input.to}T23:59:59.999Z`)
    }
    if (input.source && input.source !== 'all') {
      clauses.push('o.source_kind=?')
      values.push(input.source)
    }
    return {
      cte: `WITH matching AS (
        SELECT o.media_item_id,COUNT(*) playback_count,
          COALESCE(SUM(CASE WHEN o.milliseconds_played IS NOT NULL THEN o.milliseconds_played ELSE 0 END),0) observed_ms,
          SUM(CASE WHEN o.milliseconds_played IS NOT NULL THEN 1 ELSE 0 END) duration_known_count,
          MAX(o.occurred_at) latest_played_at
        FROM spotify_song_observations o WHERE ${clauses.join(' AND ')} GROUP BY o.media_item_id
      )`,
      values,
    }
  }

  private async musicCounts() {
    const row = await statement(
      this.database,
      `SELECT (SELECT COUNT(*) FROM spotify_song_tracks) tracks,
       (SELECT COUNT(*) FROM spotify_song_albums WHERE id IN (SELECT album_id FROM spotify_song_tracks)) albums,
       (SELECT COUNT(*) FROM spotify_song_artists WHERE id IN (SELECT artist_id FROM spotify_song_track_artists)) artists`,
    ).first<{ tracks: number; albums: number; artists: number }>()
    return { tracks: row?.tracks ?? 0, albums: row?.albums ?? 0, artists: row?.artists ?? 0 }
  }

  private async listAlbumItems(input: MusicListInput, anchor: LibraryCursor | null, key: string) {
    const { scope, filterValues, havingValues, where, having } = this.musicAlbumFilters(input)
    const sort = input.sort ?? 'playbackCount'
    const direction =
      input.direction ?? (['title', 'artist', 'relevance'].includes(sort) ? 'asc' : 'desc')
    const order =
      sort === 'relevance' && input.q
        ? 'CASE WHEN LOWER(grouped.name)=LOWER(?) THEN 0 WHEN INSTR(LOWER(grouped.name),LOWER(?))=1 THEN 1 ELSE 2 END'
        : sort === 'title'
          ? 'a.name'
          : sort === 'artist'
            ? 'a.artist_text'
            : sort === 'playedAt'
              ? 'latest_played_at'
              : sort === 'trackCount'
                ? 'track_count'
                : sort === 'observedTime'
                  ? 'matching_observed_ms'
                  : sort === 'releasedAt'
                    ? 'a.release_date_value'
                    : 'matching_playback_count'
    const page = cursorWhere(anchor, direction)
    const rows = await statement(
      this.database,
      `${scope.cte} SELECT * FROM (
         SELECT grouped.*,${order.replaceAll('a.', 'grouped.')} page_sort,grouped.id page_id FROM (
           SELECT a.*,COUNT(DISTINCT t.media_item_id) track_count,
             SUM(m.playback_count) matching_playback_count,SUM(m.observed_ms) matching_observed_ms,
             SUM(m.duration_known_count) duration_known_count,MAX(m.latest_played_at) latest_played_at
           FROM spotify_song_albums a JOIN spotify_song_tracks t ON t.album_id=a.id
           JOIN matching m ON m.media_item_id=t.media_item_id ${where}
           GROUP BY a.id ${having}
         ) grouped
       ) WHERE ${page.sql || '1=1'}
       ORDER BY (page_sort IS NULL),page_sort ${direction.toUpperCase()},page_id LIMIT ?`,
      [
        ...scope.values,
        ...(sort === 'relevance' && input.q ? [input.q, input.q] : []),
        ...filterValues,
        ...havingValues,
        ...page.values,
        input.limit + 1,
      ],
    ).all<Record<string, string | number | null>>()
    return {
      data: rows.results.slice(0, input.limit).map((row) => ({
        id: String(row.id),
        kind: 'album' as const,
        title: (row.name as string | null) ?? 'Untitled album',
        subtitle: row.artist_text as string | null,
        album: null,
        imageUrl: row.image_url as string | null,
        latestPlayedAt: row.latest_played_at as string | null,
        playbackCount: Number(row.matching_playback_count ?? 0),
        observedMs: Number(row.matching_observed_ms ?? 0),
        observedDurationKnown: Number(row.duration_known_count ?? 0) > 0,
        durationUnknownCount:
          Number(row.matching_playback_count ?? 0) - Number(row.duration_known_count ?? 0),
        trackCount: Number(row.track_count ?? 0),
        releaseCount: 1,
        explicit: null,
        metadataState: 'current',
        canonicalUrl: row.canonical_url as string | null,
      })),
      nextCursor: nextCursor(rows.results, input.limit, key),
    }
  }

  private musicAlbumFilters(input: MusicListInput) {
    const scope = this.musicOccurrenceScope(input)
    const clauses: string[] = []
    const filterValues: DatabaseValue[] = []
    if (input.q) {
      const q = safeLike(input.q)
      clauses.push(
        "(a.name LIKE ? ESCAPE '\\' OR a.artist_text LIKE ? ESCAPE '\\' OR a.spotify_album_uri=? OR a.spotify_album_id=?)",
      )
      filterValues.push(q, q, input.q, input.q)
    }
    if (input.artist?.length) {
      clauses.push(
        `EXISTS(SELECT 1 FROM spotify_song_track_artists ta WHERE ta.media_item_id=t.media_item_id AND ta.artist_id IN (${input.artist
          .map(() => '?')
          .join(',')}))`,
      )
      filterValues.push(...input.artist)
    }
    if (input.albumType === 'album') clauses.push("a.album_type='album'")
    if (input.albumType === 'single') clauses.push("a.album_type='single'")
    if (input.albumType === 'compilation') clauses.push("a.album_type='compilation'")
    if (input.albumType === 'other')
      clauses.push(
        "a.album_type IS NOT NULL AND a.album_type NOT IN ('album','single','compilation')",
      )
    if (input.albumType === 'unknown') clauses.push('a.album_type IS NULL')
    if (input.metadata && !['any', 'current'].includes(input.metadata)) clauses.push('1=0')
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const havingClauses: string[] = []
    const havingValues: DatabaseValue[] = []
    if (input.minPlaybacks) {
      havingClauses.push('SUM(m.playback_count)>=?')
      havingValues.push(input.minPlaybacks)
    }
    if (input.playbackCount === 'once') havingClauses.push('SUM(m.playback_count)=1')
    if (input.playbackCount === '2to9') havingClauses.push('SUM(m.playback_count) BETWEEN 2 AND 9')
    if (input.playbackCount === '10to49')
      havingClauses.push('SUM(m.playback_count) BETWEEN 10 AND 49')
    if (input.playbackCount === '50plus') havingClauses.push('SUM(m.playback_count)>=50')
    const having = havingClauses.length ? `HAVING ${havingClauses.join(' AND ')}` : ''
    const values: DatabaseValue[] = [...scope.values, ...filterValues, ...havingValues]
    return { scope, values, filterValues, havingValues, where, having }
  }

  private async summarizeAlbumsRows(input: MusicListInput) {
    const { scope, values, where, having } = this.musicAlbumFilters(input)
    const count = await statement(
      this.database,
      `${scope.cte} SELECT COUNT(*) value FROM (
        SELECT a.id FROM spotify_song_albums a JOIN spotify_song_tracks t ON t.album_id=a.id
        JOIN matching m ON m.media_item_id=t.media_item_id ${where} GROUP BY a.id ${having}
      )`,
      values,
    ).first<{ value: number }>()

    const total = count?.value ?? 0
    return {
      totalCount: total,
      filteredCount: total,
      sectionCounts: await this.musicCounts(),
    }
  }

  private async listArtistItems(input: MusicListInput, anchor: LibraryCursor | null, key: string) {
    const { scope, filterValues, havingValues, where, having } = this.musicArtistFilters(input)
    const sort = input.sort ?? 'playbackCount'
    const direction = input.direction ?? (['title', 'relevance'].includes(sort) ? 'asc' : 'desc')
    const order =
      sort === 'relevance' && input.q
        ? 'CASE WHEN LOWER(grouped.name)=LOWER(?) THEN 0 WHEN INSTR(LOWER(grouped.name),LOWER(?))=1 THEN 1 ELSE 2 END'
        : sort === 'title'
          ? 'a.name'
          : sort === 'playedAt'
            ? 'latest_played_at'
            : sort === 'trackCount'
              ? 'track_count'
              : sort === 'releaseCount'
                ? 'release_count'
                : sort === 'observedTime'
                  ? 'matching_observed_ms'
                  : 'matching_playback_count'
    const page = cursorWhere(anchor, direction)
    const rows = await statement(
      this.database,
      `${scope.cte} SELECT * FROM (
         SELECT grouped.*,${order.replaceAll('a.', 'grouped.')} page_sort,grouped.id page_id FROM (
           SELECT a.*,COUNT(DISTINCT t.media_item_id) track_count,COUNT(DISTINCT t.album_id) release_count,
             SUM(m.playback_count) matching_playback_count,SUM(m.observed_ms) matching_observed_ms,
             SUM(m.duration_known_count) duration_known_count,MAX(m.latest_played_at) latest_played_at
           FROM spotify_song_artists a JOIN spotify_song_track_artists ta ON ta.artist_id=a.id
           JOIN spotify_song_tracks t ON t.media_item_id=ta.media_item_id
           JOIN matching m ON m.media_item_id=t.media_item_id ${where}
           GROUP BY a.id ${having}
         ) grouped
       ) WHERE ${page.sql || '1=1'}
       ORDER BY (page_sort IS NULL),page_sort ${direction.toUpperCase()},page_id LIMIT ?`,
      [
        ...scope.values,
        ...(sort === 'relevance' && input.q ? [input.q, input.q] : []),
        ...filterValues,
        ...havingValues,
        ...page.values,
        input.limit + 1,
      ],
    ).all<Record<string, string | number | null>>()
    return {
      data: rows.results.slice(0, input.limit).map((row) => ({
        id: String(row.id),
        kind: 'artist' as const,
        title: (row.name as string | null) ?? 'Unknown artist',
        subtitle: null,
        album: null,
        imageUrl: row.image_url as string | null,
        latestPlayedAt: row.latest_played_at as string | null,
        playbackCount: Number(row.matching_playback_count ?? 0),
        observedMs: Number(row.matching_observed_ms ?? 0),
        observedDurationKnown: Number(row.duration_known_count ?? 0) > 0,
        durationUnknownCount:
          Number(row.matching_playback_count ?? 0) - Number(row.duration_known_count ?? 0),
        trackCount: Number(row.track_count ?? 0),
        releaseCount: Number(row.release_count ?? 0),
        explicit: null,
        metadataState: 'current',
        canonicalUrl: row.canonical_url as string | null,
      })),
      nextCursor: nextCursor(rows.results, input.limit, key),
    }
  }

  private musicArtistFilters(input: MusicListInput) {
    const scope = this.musicOccurrenceScope(input)
    const clauses: string[] = []
    const filterValues: DatabaseValue[] = []
    if (input.q) {
      clauses.push("(a.name LIKE ? ESCAPE '\\' OR a.spotify_artist_uri=? OR a.spotify_artist_id=?)")
      filterValues.push(safeLike(input.q), input.q, input.q)
    }
    if (input.metadata && !['any', 'current'].includes(input.metadata)) clauses.push('1=0')
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const havingClauses: string[] = []
    const havingValues: DatabaseValue[] = []
    if (input.minPlaybacks) {
      havingClauses.push('SUM(m.playback_count)>=?')
      havingValues.push(input.minPlaybacks)
    }
    if (input.playbackCount === 'once') havingClauses.push('SUM(m.playback_count)=1')
    if (input.playbackCount === '2to9') havingClauses.push('SUM(m.playback_count) BETWEEN 2 AND 9')
    if (input.playbackCount === '10to49')
      havingClauses.push('SUM(m.playback_count) BETWEEN 10 AND 49')
    if (input.playbackCount === '50plus') havingClauses.push('SUM(m.playback_count)>=50')
    const having = havingClauses.length ? `HAVING ${havingClauses.join(' AND ')}` : ''
    const values: DatabaseValue[] = [...scope.values, ...filterValues, ...havingValues]
    return { scope, values, filterValues, havingValues, where, having }
  }

  private async summarizeArtistsRows(input: MusicListInput) {
    const { scope, values, where, having } = this.musicArtistFilters(input)
    const count = await statement(
      this.database,
      `${scope.cte} SELECT COUNT(*) value FROM (
        SELECT a.id FROM spotify_song_artists a JOIN spotify_song_track_artists ta ON ta.artist_id=a.id
        JOIN matching m ON m.media_item_id=ta.media_item_id ${where} GROUP BY a.id ${having}
      )`,
      values,
    ).first<{ value: number }>()

    const total = count?.value ?? 0
    return {
      totalCount: total,
      filteredCount: total,
      sectionCounts: await this.musicCounts(),
    }
  }

  async findMusic(id: string, kind: 'track' | 'album' | 'artist') {
    let row: Record<string, string | number | null> | null
    if (kind === 'track')
      row = await statement(
        this.database,
        'SELECT * FROM spotify_song_tracks WHERE media_item_id=?',
        [id],
      ).first<Record<string, string | number | null>>()
    else if (kind === 'album')
      row = await statement(
        this.database,
        `SELECT a.*,SUM(t.playback_count) playback_count,SUM(t.observed_ms) observed_ms,
           SUM(t.api_only_count) api_only_count,
           MAX(t.latest_played_at) latest_played_at,MIN(t.first_played_at) first_played_at
         FROM spotify_song_albums a JOIN spotify_song_tracks t ON t.album_id=a.id
         WHERE a.id=? GROUP BY a.id`,
        [id],
      ).first<Record<string, string | number | null>>()
    else
      row = await statement(
        this.database,
        `SELECT a.*,SUM(t.playback_count) playback_count,SUM(t.observed_ms) observed_ms,
           SUM(t.api_only_count) api_only_count,
           MAX(t.latest_played_at) latest_played_at,MIN(t.first_played_at) first_played_at
         FROM spotify_song_artists a JOIN spotify_song_track_artists ta ON ta.artist_id=a.id
         JOIN spotify_song_tracks t ON t.media_item_id=ta.media_item_id
         WHERE a.id=? GROUP BY a.id`,
        [id],
      ).first<Record<string, string | number | null>>()
    if (!row) return null
    const artists =
      kind === 'artist'
        ? []
        : await statement(
            this.database,
            kind === 'track'
              ? `SELECT a.id,a.name FROM spotify_song_track_artists ta
                 JOIN spotify_song_artists a ON a.id=ta.artist_id
                 WHERE ta.media_item_id=? ORDER BY ta.credit_order,a.id LIMIT 30`
              : `SELECT a.id,a.name,MIN(ta.credit_order) credit_order
                 FROM spotify_song_tracks t JOIN spotify_song_track_artists ta ON ta.media_item_id=t.media_item_id
                 JOIN spotify_song_artists a ON a.id=ta.artist_id
                 WHERE t.album_id=? GROUP BY a.id ORDER BY credit_order,a.id LIMIT 30`,
            [id],
          ).all<{ id: string; name: string | null }>()
    const relatedTracks =
      kind === 'track'
        ? []
        : await statement(
            this.database,
            kind === 'album'
              ? `SELECT t.media_item_id id,t.title,t.playback_count FROM spotify_song_tracks t
                 WHERE t.album_id=? ORDER BY t.playback_count DESC,t.media_item_id LIMIT 20`
              : `SELECT t.media_item_id id,t.title,t.playback_count FROM spotify_song_tracks t
                 JOIN spotify_song_track_artists ta ON ta.media_item_id=t.media_item_id
                 WHERE ta.artist_id=? ORDER BY t.playback_count DESC,t.media_item_id LIMIT 20`,
            [id],
          ).all<{ id: string; title: string | null; playback_count: number }>()
    const relatedAlbums =
      kind !== 'artist'
        ? []
        : await statement(
            this.database,
            `SELECT a.id,a.name,SUM(t.playback_count) playback_count
             FROM spotify_song_track_artists ta JOIN spotify_song_tracks t ON t.media_item_id=ta.media_item_id
             JOIN spotify_song_albums a ON a.id=t.album_id
             WHERE ta.artist_id=? GROUP BY a.id
             ORDER BY playback_count DESC,a.id LIMIT 20`,
            [id],
          ).all<{ id: string; name: string | null; playback_count: number }>()
    return {
      id: kind === 'track' ? String(row.media_item_id) : String(row.id),
      kind,
      title:
        (kind === 'track' ? (row.title as string | null) : (row.name as string | null)) ??
        (kind === 'artist' ? 'Unknown artist' : 'Untitled'),
      subtitle:
        kind === 'track'
          ? (row.artist_text as string | null)
          : kind === 'album'
            ? (row.artist_text as string | null)
            : null,
      album: kind === 'track' ? (row.album_name as string | null) : null,
      albumId: kind === 'track' ? (row.album_id as string | null) : null,
      albumType: kind === 'album' ? (row.album_type as string | null) : null,
      releaseDate: kind === 'album' ? (row.release_date_value as string | null) : null,
      artists: (Array.isArray(artists) ? artists : artists.results).map((artist) => ({
        id: artist.id,
        name: artist.name ?? 'Unknown artist',
      })),
      relatedTracks: (Array.isArray(relatedTracks) ? relatedTracks : relatedTracks.results).map(
        (track) => ({
          id: track.id,
          title: track.title ?? 'Untitled track',
          playbackCount: Number(track.playback_count),
        }),
      ),
      relatedAlbums: (Array.isArray(relatedAlbums) ? relatedAlbums : relatedAlbums.results).map(
        (album) => ({
          id: album.id,
          title: album.name ?? 'Untitled album',
          playbackCount: Number(album.playback_count),
        }),
      ),
      imageUrl: (row.image_url as string | null) ?? null,
      latestPlayedAt: (row.latest_played_at as string | null) ?? null,
      firstPlayedAt: (row.first_played_at as string | null) ?? null,
      playbackCount: Number(row.playback_count ?? 0),
      observedMs: Number(row.observed_ms ?? 0),
      observedDurationKnown: Number(row.api_only_count ?? 0) < Number(row.playback_count ?? 0),
      durationUnknownCount: Number(row.api_only_count ?? 0),
      durationMs: (row.duration_ms as number | null) ?? null,
      explicit:
        row.explicit === null || row.explicit === undefined ? null : Number(row.explicit) === 1,
      isrc: (row.isrc as string | null) ?? null,
      metadataState: (row.metadata_state as string | null) ?? 'current',
      canonicalUrl: (row.canonical_url as string | null) ?? null,
    }
  }

  async listMusicHistory(
    id: string,
    kind: 'track' | 'album' | 'artist',
    limit: number,
    cursorValue?: string,
  ) {
    const key = await hashQueryFingerprint({ id, kind, limit })
    const page = cursorWhere(await cursor(cursorValue, key), 'desc')
    const join =
      kind === 'artist'
        ? 'JOIN spotify_song_track_artists ta ON ta.media_item_id=t.media_item_id'
        : ''
    const where =
      kind === 'track' ? 'o.media_item_id=?' : kind === 'album' ? 't.album_id=?' : 'ta.artist_id=?'
    const count = await statement(
      this.database,
      `SELECT COUNT(*) value FROM spotify_song_observations o
       JOIN spotify_song_tracks t ON t.media_item_id=o.media_item_id ${join} WHERE ${where}`,
      [id],
    ).first<{ value: number }>()
    const rows = await statement(
      this.database,
      `SELECT * FROM (
         SELECT o.occurred_at,o.source_kind,o.milliseconds_played,o.skipped,o.reason_start,o.reason_end,
           t.media_item_id track_id,t.title track_title,t.artist_text,
           o.occurred_at page_sort,o.id page_id
         FROM spotify_song_observations o
         JOIN spotify_song_tracks t ON t.media_item_id=o.media_item_id ${join} WHERE ${where}
       ) WHERE ${page.sql || '1=1'}
       ORDER BY (page_sort IS NULL),page_sort DESC,page_id LIMIT ?`,
      [id, ...page.values, limit + 1],
    ).all<Record<string, string | number | null>>()
    const total = count?.value ?? 0
    return {
      data: rows.results.slice(0, limit).map((row) => ({
        occurredAt: row.occurred_at as string | null,
        source: String(row.source_kind),
        observedMs: row.milliseconds_played as number | null,
        skipped: row.skipped === null ? null : Number(row.skipped) === 1,
        reasonStart: row.reason_start as string | null,
        reasonEnd: row.reason_end as string | null,
        trackId: String(row.track_id),
        trackTitle: (row.track_title as string | null) ?? 'Untitled track',
        artistText: row.artist_text as string | null,
      })),
      nextCursor: nextCursor(rows.results, limit, key),
      totalCount: total,
    }
  }
}
