import { describe, expect, it } from 'vitest'

import {
  compareLetterboxdRss,
  parseLetterboxdRss,
  summarizeLetterboxdRss,
  type LetterboxdRssSnapshot,
} from './rss.ts'

const rss = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:letterboxd="https://letterboxd.com" xmlns:tmdb="https://themoviedb.org">
  <channel>
    <item>
      <title>Synthetic Film, 2025 - ★★★★</title>
      <link>https://letterboxd.com/example/film/synthetic-film/</link>
      <guid isPermaLink="false">letterboxd-watch-100</guid>
      <pubDate>Wed, 2 Jul 2025 12:00:00 +0000</pubDate>
      <letterboxd:watchedDate>2025-07-01</letterboxd:watchedDate>
      <letterboxd:filmTitle>Synthetic Film</letterboxd:filmTitle>
      <letterboxd:filmYear>2025</letterboxd:filmYear>
      <letterboxd:rewatch>No</letterboxd:rewatch>
      <letterboxd:memberRating>4.0</letterboxd:memberRating>
      <letterboxd:memberLike>Yes</letterboxd:memberLike>
      <tmdb:movieId>12345</tmdb:movieId>
    </item>
    <item>
      <title>Synthetic List</title>
      <guid isPermaLink="false">letterboxd-list-200</guid>
      <pubDate>Tue, 1 Jul 2025 12:00:00 +0000</pubDate>
    </item>
  </channel>
</rss>`

async function snapshot(xml: string): Promise<LetterboxdRssSnapshot> {
  return {
    bytes: new TextEncoder().encode(xml),
    contentType: 'application/rss+xml',
    fetchedAt: '2025-07-02T12:30:00.000Z',
    responseHash: xml,
    cache: { cacheControl: 'no-store', etag: null, lastModified: null },
    entries: await parseLetterboxdRss(xml),
  }
}

describe('Letterboxd RSS', () => {
  it('parses structured movie identities separately from lists', async () => {
    const entries = await parseLetterboxdRss(rss)
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({
      guid: 'letterboxd-watch-100',
      kind: 'watch',
      watchedOn: '2025-07-01',
      rewatch: false,
      rating: 4,
      liked: true,
      tmdbMovieId: '12345',
      filmTitle: 'Synthetic Film',
      filmYear: '2025',
    })
    expect(entries[1]?.kind).toBe('list')
  })

  it('summarizes coverage and detects stable consecutive polls', async () => {
    const first = await snapshot(rss)
    const second = await snapshot(rss)

    expect(summarizeLetterboxdRss(first)).toMatchObject({
      entries: 2,
      movieEntries: 1,
      uniqueTmdbMovies: 1,
      watchedDateRange: { earliest: '2025-07-01', latest: '2025-07-01' },
      publishedDateRange: {
        earliest: '2025-07-01T12:00:00.000Z',
        latest: '2025-07-02T12:00:00.000Z',
      },
    })
    expect(compareLetterboxdRss(first, second)).toEqual({
      responseChanged: false,
      added: [],
      removed: [],
      updated: [],
    })
  })
})
