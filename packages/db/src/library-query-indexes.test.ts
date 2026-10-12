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

it('bounds Movie occurrence counts and dates by media identity and state after an upgrade', () => {
  const database = new DatabaseSync(':memory:')
  try {
    const names = readdirSync(new URL('../migrations/', import.meta.url))
      .filter((name) => name.endsWith('.sql'))
      .sort()
    const apply = (name: string) =>
      database.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'))
    for (const name of names.filter((name) => name < '0025_')) apply(name)
    database.exec(`
      INSERT INTO connections(id,source,label,status,coverage,created_at,updated_at)
        VALUES('connection','letterboxd','Synthetic','connected','complete','2026-01-01','2026-01-01');
      INSERT INTO media_items(id,type,title,created_at,updated_at)
        VALUES('movie','movie','Synthetic movie','2026-01-01','2026-01-01'),
              ('other','song','Unrelated history','2026-01-01','2026-01-01');
      INSERT INTO archive_entries(id,media_item_id,connection_id,source_occurrence_key,
        admission_reason,consumed_at_value,consumed_at_precision,consumed_at_basis,
        upstream_state,created_at,updated_at)
        VALUES('first','movie','connection','first','letterboxd_diary_entry',
                 '2024-01-01','day','source_asserted','active','2026-01-01','2026-01-01'),
              ('second','movie','connection','second','letterboxd_diary_entry',
                 '2025-01-01','day','source_asserted','active','2026-01-01','2026-01-01'),
              ('undated','movie','connection','undated','letterboxd_watched_state',
                 NULL,NULL,NULL,'active','2026-01-01','2026-01-01'),
              ('removed','movie','connection','removed','letterboxd_diary_entry',
                 '2026-01-01','day','source_asserted','removed','2026-01-01','2026-01-01');
      WITH RECURSIVE n(value) AS (SELECT 1 UNION ALL SELECT value+1 FROM n WHERE value<2048)
        INSERT INTO archive_entries(id,media_item_id,connection_id,source_occurrence_key,
          admission_reason,upstream_state,created_at,updated_at)
        SELECT 'other-'||value,'other','connection','other-'||value,
          'spotify_positive_playback','active','2026-01-01','2026-01-01' FROM n;
    `)
    // These are the correlated subqueries used by Movies rows and totals.
    const queries = [
      {
        condition: '1=1',
        expected: { matching_watch_count: 3, reference_watched_on: '2025-01-01' },
      },
      {
        condition: "a.consumed_at_value BETWEEN '2024-01-01' AND '2024-12-31'",
        expected: { matching_watch_count: 1, reference_watched_on: '2024-01-01' },
      },
      {
        condition: 'a.consumed_at_value IS NULL',
        expected: { matching_watch_count: 1, reference_watched_on: null },
      },
    ].map(({ condition, expected }) => ({
      sql: `SELECT
        (SELECT COUNT(*) FROM archive_entries a
          WHERE a.media_item_id=p.id AND a.upstream_state='active' AND ${condition}) matching_watch_count,
        (SELECT MAX(a.consumed_at_value) FROM archive_entries a
          WHERE a.media_item_id=p.id AND a.upstream_state='active' AND ${condition}) reference_watched_on
        FROM media_items p WHERE p.id='movie'`,
      expected,
    }))
    const before = database.prepare('SELECT * FROM archive_entries ORDER BY id').all()
    for (const { sql, expected } of queries) expect(database.prepare(sql).get()).toEqual(expected)
    for (const name of names.filter((name) => name >= '0025_')) apply(name)
    expect(database.prepare('SELECT * FROM archive_entries ORDER BY id').all()).toEqual(before)
    for (const { sql, expected } of queries) {
      const plan = database
        .prepare(`EXPLAIN QUERY PLAN ${sql}`)
        .all()
        .map((row) => row.detail)
        .join('\n')
      expect(plan).toContain('COVERING INDEX archive_entries_media_state_consumed_idx')
      expect(plan).toContain('media_item_id=? AND upstream_state=?')
      expect(plan).not.toContain('archive_entries_state_id_idx')
      expect(database.prepare(sql).get()).toEqual(expected)
    }
    expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  } finally {
    database.close()
  }
})

it('installs the Archive media/state index when migrating an empty database', () => {
  const database = new DatabaseSync(':memory:')
  try {
    for (const name of readdirSync(new URL('../migrations/', import.meta.url))
      .filter((name) => name.endsWith('.sql'))
      .sort()) {
      database.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'))
    }
    expect(
      database
        .prepare("PRAGMA index_info('archive_entries_media_state_consumed_idx')")
        .all()
        .map((row) => row.name),
    ).toEqual(['media_item_id', 'upstream_state', 'consumed_at_value'])
    expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  } finally {
    database.close()
  }
})
