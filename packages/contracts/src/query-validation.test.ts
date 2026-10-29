import { describe, expect, it } from 'vitest'
import type { ZodType } from 'zod'
import {
  ArticlesQuerySchema,
  BooksQuerySchema,
  MoviesQuerySchema,
  MusicQuerySchema,
  PodcastsQuerySchema,
  PodcastFilterOptionsQuerySchema,
  MusicFilterOptionsQuerySchema,
  VideosQuerySchema,
  SyncJobSchema,
  BooksSummaryQuerySchema,
  MoviesSummaryQuerySchema,
  ArticlesSummaryQuerySchema,
  PodcastsSummaryQuerySchema,
  MusicSummaryQuerySchema,
  VideosSummaryQuerySchema,
} from './index'

const dateQueries: [string, ZodType, string][] = [
  ['Books', BooksQuerySchema, 'finishedFrom'],
  ['Movies', MoviesQuerySchema, 'watchedFrom'],
  ['Articles', ArticlesQuerySchema, 'publishedFrom'],
  ['Podcasts', PodcastsQuerySchema, 'publishedFrom'],
  ['Music', MusicQuerySchema, 'from'],
  ['Videos', VideosQuerySchema, 'watchedFrom'],
]

describe.each(dateQueries)('%s calendar query boundaries', (_name, schema, field) => {
  it.each(['2026-02-30', '2025-02-29', '2026-00-01', '2026-01-00', '2026-99-99', '2026-1-01'])(
    'rejects %s rather than issuing a misleading filter',
    (value) => {
      expect(schema.safeParse({ [field]: value }).success).toBe(false)
    },
  )
  it.each(['2024-02-29', '0099-12-31'])('accepts the valid date %s', (value) => {
    expect(schema.safeParse({ [field]: value }).success).toBe(true)
  })
  it('bounds query text and rejects an oversized cursor', () => {
    expect(schema.safeParse({ q: 'x'.repeat(500) }).success).toBe(true)
    expect(schema.safeParse({ q: 'x'.repeat(501) }).success).toBe(false)
    expect(schema.safeParse({ cursor: 'x'.repeat(4001) }).success).toBe(false)
  })
})

it.each([
  [
    BooksQuerySchema,
    { finishedMode: 'range', finishedFrom: '2026-02-01', finishedTo: '2026-01-31' },
  ],
  [BooksQuerySchema, { addedMode: 'range', addedFrom: '2026-02-01', addedTo: '2026-01-31' }],
  [BooksQuerySchema, { publishedMode: 'range', publishedFrom: '2026-02', publishedTo: '2026-01' }],
  [MoviesQuerySchema, { watched: 'range', watchedFrom: '2026-02-01', watchedTo: '2026-01-31' }],
  [MoviesQuerySchema, { added: 'range', addedFrom: '2026-02-01', addedTo: '2026-01-31' }],
  [MoviesQuerySchema, { releaseYearFrom: '2026', releaseYearTo: '2025' }],
  [ArticlesQuerySchema, { publishedFrom: '2026-02-01', publishedTo: '2026-01-31' }],
  [PodcastsQuerySchema, { dateFrom: '2026-02-01', dateTo: '2026-01-31' }],
  [MusicQuerySchema, { from: '2026-02-01', to: '2026-01-31' }],
  [VideosQuerySchema, { watchedFrom: '2026-02-01', watchedTo: '2026-01-31' }],
] as [ZodType, Record<string, unknown>][])('rejects reversed bounds %#', (schema, input) => {
  expect(schema.safeParse(input).success).toBe(false)
})

it('interprets partial publication boundaries as whole intervals', () => {
  for (const [publishedFrom, publishedTo] of [
    ['2026-12-31', '2026'],
    ['2026-02-28', '2026-02'],
    ['2024-02-29', '2024-02'],
  ]) {
    expect(
      BooksQuerySchema.safeParse({ publishedMode: 'range', publishedFrom, publishedTo }).success,
    ).toBe(true)
  }
  for (const value of ['2026-13', '2026-02-30', '2026-00', '26'])
    expect(BooksQuerySchema.safeParse({ publishedFrom: value }).success).toBe(false)
})

it.each([
  [BooksQuerySchema, 'format', 'series'],
  [ArticlesQuerySchema, 'author', 'publication'],
  [PodcastsQuerySchema, 'show', 'duration'],
  [MusicQuerySchema, 'artist', 'album'],
] as [ZodType, string, string][])(
  'bounds combined facet SQL parameters %#',
  (schema, first, second) => {
    const values = Array.from({ length: 50 }, (_, index) => String(index))
    // Podcast duration is an enum, so use Following's publisher/language pair instead.
    const input =
      schema === PodcastsQuerySchema
        ? { section: 'following', publisher: values, language: ['en'] }
        : { [first]: values, [second]: ['extra'] }
    expect(schema.safeParse(input).success).toBe(false)
    expect(schema.safeParse({ [first]: values.slice(0, 2) }).success).toBe(true)
  },
)

describe('Podcast view contracts', () => {
  it.each([
    ['archive', 'activityAt'],
    ['archive', 'observedTime'],
    ['queue', 'savedAt'],
    ['following', 'publisher'],
    ['following', 'episodeCount'],
  ])('accepts %s sorting by %s', (view, sort) => {
    expect(PodcastsQuerySchema.safeParse({ section: view, sort }).success).toBe(true)
  })
  it.each([
    { section: 'queue', sort: 'activityAt' },
    { section: 'archive', publisher: 'publisher' },
    { section: 'following', show: 'show' },
    { section: 'following', duration: 'under30' },
    { sort: 'relevance' },
    { duration: 'invalid' },
    { limit: 101 },
  ])('rejects incompatible filters %j', (input) => {
    expect(PodcastsQuerySchema.safeParse(input).success).toBe(false)
  })
  it('parses repeated facets and validates view-specific facet endpoints', () => {
    expect(
      PodcastsQuerySchema.parse({ show: ['one,two', 'three'], dateUnknown: '1' }),
    ).toMatchObject({
      show: ['one', 'two', 'three'],
      dateUnknown: true,
    })
    expect(
      PodcastFilterOptionsQuerySchema.safeParse({ section: 'following', facet: 'publisher' })
        .success,
    ).toBe(true)
    expect(
      PodcastFilterOptionsQuerySchema.safeParse({ section: 'following', facet: 'show' }).success,
    ).toBe(false)
    expect(
      PodcastFilterOptionsQuerySchema.safeParse({ section: 'archive', facet: 'language' }).success,
    ).toBe(false)
  })
})

it('retains large Video facet selections that use bounded JSON SQL parameters', () => {
  const channel = Array.from({ length: 80 }, (_, index) => `channel-${index}`)
  expect(VideosQuerySchema.safeParse({ channel }).success).toBe(true)
  expect(
    VideosQuerySchema.safeParse({ channel: Array.from({ length: 501 }, (_, i) => String(i)) })
      .success,
  ).toBe(false)
})

describe('Music view contracts', () => {
  it.each([
    ['tracks', 'artist'],
    ['tracks', 'album'],
    ['albums', 'releasedAt'],
    ['albums', 'trackCount'],
    ['artists', 'releaseCount'],
  ])('accepts %s sorting by %s', (view, sort) => {
    expect(MusicQuerySchema.safeParse({ section: view, sort }).success).toBe(true)
  })
  it.each([
    { section: 'albums', explicit: 'yes' },
    { section: 'artists', artist: 'id' },
    { section: 'tracks', albumType: 'single' },
    { section: 'artists', sort: 'album' },
    { sort: 'relevance' },
    { minPlaybacks: 0 },
    { limit: 101 },
  ])('rejects incompatible filters %j', (input) => {
    expect(MusicQuerySchema.safeParse(input).success).toBe(false)
  })
  it('preserves repeated IDs and bounds facet endpoints', () => {
    expect(MusicQuerySchema.parse({ artist: ['one,two', 'three'] }).artist).toEqual([
      'one',
      'two',
      'three',
    ])
    expect(
      MusicFilterOptionsQuerySchema.safeParse({ facet: 'artist', optionLimit: 50 }).success,
    ).toBe(true)
    expect(
      MusicFilterOptionsQuerySchema.safeParse({ facet: 'album', optionLimit: 51 }).success,
    ).toBe(false)
  })
})

it.each([
  ['refresh_tmdb_catalog', 'tmdb'],
  ['refresh_youtube_catalog', 'youtube'],
  ['refresh_spotify_catalog', 'spotify'],
])('requires matching source for %s', (operation, source) => {
  const job = { operation, source, catalogJobId: 'job', idempotencyKey: 'key' }
  expect(SyncJobSchema.safeParse(job).success).toBe(true)
  expect(SyncJobSchema.safeParse({ ...job, source: 'hardcover' }).success).toBe(false)
  expect(SyncJobSchema.safeParse({ ...job, catalogJobId: undefined }).success).toBe(false)
})

it.each([
  ['Books', BooksSummaryQuerySchema, 'finishedFrom'],
  ['Movies', MoviesSummaryQuerySchema, 'watchedFrom'],
  ['Articles', ArticlesSummaryQuerySchema, 'publishedFrom'],
  ['Podcasts', PodcastsSummaryQuerySchema, 'publishedFrom'],
  ['Music', MusicSummaryQuerySchema, 'from'],
  ['Videos', VideosSummaryQuerySchema, 'watchedFrom'],
] as [string, ZodType, string][])(
  '%s summaries retain strict calendar and query boundaries',
  (_name, schema, field) => {
    expect(schema.safeParse({ [field]: '2026-02-30' }).success).toBe(false)
    expect(schema.safeParse({ [field]: '2024-02-29' }).success).toBe(true)
    expect(schema.safeParse({ q: 'x'.repeat(501) }).success).toBe(false)
    for (const input of [{ sort: 'title' }, { cursor: 'cursor' }, { limit: 50 }])
      expect(schema.safeParse(input).success).toBe(false)
  },
)

it('summary-only requests preserve section validation and combined facet budgets', () => {
  expect(
    PodcastsSummaryQuerySchema.safeParse({ section: 'following', publisher: ['Example'] }).success,
  ).toBe(true)
  expect(
    PodcastsSummaryQuerySchema.safeParse({ section: 'archive', publisher: ['Example'] }).success,
  ).toBe(false)
  expect(MusicSummaryQuerySchema.safeParse({ section: 'albums', albumType: 'album' }).success).toBe(
    true,
  )
  expect(MusicSummaryQuerySchema.safeParse({ section: 'tracks', albumType: 'album' }).success).toBe(
    false,
  )
  expect(
    BooksSummaryQuerySchema.safeParse({ format: Array(50).fill('physical'), genre: ['extra'] })
      .success,
  ).toBe(false)
  expect(
    ArticlesSummaryQuerySchema.safeParse({
      author: Array(50).fill('Author'),
      publication: ['extra'],
    }).success,
  ).toBe(false)
})
