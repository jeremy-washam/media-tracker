import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'

it('upgrades existing Library rows with covering indexes for collection aggregation', () => {
  const database = new DatabaseSync(':memory:')
  try {
    const names = readdirSync(new URL('../migrations/', import.meta.url))
      .filter((name) => name.endsWith('.sql'))
      .sort()
    for (const name of names.filter((name) => name < '0023_')) {
      database.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'))
    }
    database.exec(`
      INSERT INTO media_items(id,type,title,created_at,updated_at)
        VALUES('song','song','Synthetic track','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
      INSERT INTO spotify_song_tracks(media_item_id,spotify_track_uri,spotify_track_id,updated_at)
        VALUES('song','spotify:track:synthetic','synthetic','2026-01-01T00:00:00Z');
    `)
    const before = database.prepare('SELECT * FROM spotify_song_tracks').all()
    database.exec(
      readFileSync(
        new URL('../migrations/0023_library_query_indexes.sql', import.meta.url),
        'utf8',
      ),
    )
    database.exec(
      readFileSync(
        new URL('../migrations/0024_archive_membership_lookup.sql', import.meta.url),
        'utf8',
      ),
    )
    expect(database.prepare('SELECT * FROM spotify_song_tracks').all()).toEqual(before)
    const plan = (sql: string) =>
      database
        .prepare(`EXPLAIN QUERY PLAN ${sql}`)
        .all()
        .map((row) => row.detail)
        .join('\n')
    expect(plan('SELECT album_id FROM spotify_song_tracks')).toContain(
      'COVERING INDEX spotify_song_tracks_album_idx',
    )
    expect(
      plan(`SELECT media_item_id,COUNT(*),SUM(milliseconds_played),MAX(occurred_at)
      FROM spotify_song_observations GROUP BY media_item_id`),
    ).toContain('COVERING INDEX spotify_song_observations_rollup_idx')
    expect(
      plan(`SELECT media_item_id,COUNT(DISTINCT archive_entry_id),COUNT(DISTINCT connection_id),MAX(occurred_at)
      FROM youtube_watch_observations INDEXED BY youtube_watch_rollup_idx GROUP BY media_item_id`),
    ).toContain('COVERING INDEX youtube_watch_rollup_idx')
    expect(
      plan(`SELECT w.media_item_id,COUNT(DISTINCT w.archive_entry_id)
        FROM youtube_watch_observations w INDEXED BY youtube_watch_rollup_idx
        JOIN archive_entries a ON a.id=w.archive_entry_id
        WHERE a.upstream_state='active' GROUP BY w.media_item_id`),
    ).toContain('COVERING INDEX archive_entries_state_id_idx')
    expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  } finally {
    database.close()
  }
})
