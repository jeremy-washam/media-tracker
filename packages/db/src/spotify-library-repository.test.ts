import { applyTestMigrations, SqliteTestClient as SqliteClient } from './test-support/sqlite'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SqlSpotifyLibraryRepository } from './spotify-library-repository'

function seed(database: DatabaseSync) {
  database.exec(`
    INSERT INTO connections(id,source,label,status,coverage,created_at,updated_at) VALUES('spotify','spotify','Spotify','connected','complete','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
    INSERT INTO sync_runs(id,connection_id,kind,status,started_at) VALUES('run','spotify','backfill','running','2026-01-01T00:00:00Z');
    INSERT INTO raw_objects(id,connection_id,sync_run_id,kind,acquisition_key,storage_key,sha256,content_type,byte_length,acquired_at,processing_status) VALUES('raw','spotify','run','export','export','raw/export.zip','${'a'.repeat(64)}','application/zip',1,'2026-01-01T00:00:00Z','processed');
    INSERT INTO source_records(id,raw_object_id,connection_id,record_type,record_path,observed_at,parser_version,disposition,upstream_state) VALUES
      ('pod-record','raw','spotify','history','$[0]','2026-01-01T00:00:00Z','test','normalized','active'),
      ('saved-record','raw','spotify','saved','$[1]','2026-01-01T00:00:00Z','test','normalized','active'),
      ('song-record','raw','spotify','history','$[2]','2026-01-01T00:00:00Z','test','normalized','active');
    INSERT INTO media_items(id,type,title,created_at,updated_at) VALUES
      ('episode','podcast_episode','Episode','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z'),
      ('song','song','Track','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
  `)
}

describe('Spotify library repository', () => {
  let database: DatabaseSync
  let repository: SqlSpotifyLibraryRepository
  let client: SqliteClient
  beforeEach(() => {
    database = new DatabaseSync(':memory:')
    applyTestMigrations(database)
    seed(database)
    client = new SqliteClient(database)
    repository = new SqlSpotifyLibraryRepository(client)
  })
  afterEach(() => database.close())

  it('reports durable Spotify poll coverage without treating a gap as confirmed missing plays', async () => {
    database.exec(`
      UPDATE sync_runs SET status='succeeded',finished_at='2026-01-02T00:00:00Z' WHERE id='run';
      INSERT INTO sync_cursors(id,connection_id,name,checkpoint_json,committed_at,sync_run_id)
      VALUES
        ('saved-cursor','spotify','saved-episodes','{"lastFullSyncAt":"2026-01-02T00:00:00Z"}','2026-01-02T00:00:00Z','run'),
        ('recent-cursor','spotify','recent-tracks','{"possibleGap":true}','2026-01-02T01:00:00Z','run');
    `)
    await expect(repository.coverage()).resolves.toEqual({
      savedEpisodesAt: '2026-01-02T00:00:00Z',
      savedShowsAt: null,
      playerAt: null,
      recentPollAt: '2026-01-02T01:00:00Z',
      possibleRecentGap: true,
    })
  })

  it('keeps a saved episode out of Queue when Archive already proves consumption', async () => {
    database.exec(
      `INSERT INTO archive_entries(id,media_item_id,connection_id,source_occurrence_key,admission_reason,upstream_state,created_at,updated_at) VALUES('archive','episode','spotify','episode:1','spotify_positive_playback','active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`,
    )
    await repository.upsertSavedEpisodes([
      {
        connectionId: 'spotify',
        sourceRecordId: 'saved-record',
        mediaItemId: 'episode',
        episodeUri: 'spotify:episode:1',
        episodeId: '1',
        addedAt: '2026-01-01T00:00:00Z',
        resumePositionMs: 0,
        fullyPlayed: false,
        observedAt: '2026-01-01T00:00:00Z',
        title: 'Episode',
        showId: null,
        showUri: null,
        showName: 'Show',
        description: null,
        imageUrl: null,
        canonicalUrl: 'https://open.spotify.com/episode/1',
        publishedAt: null,
        publishedPrecision: null,
        durationMs: 1000,
      },
    ])
    await repository.finalizeSavedEpisodes('spotify', ['spotify:episode:1'], '2026-01-01T01:00:00Z')
    expect(
      database
        .prepare(`SELECT COUNT(*) count FROM queue_entries WHERE upstream_state='active'`)
        .get(),
    ).toEqual({ count: 0 })
  })

  it('excludes explicitly labeled audiobooks from Following without title heuristics or source deletion', async () => {
    for (const [id, description] of [
      ['book', 'Author(s): Synthetic Author\nNarrator(s): Synthetic Narrator\nDescription'],
      ['book-crlf', 'Author(s): Synthetic Author\r\nNarrator(s): Synthetic Narrator'],
      ['podcast', 'A podcast about audiobooks and narrators.'],
      ['unknown', null],
      ['quoted', 'This episode discusses the credits:\nAuthor(s): Person\nNarrator(s): Person'],
    ] as const) {
      await repository.upsertSavedShows([
        {
          connectionId: 'spotify',
          sourceRecordId: 'saved-record',
          id,
          showId: id,
          showUri: `spotify:show:${id}`,
          addedAt: '2026-01-01T00:00:00Z',
          observedAt: '2026-01-01T00:00:00Z',
          name: 'The same title',
          publisher: id,
          description,
          imageUrl: null,
          canonicalUrl: null,
          languages: ['en'],
          totalEpisodes: 10,
        },
      ])
    }
    const page = await repository.listPodcasts({ view: 'following', limit: 10 })
    expect(page.data.map((item) => item.id).sort()).toEqual(['podcast', 'quoted', 'unknown'])
    expect(page).toMatchObject({ totalCount: 3, sectionCounts: { following: 3 } })
    expect(
      (await repository.listPodcasts({ view: 'archive', limit: 10 })).sectionCounts.following,
    ).toBe(3)
    const facets = await repository.listPodcastFilterOptions(
      { view: 'following', limit: 10 },
      'publisher',
      undefined,
      10,
    )
    expect(facets.data.map((item) => item.value).sort()).toEqual(['podcast', 'quoted', 'unknown'])
    expect(await repository.findPodcastShow('book')).toBeNull()
    expect(
      database.prepare('SELECT COUNT(*) value FROM spotify_saved_shows WHERE active=1').get(),
    ).toEqual({ value: 5 })
  })

  it('admits an explicit zero-progress saved episode to Queue', async () => {
    await repository.upsertSavedShows([
      {
        connectionId: 'spotify',
        sourceRecordId: 'saved-record',
        id: 'spotify_show_show1',
        showId: 'show1',
        showUri: 'spotify:show:show1',
        addedAt: '2025-12-01T00:00:00Z',
        observedAt: '2026-01-01T00:00:00Z',
        name: 'Show',
        publisher: 'Publisher',
        description: null,
        imageUrl: null,
        canonicalUrl: 'https://open.spotify.com/show/show1',
        languages: ['en'],
        totalEpisodes: 10,
      },
    ])
    await repository.upsertSavedEpisodes([
      {
        connectionId: 'spotify',
        sourceRecordId: 'saved-record',
        mediaItemId: 'episode',
        episodeUri: 'spotify:episode:1',
        episodeId: '1',
        addedAt: '2026-01-01T00:00:00Z',
        resumePositionMs: 0,
        fullyPlayed: false,
        observedAt: '2026-01-01T00:00:00Z',
        title: 'Episode',
        showId: 'spotify_show_show1',
        showUri: 'spotify:show:show1',
        showName: 'Show',
        description: null,
        imageUrl: null,
        canonicalUrl: 'https://open.spotify.com/episode/1',
        publishedAt: null,
        publishedPrecision: null,
        durationMs: 1000,
      },
    ])
    await repository.finalizeSavedEpisodes('spotify', ['spotify:episode:1'], '2026-01-01T01:00:00Z')
    expect(database.prepare(`SELECT upstream_state FROM queue_entries`).get()).toEqual({
      upstream_state: 'active',
    })
    await expect(
      repository.listPodcasts({ view: 'queue', duration: ['under30'], limit: 10 }),
    ).resolves.toMatchObject({
      filteredCount: 1,
      data: [expect.objectContaining({ following: true })],
    })
    await expect(
      repository.listPodcasts({ view: 'following', q: 'Sho', sort: 'relevance', limit: 10 }),
    ).resolves.toMatchObject({
      filteredCount: 1,
      data: [expect.objectContaining({ title: 'Show' })],
    })
    await expect(
      repository.listPodcasts({ view: 'queue', duration: ['over2hours'], limit: 10 }),
    ).resolves.toMatchObject({ filteredCount: 0 })
    await expect(repository.listPodcasts({ view: 'following', limit: 10 })).resolves.toMatchObject({
      data: [expect.objectContaining({ queueEpisodeCount: 1 })],
    })
    await expect(
      repository.listPodcastFilterOptions(
        { view: 'queue', show: ['different-show'], duration: ['under30'], limit: 10 },
        'show',
        'Sho',
        10,
      ),
    ).resolves.toMatchObject({ data: [{ value: 'spotify_show_show1', label: 'Show', count: 1 }] })
    await expect(
      repository.listPodcastFilterOptions(
        { view: 'following', publisher: ['different-publisher'], language: ['en'], limit: 10 },
        'publisher',
        undefined,
        10,
      ),
    ).resolves.toMatchObject({ data: [{ value: 'Publisher', count: 1 }] })
    await expect(
      repository.listPodcastFilterOptions(
        {
          view: 'following',
          publisher: ['Publisher'],
          language: ['different-language'],
          limit: 10,
        },
        'language',
        undefined,
        10,
      ),
    ).resolves.toMatchObject({ data: [{ value: 'en', count: 1 }] })
    await expect(repository.findPodcastShow('spotify_show_show1')).resolves.toMatchObject({
      following: true,
      queueEpisodeCount: 1,
    })
    database.exec("UPDATE spotify_saved_shows SET active=0 WHERE show_id='spotify_show_show1'")
    await expect(repository.findPodcastShow('spotify_show_show1')).resolves.toMatchObject({
      title: 'Show',
      following: false,
      queueEpisodeCount: 1,
      date: null,
    })
    database.exec("DELETE FROM spotify_saved_shows WHERE show_id='spotify_show_show1'")
    await expect(repository.findPodcastShow('spotify_show_show1')).resolves.toMatchObject({
      title: 'Show',
      following: false,
      queueEpisodeCount: 1,
    })
    database.exec("DELETE FROM spotify_podcast_shows WHERE id='spotify_show_show1'")
    await expect(repository.findPodcastShow('spotify_show_show1')).resolves.toMatchObject({
      title: 'Show',
      following: false,
      queueEpisodeCount: 1,
      publisher: null,
      totalEpisodes: null,
      canonicalUrl: 'https://open.spotify.com/show/show1',
    })
    await expect(repository.findPodcastShow('unknown-show')).resolves.toBeNull()
  })

  it('includes independent Reader podcast Archive items without putting them in Queue', async () => {
    database.exec(`
      INSERT INTO connections(id,source,label,status,coverage,created_at,updated_at)
      VALUES('readwise','readwise','Readwise','connected','complete','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
      INSERT INTO media_items(id,type,title,primary_creator_name,created_at,updated_at)
      VALUES('reader-podcast','podcast_episode','Reader Episode','Reader Show','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
      INSERT INTO archive_entries(id,media_item_id,connection_id,source_occurrence_key,admission_reason,consumed_at_value,consumed_at_precision,consumed_at_basis,upstream_state,created_at,updated_at)
      VALUES('reader-podcast-archive','reader-podcast','readwise','reader-document:1','readwise_archive_state','2026-01-03','day','inferred','active','2026-01-03T00:00:00Z','2026-01-03T00:00:00Z');
    `)
    await repository.rebuildPodcastProjection()
    await repository.rebuildSearch()

    const archive = await repository.listPodcasts({ view: 'archive', limit: 10 })
    expect(archive.data).toContainEqual(
      expect.objectContaining({
        id: 'reader-podcast',
        title: 'Reader Episode',
        subtitle: 'Reader Show',
        inArchive: true,
        inQueue: false,
      }),
    )
    await expect(repository.findPodcast('reader-podcast')).resolves.toMatchObject({
      id: 'reader-podcast',
      title: 'Reader Episode',
    })
    await expect(repository.listPodcastHistory('reader-podcast', 10)).resolves.toMatchObject({
      data: [
        expect.objectContaining({
          occurredAt: '2026-01-03',
          observedMs: null,
          source: 'reader',
        }),
      ],
    })
  })

  it('matches imprecise podcast publication dates by interval intersection', async () => {
    await repository.upsertSavedEpisodes([
      {
        connectionId: 'spotify',
        sourceRecordId: 'saved-record',
        mediaItemId: 'episode',
        episodeUri: 'spotify:episode:1',
        episodeId: '1',
        addedAt: '2026-01-01T00:00:00Z',
        resumePositionMs: 0,
        fullyPlayed: false,
        observedAt: '2026-01-01T00:00:00Z',
        title: 'Episode',
        showId: null,
        showUri: null,
        showName: 'Show',
        description: null,
        imageUrl: null,
        canonicalUrl: 'https://open.spotify.com/episode/1',
        publishedAt: '1969',
        publishedPrecision: 'year',
        durationMs: 1000,
      },
    ])
    await repository.finalizeSavedEpisodes('spotify', ['spotify:episode:1'], '2026-01-02T00:00:00Z')

    await expect(
      repository.listPodcasts({
        view: 'queue',
        publishedFrom: '1969-12-31',
        publishedTo: '1969-12-31',
        limit: 10,
      }),
    ).resolves.toMatchObject({ filteredCount: 1 })
    await expect(
      repository.listPodcasts({ view: 'queue', publishedFrom: '1970-01-01', limit: 10 }),
    ).resolves.toMatchObject({ filteredCount: 0 })
  })

  it('counts every song observation without a playback threshold and remains idempotent', async () => {
    const value = {
      id: 'observation',
      sourceRecordId: 'song-record',
      connectionId: 'spotify',
      mediaItemId: 'song',
      trackUri: 'spotify:track:1',
      trackId: '1',
      occurredAt: '2026-01-01T00:00:00Z',
      millisecondsPlayed: 0,
      sourceKind: 'export' as const,
      skipped: true,
      trackName: 'Track',
      artistName: 'Artist',
      albumName: 'Album',
      reasonStart: null,
      reasonEnd: null,
      parserVersion: 'test',
      updatedAt: '2026-01-01T00:00:00Z',
    }
    await repository.projectHistory({ podcasts: [], songs: [value] })
    await repository.projectHistory({ podcasts: [], songs: [value] })
    const page = await repository.listMusic({ view: 'tracks', limit: 10 })
    expect(page.data).toHaveLength(1)
    expect(page.data[0]).toMatchObject({
      playbackCount: 1,
      observedMs: 0,
      observedDurationKnown: true,
      title: 'Track',
    })
    await expect(repository.listTracksNeedingMetadata()).resolves.toEqual([
      { mediaItemId: 'song', trackId: '1', trackUri: 'spotify:track:1' },
    ])
    await repository.markTrackMetadataUnavailable(['song'], '2026-01-02T00:00:00Z')
    await expect(repository.listTracksNeedingMetadata()).resolves.toEqual([])
  })

  it('uses matching occurrence scope for Music source and date aggregates', async () => {
    database.exec(
      `INSERT INTO source_records(id,raw_object_id,connection_id,record_type,record_path,observed_at,parser_version,disposition,upstream_state) VALUES('recent-record','raw','spotify','recent','$[3]','2026-02-01T00:00:00Z','test','normalized','active')`,
    )
    const base = {
      connectionId: 'spotify',
      mediaItemId: 'song',
      trackUri: 'spotify:track:1',
      trackId: '1',
      skipped: null,
      trackName: 'Track',
      artistName: 'Artist',
      albumName: 'Album',
      reasonStart: null,
      reasonEnd: null,
      parserVersion: 'test',
      updatedAt: '2026-02-01T00:00:00Z',
    }
    await repository.projectHistory({
      podcasts: [],
      songs: [
        {
          ...base,
          id: 'export-observation',
          sourceRecordId: 'song-record',
          occurredAt: '2026-01-01T00:00:00Z',
          millisecondsPlayed: 500,
          sourceKind: 'export',
        },
        {
          ...base,
          id: 'recent-observation',
          sourceRecordId: 'recent-record',
          occurredAt: '2026-02-01T00:00:00Z',
          millisecondsPlayed: null,
          sourceKind: 'recent_api',
        },
      ],
    })
    await repository.applyTrackMetadata({
      mediaItemId: 'song',
      trackUri: 'spotify:track:1',
      trackId: '1',
      title: 'Track',
      artists: [{ id: 'artist', uri: 'spotify:artist:artist', name: 'Artist' }],
      album: {
        id: 'album',
        uri: 'spotify:album:album',
        name: 'Album',
        albumType: 'album',
        releaseDate: '2026',
        releaseDatePrecision: 'year',
        imageUrl: null,
        artists: [{ id: 'artist', uri: 'spotify:artist:artist', name: 'Artist' }],
      },
      canonicalUrl: 'https://open.spotify.com/track/1',
      durationMs: 1000,
      explicit: false,
      isrc: null,
      observedAt: '2026-02-01T00:00:00Z',
    })
    database.exec(`
      INSERT INTO spotify_song_albums(id,spotify_album_uri,spotify_album_id,updated_at)
        VALUES('orphan-album','spotify:album:orphan','orphan','2026-01-01T00:00:00Z');
      INSERT INTO spotify_song_artists(id,spotify_artist_uri,spotify_artist_id,updated_at)
        VALUES('orphan-artist','spotify:artist:orphan','orphan','2026-01-01T00:00:00Z');
    `)
    expect((await repository.listMusic({ view: 'tracks', limit: 10 })).sectionCounts).toEqual({
      tracks: 1,
      albums: 1,
      artists: 1,
    })
    await expect(
      repository.listMusicFilterOptions(
        { view: 'tracks', source: 'recent_api', limit: 10 },
        'artist',
        'Art',
        1,
      ),
    ).resolves.toEqual({ data: [{ value: 'artist', label: 'Artist', count: 1 }], nextCursor: null })
    await expect(
      repository.listMusicFilterOptions(
        { view: 'tracks', album: ['missing'], limit: 10 },
        'artist',
        undefined,
        10,
      ),
    ).resolves.toEqual({ data: [], nextCursor: null })
    await expect(
      repository.listMusicFilterOptions(
        { view: 'albums', source: 'export', limit: 10 },
        'artist',
        undefined,
        10,
      ),
    ).resolves.toMatchObject({ data: [{ value: 'artist', count: 1 }] })
    await expect(
      repository.listMusicFilterOptions({ view: 'tracks', limit: 10 }, 'album', 'Alb', 10),
    ).resolves.toEqual({ data: [{ value: 'album', label: 'Album', count: 1 }], nextCursor: null })
    const recentTracks = await repository.listMusic({
      view: 'tracks',
      source: 'recent_api',
      limit: 10,
    })
    expect(recentTracks.data[0]).toMatchObject({
      playbackCount: 1,
      observedMs: 0,
      observedDurationKnown: false,
    })
    await expect(
      repository.listMusic({
        view: 'tracks',
        source: 'recent_api',
        playbackCount: 'once',
        metadata: 'current',
        explicit: 'no',
        artist: ['artist'],
        album: ['album'],
        limit: 10,
      }),
    ).resolves.toMatchObject({ filteredCount: 1 })
    const albums = await repository.listMusic({
      view: 'albums',
      source: 'export',
      from: '2026-01-01',
      to: '2026-01-31',
      limit: 10,
    })
    expect(albums.data[0]).toMatchObject({ playbackCount: 1, observedMs: 500 })
    await expect(
      repository.listMusic({ view: 'albums', q: 'Alb', sort: 'relevance', limit: 10 }),
    ).resolves.toMatchObject({
      filteredCount: 1,
      data: [expect.objectContaining({ title: 'Album' })],
    })
    await expect(
      repository.listMusic({
        view: 'albums',
        albumType: 'album',
        artist: ['artist'],
        playbackCount: 'once',
        limit: 10,
      }),
    ).resolves.toMatchObject({ filteredCount: 0 })
    const artists = await repository.listMusic({ view: 'artists', source: 'recent_api', limit: 10 })
    expect(artists.data[0]).toMatchObject({ playbackCount: 1, observedDurationKnown: false })
    await expect(
      repository.listMusic({ view: 'artists', q: 'Art', sort: 'relevance', limit: 10 }),
    ).resolves.toMatchObject({
      filteredCount: 1,
      data: [expect.objectContaining({ title: 'Artist' })],
    })
    await expect(
      repository.listMusicFilterOptions(
        { view: 'tracks', artist: ['not-selected'], album: ['album'], limit: 10 },
        'artist',
        'Art',
        10,
      ),
    ).resolves.toMatchObject({ data: [{ value: 'artist', label: 'Artist', count: 1 }] })
    await expect(
      repository.listMusicFilterOptions(
        { view: 'tracks', artist: ['artist'], album: ['not-selected'], limit: 10 },
        'album',
        undefined,
        10,
      ),
    ).resolves.toMatchObject({ data: [{ value: 'album', label: 'Album', count: 1 }] })
    await expect(
      repository.listMusicFilterOptions(
        { view: 'albums', playbackCount: '2to9', limit: 10 },
        'artist',
        undefined,
        10,
      ),
    ).resolves.toMatchObject({ data: [{ value: 'artist', count: 1 }] })
    const albumHistory = await repository.listMusicHistory('album', 'album', 1)
    expect(albumHistory).toMatchObject({ totalCount: 2, data: [{ trackId: 'song' }] })
    expect(albumHistory.nextCursor).not.toBeNull()
    const nextAlbumHistory = await repository.listMusicHistory(
      'album',
      'album',
      1,
      albumHistory.nextCursor!,
    )
    expect(nextAlbumHistory).toMatchObject({ totalCount: 2, nextCursor: null })
    await expect(repository.listMusicHistory('artist', 'artist', 10)).resolves.toMatchObject({
      totalCount: 2,
    })
  })

  it('uses query-bound value cursors for Podcast and Music pages', async () => {
    for (const [id, title] of [
      ['episode-a', 'Alpha'],
      ['episode-b', 'Beta'],
      ['episode-c', 'Gamma'],
    ] as const) {
      database
        .prepare(
          `INSERT INTO media_items(id,type,title,created_at,updated_at)
           VALUES(?,'podcast_episode',?,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`,
        )
        .run(id, title)
      database
        .prepare(
          `INSERT INTO podcast_library_projection(media_item_id,title,in_archive,in_queue,
             saved_episode,following_show,source_refreshed_at,projection_version)
           VALUES(?,?,1,0,0,0,'2026-01-01T00:00:00Z',1)`,
        )
        .run(id, title)
    }
    const firstPodcasts = await repository.listPodcasts({
      view: 'archive',
      sort: 'title',
      limit: 1,
    })
    expect(firstPodcasts.data.map((item) => item.id)).toEqual(['episode-a'])
    expect(firstPodcasts.nextCursor).not.toBeNull()
    const podcastInput = { view: 'archive' as const, sort: 'title' as const, limit: 1 }
    client.queries.length = 0
    await expect(repository.listPodcastsItems(podcastInput)).resolves.toEqual({
      data: firstPodcasts.data,
      nextCursor: firstPodcasts.nextCursor,
    })
    expect(
      client.queries.some(
        ({ sql }) =>
          sql.includes('SELECT COUNT(*) value') || sql.includes('SELECT SUM(in_archive)'),
      ),
    ).toBe(false)
    await expect(repository.summarizePodcasts(podcastInput)).resolves.toEqual({
      totalCount: firstPodcasts.totalCount,
      filteredCount: firstPodcasts.filteredCount,
      sectionCounts: firstPodcasts.sectionCounts,
    })

    const secondPodcasts = await repository.listPodcasts({
      view: 'archive',
      sort: 'title',
      limit: 1,
      cursor: firstPodcasts.nextCursor!,
    })
    expect(secondPodcasts.data.map((item) => item.id)).toEqual(['episode-b'])
    const legacy = JSON.parse(decodeURIComponent(firstPodcasts.nextCursor!))
    legacy.key = JSON.stringify({ view: 'archive', sort: 'title', limit: 1 })
    await expect(
      repository.listPodcasts({
        view: 'archive',
        sort: 'title',
        limit: 1,
        cursor: encodeURIComponent(JSON.stringify(legacy)),
      }),
    ).resolves.toMatchObject({ data: [{ id: 'episode-b' }] })

    await repository.rebuildPodcastSearch()
    await expect(
      repository.listPodcasts({ view: 'archive', q: 'Al', sort: 'relevance', limit: 1 }),
    ).resolves.toMatchObject({
      filteredCount: 1,
      data: [expect.objectContaining({ id: 'episode-a' })],
    })
    await expect(
      repository.listPodcasts({
        view: 'archive',
        sort: 'title',
        direction: 'desc',
        limit: 1,
        cursor: firstPodcasts.nextCursor!,
      }),
    ).rejects.toThrow('Invalid Spotify Library pagination cursor')

    for (const [id, title] of [
      ['song-a', 'Alpha'],
      ['song-b', 'Beta'],
      ['song-c', 'Gamma'],
    ] as const) {
      database
        .prepare(
          `INSERT INTO media_items(id,type,title,created_at,updated_at)
           VALUES(?,'song',?,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`,
        )
        .run(id, title)
      database
        .prepare(
          `INSERT INTO spotify_song_tracks(media_item_id,spotify_track_uri,spotify_track_id,
             title,updated_at) VALUES(?,?,?,?,?)`,
        )
        .run(id, `spotify:track:${id}`, id, title, '2026-01-01T00:00:00Z')
      database
        .prepare(
          `INSERT INTO source_records(id,raw_object_id,connection_id,record_type,record_path,
             observed_at,parser_version,disposition,upstream_state)
           VALUES(?,'raw','spotify','history',?,'2026-01-01T00:00:00Z','test','normalized','active')`,
        )
        .run(`${id}-record`, `$[${id}]`)
      database
        .prepare(
          `INSERT INTO spotify_song_observations(id,source_record_id,connection_id,media_item_id,
             spotify_track_uri,source_kind,occurred_at,milliseconds_played,parser_version)
           VALUES(?,?,'spotify',?,?,'export','2026-01-01T00:00:00Z',1000,'test')`,
        )
        .run(`${id}-observation`, `${id}-record`, id, `spotify:track:${id}`)
    }
    const firstMusic = await repository.listMusic({ view: 'tracks', sort: 'title', limit: 1 })
    expect(firstMusic.data.map((item) => item.id)).toEqual(['song-a'])
    const musicInput = { view: 'tracks' as const, sort: 'title' as const, limit: 1 }
    client.queries.length = 0
    await expect(repository.listMusicItems(musicInput)).resolves.toEqual({
      data: firstMusic.data,
      nextCursor: firstMusic.nextCursor,
    })
    expect(
      client.queries.some(
        ({ sql }) =>
          sql.includes('SELECT COUNT(*) value') || sql.includes('SELECT (SELECT COUNT(*)'),
      ),
    ).toBe(false)
    await expect(repository.summarizeMusic(musicInput)).resolves.toEqual({
      totalCount: firstMusic.totalCount,
      filteredCount: firstMusic.filteredCount,
      sectionCounts: firstMusic.sectionCounts,
    })

    const secondMusic = await repository.listMusic({
      view: 'tracks',
      sort: 'title',
      limit: 1,
      cursor: firstMusic.nextCursor!,
    })
    expect(secondMusic.data.map((item) => item.id)).toEqual(['song-b'])
    await repository.rebuildMusicSearch()
    await expect(
      repository.listMusic({ view: 'tracks', q: 'Al', sort: 'relevance', limit: 1 }),
    ).resolves.toMatchObject({
      filteredCount: 1,
      data: [expect.objectContaining({ id: 'song-a' })],
    })
    expect(JSON.parse(decodeURIComponent(firstMusic.nextCursor!))).not.toHaveProperty('offset')
    for (const id of ['song-a', 'song-b', 'song-c']) {
      await repository.applyTrackMetadata({
        mediaItemId: id,
        trackUri: `spotify:track:${id}`,
        trackId: id,
        title: id,
        artists: [{ id: `artist-${id}`, uri: `spotify:artist:${id}`, name: 'Tied Artist' }],
        album: {
          id: `album-${id}`,
          uri: `spotify:album:${id}`,
          name: 'Tied Album',
          albumType: 'album',
          releaseDate: null,
          releaseDatePrecision: null,
          imageUrl: null,
          artists: [],
        },
        canonicalUrl: null,
        durationMs: null,
        explicit: null,
        isrc: null,
        observedAt: '2026-01-01T00:00:00Z',
      })
    }
    for (const [view, sorts] of [
      ['tracks', ['playedAt', 'title', 'artist', 'album', 'playbackCount', 'observedTime']],
      [
        'albums',
        [
          'playedAt',
          'title',
          'artist',
          'playbackCount',
          'observedTime',
          'trackCount',
          'releasedAt',
        ],
      ],
      [
        'artists',
        ['playedAt', 'title', 'playbackCount', 'observedTime', 'trackCount', 'releaseCount'],
      ],
    ] as const)
      for (const sort of sorts)
        for (const direction of ['asc', 'desc'] as const) {
          const input = { view, sort, direction, limit: 100 }
          const expected = (await repository.listMusic(input)).data.map((row) => row.id)
          for (const limit of [1, 2]) {
            const seen: string[] = []
            let cursor: string | undefined
            do {
              const page = await repository.listMusic({
                ...input,
                limit,
                ...(cursor ? { cursor } : {}),
              })
              seen.push(...page.data.map((row) => row.id))
              cursor = page.nextCursor ?? undefined
              expect(seen.length).toBeLessThanOrEqual(expected.length)
            } while (cursor)
            expect(seen).toEqual(expected)
            expect(new Set(seen).size).toBe(3)
          }
        }
    database.exec('UPDATE podcast_library_projection SET in_queue=1')
    for (const [view, sorts] of [
      ['archive', ['activityAt', 'observedTime', 'publishedAt', 'duration', 'title', 'show']],
      ['queue', ['savedAt', 'publishedAt', 'duration', 'title', 'show']],
    ] as const)
      for (const sort of sorts)
        for (const direction of ['asc', 'desc'] as const) {
          const input = { view, sort, direction, limit: 100 }
          const expected = (await repository.listPodcasts(input)).data.map((row) => row.id)
          for (const limit of [1, 2]) {
            const seen: string[] = []
            let cursor: string | undefined
            do {
              const page = await repository.listPodcasts({
                ...input,
                limit,
                ...(cursor ? { cursor } : {}),
              })
              seen.push(...page.data.map((row) => row.id))
              cursor = page.nextCursor ?? undefined
              expect(seen.length).toBeLessThanOrEqual(expected.length)
            } while (cursor)
            expect(seen).toEqual(expected)
            expect(new Set(seen).size).toBe(3)
          }
        }
  })
  it.each([0, 97, 98, 150])(
    'reconciles %i saved episodes and shows across page-sized batches',
    async (retainedCount) => {
      const at = '2026-01-01T00:00:00Z'
      const ids = Array.from({ length: 153 }, (_, index) => `id-${index}`)
      for (let offset = 0; offset < ids.length; offset += 50) {
        const page = ids.slice(offset, offset + 50)
        for (const id of page)
          database
            .prepare(
              'INSERT INTO media_items(id,type,title,created_at,updated_at) VALUES(?,?,?,?,?)',
            )
            .run(id, 'podcast_episode', id, at, at)
        await repository.upsertSavedEpisodes(
          page.map((id) => ({
            connectionId: 'spotify',
            sourceRecordId: 'saved-record',
            mediaItemId: id,
            episodeUri: `spotify:episode:${id}`,
            episodeId: id,
            addedAt: at,
            resumePositionMs: 0,
            fullyPlayed: false,
            observedAt: at,
            title: id,
            showId: id,
            showUri: `spotify:show:${id}`,
            showName: id,
            description: null,
            imageUrl: null,
            canonicalUrl: null,
            publishedAt: null,
            publishedPrecision: null,
            durationMs: null,
          })),
        )
        await repository.upsertSavedShows(
          page.map((id) => ({
            connectionId: 'spotify',
            sourceRecordId: 'saved-record',
            id,
            showId: id,
            showUri: `spotify:show:${id}`,
            addedAt: at,
            observedAt: at,
            name: id,
            publisher: 'Synthetic',
            description: null,
            imageUrl: null,
            canonicalUrl: null,
            languages: ['en'],
            totalEpisodes: 1,
          })),
        )
      }
      const retained = ids.slice(0, retainedCount)
      const evidenceBefore = database.prepare('SELECT * FROM source_records ORDER BY id').all()
      const finalize = async () => {
        await repository.finalizeSavedEpisodes(
          'spotify',
          retained.map((id) => `spotify:episode:${id}`),
          at,
        )
        await repository.finalizeSavedShows('spotify', retained, at)
      }
      await finalize()
      await finalize()
      for (const table of ['spotify_saved_episodes', 'spotify_saved_shows']) {
        expect(
          database.prepare(`SELECT COUNT(*) value FROM ${table} WHERE active=1`).get()?.value,
        ).toBe(retainedCount)
        expect(database.prepare(`SELECT COUNT(*) value FROM ${table}`).get()?.value).toBe(
          ids.length,
        )
      }
      expect((await repository.listPodcasts({ view: 'queue', limit: 100 })).totalCount).toBe(
        retainedCount,
      )
      if (retainedCount > 1) {
        const first = await repository.listPodcastFilterOptions(
          { view: 'queue', limit: 100 },
          'show',
          undefined,
          1,
        )
        expect(first.data).toHaveLength(1)
        expect(first.nextCursor).not.toBeNull()
        const next = await repository.listPodcastFilterOptions(
          { view: 'queue', limit: 100 },
          'show',
          undefined,
          1,
          first.nextCursor!,
        )
        expect(next.data[0]?.value).not.toBe(first.data[0]?.value)
        await expect(
          repository.listPodcastFilterOptions(
            { view: 'queue', duration: ['under30'], limit: 100 },
            'show',
            undefined,
            1,
            first.nextCursor!,
          ),
        ).rejects.toThrow('pagination cursor')
        await expect(
          repository.listPodcastFilterOptions(
            { view: 'following', limit: 100 },
            'publisher',
            undefined,
            10,
          ),
        ).resolves.toEqual({
          data: [{ value: 'Synthetic', label: 'Synthetic', count: retainedCount }],
          nextCursor: null,
        })
        await expect(
          repository.listPodcastFilterOptions(
            { view: 'following', publisher: ['missing'], limit: 100 },
            'language',
            undefined,
            10,
          ),
        ).resolves.toEqual({ data: [], nextCursor: null })
      }
      expect(database.prepare('SELECT * FROM source_records ORDER BY id').all()).toEqual(
        evidenceBefore,
      )
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    },
  )

  it('retries a failed snapshot retirement without losing previously saved state', async () => {
    database.exec(`INSERT INTO spotify_saved_episodes(connection_id,spotify_episode_uri,media_item_id,source_record_id,active,first_observed_at,last_observed_at)
      VALUES('spotify','spotify:episode:retained','episode','saved-record',1,'2026-01-01','2026-01-01')`)
    client.failOnRunCall = client.runCalls + 1
    await expect(repository.finalizeSavedEpisodes('spotify', [], '2026-01-02')).rejects.toThrow(
      'synthetic statement failure',
    )
    expect(database.prepare('SELECT active FROM spotify_saved_episodes').get()?.active).toBe(1)
    client.failOnRunCall = null
    await repository.finalizeSavedEpisodes('spotify', [], '2026-01-02')
    expect(
      database.prepare('SELECT active,source_record_id FROM spotify_saved_episodes').get(),
    ).toEqual({ active: 0, source_record_id: 'saved-record' })
  })
})
