import { expect, test } from '@playwright/test'

const book = {
  id: 'book-one',
  title: 'A Distant Book',
  subtitle: null,
  authors: [{ id: 'author-one', name: 'Ada Author' }],
  coverUrl: null,
  coverColor: '#667788',
  publicationDate: '2020',
  publicationPrecision: 'year' as const,
  primarySeries: 'A Series',
  memberships: { archive: true, queue: false, currentlyReading: false },
  latestReadDate: '2026-09-12',
  latestReadPrecision: 'day' as const,
  latestReadFormat: 'Paperback',
  personalRating: 4.5,
  addedToHardcoverDate: '2026-01-01',
  supportedReadCount: 1,
}

test('keeps Podcast facet choices URL-backed and self-excluding', async ({ page }) => {
  await page.route('**/api/library/podcasts?*', (route) =>
    route.fulfill({ json: podcastsResponse() }),
  )
  await page.route('**/api/library/podcasts/filter-options?*', (route) => {
    const url = new URL(route.request().url())
    expect(url.searchParams.get('facet')).toBe('show')
    return route.fulfill({
      json: { data: [{ value: 'show-one', label: 'A Distant Show', count: 2 }], nextCursor: null },
    })
  })
  await page.goto('/library/podcasts/archive')
  await page.getByRole('button', { name: 'Filters' }).click()
  await page.getByRole('checkbox', { name: 'A Distant Show 2' }).check()
  await expect(page).toHaveURL(/show=%5B%22show-one%22%5D/)
  await expect(page.getByRole('group', { name: /Shows \(1 selected\)/ })).toBeVisible()
})

test('searches and applies complete Music artist facet options', async ({ page }) => {
  await page.route('**/api/library/music?*', (route) => route.fulfill({ json: musicResponse() }))
  await page.route('**/api/library/music/filter-options?*', (route) => {
    const url = new URL(route.request().url())
    const facet = url.searchParams.get('facet')
    return route.fulfill({
      json: {
        data:
          facet === 'artist' && url.searchParams.get('optionQ') === 'Ada'
            ? [{ value: 'artist-one', label: 'Ada Artist', count: 4 }]
            : [],
        nextCursor: null,
      },
    })
  })
  await page.goto('/library/music/tracks')
  await page.getByRole('button', { name: 'Filters' }).click()
  await page.getByRole('searchbox', { name: 'Search artists options' }).fill('Ada')
  await page.getByRole('checkbox', { name: 'Ada Artist 4' }).check()
  await expect(page).toHaveURL(/artist=%5B%22artist-one%22%5D/)
  await expect(page.getByRole('group', { name: /Artists \(1 selected\)/ })).toBeVisible()
})

test('keeps loaded Podcast pages while changing layout and opening the inspector', async ({
  page,
}) => {
  const requested: string[] = []
  await page.route('**/api/library/podcasts?*', async (route) => {
    const url = new URL(route.request().url())
    requested.push(url.search)
    const second = url.searchParams.has('cursor')
    await route.fulfill({
      json: podcastsResponse(
        [
          {
            ...podcast,
            id: second ? 'podcast-two' : 'podcast-one',
            title: second ? 'Second Episode' : podcast.title,
          },
        ],
        second ? null : 'next-podcast-page',
      ),
    })
  })
  await page.route('**/api/library/podcasts/episodes/podcast-one', (route) =>
    route.fulfill({
      json: {
        ...podcast,
        publishedAt: '1969',
        description: 'Episode description.',
        publisher: 'Publisher',
        showDescription: null,
        showUrl: null,
        availability: 'available',
      },
    }),
  )
  await page.route('**/api/library/podcasts/episodes/podcast-one/history*', (route) =>
    route.fulfill({ json: { data: [], nextCursor: null, totalCount: 0 } }),
  )
  await page.goto('/library/podcasts/archive')
  await page.getByRole('button', { name: 'Load more' }).click()
  await expect(page.getByRole('button', { name: /Second Episode/ })).toBeVisible()
  const afterPaging = requested.length
  await page.getByRole('button', { name: 'Grid view' }).click()
  await page.getByRole('button', { name: /A Distant Episode/ }).click()
  await expect(page.getByText('Episode description.')).toBeVisible()
  await expect(page.getByText('1969', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close inspector' }).click()
  await expect(page.getByRole('button', { name: /A Distant Episode/ })).toBeFocused()
  await expect(page.getByRole('button', { name: /Second Episode/ })).toBeVisible()
  expect(requested).toHaveLength(afterPaging)
  expect(requested.every((value) => !value.includes('layout=') && !value.includes('item='))).toBe(
    true,
  )
})

test('keeps loaded Music pages while changing layout and opening the inspector', async ({
  page,
}) => {
  const requested: string[] = []
  await page.route('**/api/library/music?*', async (route) => {
    const url = new URL(route.request().url())
    requested.push(url.search)
    const second = url.searchParams.has('cursor')
    await route.fulfill({
      json: musicResponse(
        [
          {
            ...track,
            id: second ? 'track-two' : 'track-one',
            title: second ? 'Second Track' : track.title,
            playbackCount: url.searchParams.has('from') ? 2 : track.playbackCount,
          },
        ],
        second ? null : 'next-music-page',
      ),
    })
  })
  await page.route('**/api/library/music/tracks/track-one', (route) =>
    route.fulfill({
      json: {
        id: 'track-one',
        kind: 'track',
        title: track.title,
        subtitle: track.subtitle,
        album: track.album,
        imageUrl: null,
        latestPlayedAt: track.latestPlayedAt,
        firstPlayedAt: '2026-01-01T00:00:00.000Z',
        playbackCount: 4,
        observedMs: 600_000,
        observedDurationKnown: true,
        durationMs: 180_000,
        explicit: false,
        isrc: null,
        metadataState: 'current',
        canonicalUrl: track.canonicalUrl,
      },
    }),
  )
  await page.route('**/api/library/music/tracks/track-one/history*', (route) =>
    route.fulfill({ json: { data: [], nextCursor: null, totalCount: 0 } }),
  )
  await page.goto('/library/music/tracks')
  await page.getByRole('button', { name: 'Load more' }).click()
  await expect(page.getByRole('button', { name: /Second Track/ })).toBeVisible()
  const afterPaging = requested.length
  await page.getByRole('button', { name: 'Grid view' }).click()
  await page.getByRole('button', { name: /A Distant Track/ }).click()
  await expect(page.getByRole('heading', { name: 'A Distant Track' })).toBeVisible()
  await page.getByRole('button', { name: 'Close inspector' }).click()
  await expect(page.getByRole('button', { name: /A Distant Track/ })).toBeFocused()
  await expect(page.getByRole('button', { name: /Second Track/ })).toBeVisible()
  expect(requested).toHaveLength(afterPaging)
  expect(requested.every((value) => !value.includes('layout=') && !value.includes('item='))).toBe(
    true,
  )
  await page.goto('/library/music/tracks?from=2026-01-01')
  await page.getByRole('button', { name: /A Distant Track/ }).click()
  await expect(page.getByText('Matching observations')).toBeVisible()
  await expect(page.getByText('Lifetime observations')).toBeVisible()
})

test('opens bounded Album history and links back to its heard Track', async ({ page }) => {
  await page.route('**/api/library/music?*', (route) =>
    route.fulfill({
      json: musicResponse([
        {
          ...track,
          id: 'album-one',
          kind: 'album',
          title: 'A Distant Album',
          album: null,
          trackCount: 1,
        },
      ]),
    }),
  )
  await page.route('**/api/library/music/albums/album-one', (route) =>
    route.fulfill({
      json: {
        id: 'album-one',
        kind: 'album',
        title: 'A Distant Album',
        subtitle: 'Ada Artist',
        album: null,
        imageUrl: null,
        latestPlayedAt: '2026-09-12T00:00:00.000Z',
        firstPlayedAt: '2026-01-01T00:00:00.000Z',
        playbackCount: 2,
        observedMs: 180_000,
        observedDurationKnown: true,
        durationMs: null,
        explicit: null,
        isrc: null,
        metadataState: 'current',
        canonicalUrl: 'https://open.spotify.com/album/album-one',
      },
    }),
  )
  await page.route('**/api/library/music/albums/album-one/history*', (route) =>
    route.fulfill({
      json: {
        data: [
          {
            occurredAt: '2026-09-12T00:00:00.000Z',
            source: 'export',
            observedMs: 180_000,
            skipped: false,
            reasonStart: null,
            reasonEnd: null,
            trackId: 'track-one',
            trackTitle: 'A Distant Track',
            artistText: 'Ada Artist',
          },
        ],
        nextCursor: null,
        totalCount: 1,
      },
    }),
  )
  await page.goto('/library/music/albums')
  await page.getByRole('button', { name: /A Distant Album/ }).click()
  await page.getByRole('tab', { name: /History/ }).click()
  await expect(page.getByRole('link', { name: 'A Distant Track' })).toBeVisible()
})

test('keeps loaded Video pages while changing layout and opening the inspector', async ({
  page,
}) => {
  const requested: string[] = []
  await page.route('**/api/library/videos?*', async (route) => {
    const url = new URL(route.request().url())
    requested.push(url.search)
    const second = url.searchParams.has('cursor')
    await route.fulfill({
      json: videosResponse(
        [
          {
            ...video,
            id: second ? 'video-two' : 'video-one',
            title: second ? 'Second Video' : video.title,
          },
        ],
        second ? null : 'next-video-page',
      ),
    })
  })
  await page.route('**/api/library/videos/video-one', (route) =>
    route.fulfill({
      json: {
        ...video,
        description: null,
        categoryId: null,
        categoryTitle: null,
        captionAvailable: null,
        definition: null,
        projection: null,
        catalogCheckedAt: null,
        historyCount: 2,
        queueRelationships: [],
        metadataMessage: 'YouTube Data API metadata is not configured.',
      },
    }),
  )
  await page.route('**/api/library/videos/video-one/history*', (route) =>
    route.fulfill({ json: { data: [], nextCursor: null, totalCount: 0 } }),
  )
  await page.goto('/library/videos/archive')
  await page.getByRole('button', { name: 'Load more' }).click()
  await expect(page.getByRole('button', { name: /Second Video/ })).toBeVisible()
  const afterPaging = requested.length
  await page.getByRole('button', { name: 'Grid view' }).click()
  await page.getByRole('button', { name: /A Distant Video/ }).click()
  await expect(page.getByRole('heading', { name: 'A Distant Video' })).toBeVisible()
  await page.getByRole('button', { name: 'Close inspector' }).click()
  await expect(page.getByRole('button', { name: /Second Video/ })).toBeVisible()
  expect(requested).toHaveLength(afterPaging)
  expect(requested.every((value) => !value.includes('layout=') && !value.includes('item='))).toBe(
    true,
  )
})

const booksResponse = (data = [book], nextCursor: string | null = null) => ({
  data,
  nextCursor,
  counts: { archive: 128, queue: 986, filteredBooks: data.length, supportedReads: data.length },
  facets: {
    formats: [{ value: 'paperback', label: 'Paperback', count: 1 }],
    series: [{ value: 'series-one', label: 'A Series', count: 1 }],
    genres: [{ value: 'fiction', label: 'Fiction', count: 1 }],
  },
  freshness: { lastSuccessfulSyncAt: '2026-09-20T10:00:00.000Z', degraded: false },
})

const movie = {
  id: 'movie-one',
  displayTitle: 'A Distant Movie',
  importedTitle: 'A Distant Movie',
  releaseYear: '2020',
  posterUrl: null,
  directors: [],
  runtimeMinutes: null,
  personal: { currentRating: 4.5, liked: true, reviewed: true },
  archive: {
    active: true,
    lifetimeWatchCount: 2,
    matchingWatchCount: 2,
    latestKnownWatchedOn: '2026-09-12',
    referenceWatchedOn: '2026-09-12',
    hasUnknownWatchedDate: false,
  },
  queue: { active: false, addedOn: null },
  enrichment: {
    provider: null,
    mediaType: null,
    status: 'not_configured' as const,
    refreshedAt: null,
  },
}

const moviesResponse = (data = [movie], nextCursor: string | null = null) => ({
  data,
  nextCursor,
  totalCount: 372,
  filteredCount: data.length,
  filteredOccurrenceCount: data.reduce((total, item) => total + item.archive.matchingWatchCount, 0),
  overlapCount: 2,
  membershipCounts: { archiveItems: 372, archiveOccurrences: 403, queueItems: 309 },
  facets: {
    watchedUnknown: 180,
    addedUnknown: 370,
    releaseYearUnknown: 0,
    unrated: 19,
    reviewed: 13,
    runtimeUnknown: 372,
    runtimeAvailable: false,
  },
  sourceFreshness: {
    lastCompleteExportAt: '2026-09-12T10:00:00.000Z',
    lastRssSuccessAt: '2026-09-20T10:00:00.000Z',
  },
})

const article = {
  id: 'article-one',
  title: 'A Distant Article',
  subtype: 'article' as const,
  imageUrl: null,
  author: 'Ada Author',
  publication: 'Example Journal',
  publishedAt: { value: '2020', precision: 'year' as const, basis: 'source_asserted' as const },
  readingTime: { raw: '8 mins', minutes: 8 },
  progress: { value: 0.5, valid: true },
  opened: true,
  archive: { active: true, count: 1, latestAt: '2026-09-12T10:00:00.000Z' },
  queue: { active: false, state: null, addedAt: null },
  feed: { active: false, arrivedAt: null },
  currentAvailable: true,
  searchExcerpt: null,
}
const articlesResponse = (data = [article], nextCursor: string | null = null) => ({
  data,
  nextCursor,
  sectionCounts: { archive: 72, queue: 178, feed: 666 },
  totalCount: 72,
  filteredCount: data.length,
  occurrenceCount: data.reduce((sum, item) => sum + item.archive.count, 0),
  facets: {
    types: [{ value: 'article', label: 'article', count: 72 }],
    authors: [{ value: 'ada author', label: 'Ada Author', count: 1 }],
    publications: [{ value: 'example journal', label: 'Example Journal', count: 1 }],
    readingTimes: [{ value: '5to15', label: '5–15 min', count: 1 }],
    progress: [{ value: 'inProgress', label: 'In progress', count: 1 }],
    currentStates: [{ value: 'archive', label: 'Archive', count: 1 }],
    queueStates: [],
    opened: [{ value: 'opened', label: 'Opened', count: 1 }],
    history: [{ value: 'archived', label: 'Archived before', count: 1 }],
    publishedUnknown: 0,
    readingTimeUnknown: 0,
    progressUnknown: 0,
    dateUnknown: 0,
  },
  capabilities: { fullTextSearch: true, highlights: true },
  coverage: {
    allLocationsBackfilled: true,
    highlightsBackfilled: true,
    fullTextPolicy: 'archive_queue' as const,
    lastSuccessfulSyncAt: '2026-09-20T10:00:00.000Z',
  },
})

test('keeps every Article toolbar control visible at intermediate desktop width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 853, height: 900 })
  await page.route('**/api/library/articles?*', (route) =>
    route.fulfill({ json: articlesResponse() }),
  )
  await page.goto('/library/articles/archive')
  await expect(page.getByRole('button', { name: 'Expanded' })).toBeVisible()
  const box = await page.getByRole('button', { name: 'Expanded' }).boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x + box!.width).toBeLessThanOrEqual(853)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(853)
})

test('uses the dense Music Artist list by default', async ({ page }) => {
  await page.route('**/api/library/music?*', (route) => route.fulfill({ json: musicResponse([]) }))
  await page.goto('/library/music/artists')
  await expect(page.getByRole('button', { name: 'List view' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

const podcast = {
  id: 'podcast-one',
  kind: 'episode' as const,
  title: 'A Distant Episode',
  subtitle: 'A Distant Show',
  imageUrl: null,
  date: '2026-09-12T10:00:00.000Z',
  publishedAt: '2026-09-01',
  durationMs: 3_600_000,
  observedMs: 1_800_000,
  playbackCount: 2,
  inArchive: true,
  inQueue: false,
  following: true,
  archiveEpisodeCount: 0,
  queueEpisodeCount: 0,
  totalEpisodes: null,
  canonicalUrl: 'https://open.spotify.com/episode/episode-one',
}
const podcastsResponse = (data = [podcast], nextCursor: string | null = null) => ({
  data,
  nextCursor,
  totalCount: data.length,
  filteredCount: data.length,
  sectionCounts: { archive: 12, queue: 4, following: 3 },
})
const track = {
  id: 'track-one',
  kind: 'track' as const,
  title: 'A Distant Track',
  subtitle: 'Ada Artist',
  album: 'A Distant Album',
  imageUrl: null,
  latestPlayedAt: '2026-09-12T10:00:00.000Z',
  playbackCount: 4,
  observedMs: 600_000,
  observedDurationKnown: true,
  trackCount: 1,
  releaseCount: 1,
  explicit: false,
  metadataState: 'current',
  canonicalUrl: 'https://open.spotify.com/track/track-one',
}
const musicResponse = (data = [track], nextCursor: string | null = null) => ({
  data,
  nextCursor,
  totalCount: data.length,
  filteredCount: data.length,
  sectionCounts: { tracks: 24, albums: 8, artists: 6 },
})
const video = {
  id: 'video-one',
  kind: 'video' as const,
  title: 'A Distant Video',
  channelId: 'channel-one',
  channelTitle: 'A Distant Channel',
  imageUrl: null,
  canonicalUrl: 'https://www.youtube.com/watch?v=video-one',
  date: '2026-09-12T10:00:00.000Z',
  publishedAt: null,
  durationMs: null,
  availability: 'not_configured' as const,
  formats: [],
  inArchive: true,
  inQueue: false,
  watchCount: 2,
  matchingWatchCount: 2,
  watchAccountCount: 1,
  matchingWatchAccountCount: 1,
  queueAccountCount: 0,
  matchingQueueCount: 0,
  matchingQueueAccountCount: 0,
  archiveVideoCount: 0,
  queueVideoCount: 0,
}
const videosResponse = (data = [video], nextCursor: string | null = null) => ({
  data,
  nextCursor,
  totalCount: data.length,
  filteredCount: data.length,
  sectionCounts: { archive: 20_227, queue: 110, channels: 2_400 },
  occurrenceCount: 23_865,
  facets: { accounts: [], channels: [], categories: [] },
  coverage: {
    watchLater: 'complete' as const,
    catalog: 'not_configured' as const,
  },
})

test.beforeEach(async ({ page }) => {
  await page.route('**/api/library/books?*', (route) => route.fulfill({ json: booksResponse() }))
})

test('shows the production Books shell and preserves Connections', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveURL(/\/library\/books\/archive/)
  await expect(page.getByRole('heading', { name: 'Books' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Archive 128' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Queue 986' })).toBeVisible()
  await expect(page.getByText('Local API connected')).toBeVisible()

  await page.getByRole('link', { name: 'Connections' }).click()

  await expect(page.getByRole('heading', { name: 'Connections' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Readwise Reader' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'YouTube', exact: true }).first()).toBeVisible()
})

test('keeps Books collection controls in the URL and loads subsequent pages', async ({ page }) => {
  const requested: string[] = []
  await page.unroute('**/api/library/books?*')
  await page.route('**/api/library/books?*', async (route) => {
    const url = new URL(route.request().url())
    requested.push(url.search)
    const second = url.searchParams.has('cursor')
    const searched = url.searchParams.get('q') === 'Ada'
    await route.fulfill({
      json: booksResponse(
        [
          {
            ...book,
            id: second ? 'book-two' : 'book-one',
            title: second ? 'Second Book' : 'A Distant Book',
          },
        ],
        searched || second ? null : 'next-page',
      ),
    })
  })
  await page.route('**/api/library/books/book-one', (route) =>
    route.fulfill({
      json: {
        id: book.id,
        title: book.title,
        subtitle: null,
        description: 'A concise overview.',
        coverUrl: null,
        coverColor: '#667788',
        publicationDate: '2020',
        publicationPrecision: 'year',
        pageCount: 320,
        audioSeconds: null,
        memberships: book.memberships,
        personalRating: 4.5,
        series: [],
        contributors: [{ role: 'Author', contributors: book.authors }],
        selectedEdition: null,
        community: {
          rating: null,
          ratingsCount: 0,
          genres: [],
          moods: [],
          pace: [],
          contentWarnings: [],
        },
        source: { label: 'Hardcover', url: null, refreshedAt: null, coverage: 'complete' },
      },
    }),
  )
  await page.goto('/library/books/archive')
  await expect(page.getByRole('button', { name: /A Distant Book/ })).toBeVisible()
  await page.getByRole('button', { name: 'Load more' }).click()
  await expect(page.getByRole('button', { name: /Second Book/ })).toBeVisible()
  const requestsAfterPaging = requested.length
  await page.getByRole('button', { name: 'List view' }).click()
  await expect(page).toHaveURL(/layout=list/)
  await expect(page.getByRole('button', { name: /Second Book/ })).toBeVisible()
  await page.getByRole('button', { name: /A Distant Book/ }).click()
  await expect(page).toHaveURL(/item=book-one/)
  await page.getByRole('button', { name: 'Close inspector' }).last().click()
  await expect(page.getByRole('button', { name: /Second Book/ })).toBeVisible()
  expect(requested).toHaveLength(requestsAfterPaging)
  expect(requested.every((value) => !value.includes('layout=') && !value.includes('item='))).toBe(
    true,
  )
  await page.getByRole('textbox', { name: 'Search books' }).fill('Ada')
  await page.getByRole('textbox', { name: 'Search books' }).press('Enter')
  await expect(page).toHaveURL(/q=Ada/)
  await page.getByRole('button', { name: 'Sort ascending' }).click()
  await expect(page).toHaveURL(/direction=asc/)
  expect(requested.some((value) => value.includes('cursor=next-page'))).toBe(true)
  expect(requested.some((value) => value.includes('q=Ada'))).toBe(true)
})

test('opens a selected Book and loads personal activity in History', async ({ page }) => {
  await page.route('**/api/library/books/book-one', (route) =>
    route.fulfill({
      json: {
        id: book.id,
        title: book.title,
        subtitle: null,
        description: 'A concise overview.',
        coverUrl: null,
        coverColor: '#667788',
        publicationDate: '2020',
        publicationPrecision: 'year',
        pageCount: 320,
        audioSeconds: null,
        memberships: book.memberships,
        personalRating: 4.5,
        series: [],
        contributors: [{ role: 'Author', contributors: book.authors }],
        selectedEdition: null,
        community: {
          rating: 4.1,
          ratingsCount: 10,
          genres: ['Fiction'],
          moods: [],
          pace: [],
          contentWarnings: [],
        },
        source: {
          label: 'Hardcover',
          url: null,
          refreshedAt: '2026-09-20T10:00:00.000Z',
          coverage: 'complete',
        },
      },
    }),
  )
  await page.route('**/api/library/books/book-one/history*', (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: 'read-one',
            kind: 'read',
            label: 'Read',
            date: '2026-09-12',
            datePrecision: 'day',
            detail: null,
            edition: { id: 'edition-one', format: 'Paperback', title: book.title },
          },
        ],
        nextCursor: null,
      },
    }),
  )
  await page.goto('/library/books/archive')
  await page.getByRole('button', { name: /A Distant Book/ }).click()
  await expect(page).toHaveURL(/item=book-one/)
  await expect(page.getByText('A concise overview.')).toBeVisible()
  await page.getByRole('tab', { name: 'History' }).click()
  await expect(page.getByText('Paperback')).toBeVisible()
  await page.getByRole('button', { name: 'Close inspector' }).last().click()
  await expect(page.getByRole('button', { name: /A Distant Book/ })).toBeFocused()
})

test('keeps loaded Movies pages while changing layout and inspecting History', async ({ page }) => {
  const requested: string[] = []
  await page.route('**/api/library/movies?*', async (route) => {
    const url = new URL(route.request().url())
    requested.push(url.search)
    const second = url.searchParams.has('cursor')
    await route.fulfill({
      json: moviesResponse(
        [
          {
            ...movie,
            id: second ? 'movie-two' : 'movie-one',
            displayTitle: second ? 'Second Movie' : movie.displayTitle,
            importedTitle: second ? 'Second Movie' : movie.importedTitle,
          },
        ],
        second ? null : 'next-movies-page',
      ),
    })
  })
  await page.route('**/api/library/movies/movie-one', (route) =>
    route.fulfill({
      json: {
        ...movie,
        personal: { ...movie.personal, reviewedOccurrenceCount: 1 },
        overview: null,
        originalTitle: null,
        originalLanguage: null,
        releaseDate: null,
        tagline: null,
        backdropUrl: null,
        genres: [],
        cast: [],
        countries: [],
        tmdbRating: null,
        tmdbVoteCount: null,
        source: {
          letterboxdUrl: 'https://letterboxd.com/film/a-distant-movie/',
          tmdbUrl: null,
          imdbUrl: null,
          connectionLabel: 'Letterboxd',
          coverage: 'complete',
          lastCompleteExportAt: '2026-09-12T10:00:00.000Z',
          lastRssSuccessAt: '2026-09-20T10:00:00.000Z',
          metadataStatus: 'not_configured',
        },
      },
    }),
  )
  await page.route('**/api/library/movies/movie-one/history*', (route) =>
    route.fulfill({
      json: {
        data: [
          {
            archiveEntryId: 'watch-one',
            watchedAt: {
              value: '2026-09-12',
              precision: 'day',
              basis: 'source_asserted',
            },
            sourceRecordedAt: null,
            rating: { value: 4.5, minimum: 0.5, maximum: 5 },
            reviewText: 'A personal review.',
            sourceRewatch: true,
            letterboxdLogUrl: 'https://letterboxd.com/example/film/a-distant-movie/',
            letterboxdFilmUrl: 'https://letterboxd.com/film/a-distant-movie/',
            matchesFilter: true,
            connection: { id: 'letterboxd-one', label: 'Letterboxd' },
          },
          {
            archiveEntryId: 'watch-two',
            watchedAt: null,
            sourceRecordedAt: {
              value: '2026-09-01',
              precision: 'day',
              basis: 'source_asserted',
            },
            rating: null,
            reviewText: null,
            sourceRewatch: false,
            letterboxdLogUrl: null,
            letterboxdFilmUrl: 'https://letterboxd.com/film/a-distant-movie/',
            matchesFilter: true,
            connection: { id: 'letterboxd-one', label: 'Letterboxd' },
          },
        ],
        nextCursor: null,
      },
    }),
  )

  await page.goto('/library/movies/archive')
  await expect(page.getByRole('heading', { name: 'Movies' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Archive 372' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Queue 309' })).toBeVisible()
  await page.getByRole('button', { name: 'Load more movies' }).click()
  await expect(page.getByRole('button', { name: /Second Movie/ })).toBeVisible()

  const requestsAfterPaging = requested.length
  await page.getByRole('button', { name: 'List view' }).click()
  await expect(page).toHaveURL(/view=list/)
  await expect(page.getByRole('button', { name: /Second Movie/ })).toBeVisible()
  await page.getByRole('button', { name: /A Distant Movie/ }).click()
  await expect(page).toHaveURL(/item=movie-one/)
  await expect(page.getByText('TMDB metadata is not configured.')).toBeVisible()
  await expect(
    page.getByText('Reviewed occurrences').locator('xpath=following-sibling::dd[1]'),
  ).toHaveText('1')
  await page.getByRole('tab', { name: 'History (2)' }).click()
  await expect(page.getByText('A personal review.')).toBeVisible()
  await expect(page.getByRole('link', { name: /Open film on Letterboxd/ })).toBeVisible()
  await page.getByRole('button', { name: 'Close inspector' }).last().click()
  await expect(page.getByRole('button', { name: /Second Movie/ })).toBeVisible()
  expect(requested).toHaveLength(requestsAfterPaging)
  expect(requested.every((value) => !value.includes('view=') && !value.includes('item='))).toBe(
    true,
  )
})

test('labels TMDB TV creators correctly in a Letterboxd-logged series', async ({ page }) => {
  const series = {
    ...movie,
    displayTitle: 'Over the Garden Wall',
    importedTitle: 'Over the Garden Wall',
    directors: ['Patrick McHale'],
    enrichment: {
      provider: 'tmdb' as const,
      mediaType: 'tv' as const,
      status: 'matched' as const,
      refreshedAt: '2026-09-21T10:00:00.000Z',
    },
  }
  await page.route('**/api/library/movies?*', (route) =>
    route.fulfill({ json: moviesResponse([series]) }),
  )
  await page.route('**/api/library/movies/movie-one', (route) =>
    route.fulfill({
      json: {
        ...series,
        personal: { ...series.personal, reviewedOccurrenceCount: 0 },
        overview: 'A miniseries.',
        originalTitle: series.displayTitle,
        originalLanguage: 'en',
        releaseDate: '2014-11-03',
        tagline: null,
        backdropUrl: null,
        genres: ['Animation'],
        cast: [],
        countries: [],
        tmdbRating: null,
        tmdbVoteCount: null,
        source: {
          letterboxdUrl: 'https://boxd.it/example',
          tmdbUrl: 'https://www.themoviedb.org/tv/61617',
          imdbUrl: null,
          connectionLabel: 'Letterboxd',
          coverage: 'complete',
          lastCompleteExportAt: null,
          lastRssSuccessAt: null,
          metadataStatus: 'matched',
        },
      },
    }),
  )
  await page.goto('/library/movies/archive')
  await page.getByRole('button', { name: /Over the Garden Wall/ }).click()
  await expect(page.getByText('Creators', { exact: true })).toBeVisible()
  await expect(page.getByText('Patrick McHale', { exact: true })).toBeVisible()
})

test('keeps incomplete Movie filter drafts out of API requests', async ({ page }) => {
  const requested: URL[] = []
  await page.route('**/api/library/movies?*', async (route) => {
    requested.push(new URL(route.request().url()))
    await route.fulfill({ json: moviesResponse() })
  })

  await page.goto('/library/movies/archive')
  await expect(page.getByRole('heading', { name: 'Movies' })).toBeVisible()
  await page.getByRole('button', { name: /Filters/ }).click()

  await page
    .getByRole('group', { name: 'Watched date' })
    .getByRole('combobox')
    .selectOption('range')
  await page.getByRole('group', { name: 'Release year' }).getByLabel('Release year from').fill('20')
  await page
    .getByRole('group', { name: 'Your rating' })
    .getByRole('combobox')
    .first()
    .selectOption('range')

  await expect(page).toHaveURL(/watched=range/)
  await expect(page).toHaveURL(/releaseYearFrom=/)
  expect(
    requested.every(
      (url) =>
        url.searchParams.get('watched') !== 'range' &&
        url.searchParams.get('rating') !== 'range' &&
        url.searchParams.get('releaseYearFrom') !== '20',
    ),
  ).toBe(true)

  await page.getByLabel('Watched date from').fill('2020-01-01')
  await page.getByLabel('Release year from').fill('2020')
  await page.getByLabel('Minimum rating').selectOption('4')
  await expect
    .poll(() =>
      requested.some(
        (url) =>
          url.searchParams.get('watchedFrom') === '2020-01-01' &&
          url.searchParams.get('releaseYearFrom') === '2020' &&
          url.searchParams.get('ratingMin') === '4',
      ),
    )
    .toBe(true)
})

test('keeps loaded Article pages while changing density and inspecting History', async ({
  page,
}) => {
  const requested: string[] = []
  await page.route('**/api/library/articles?*', async (route) => {
    const url = new URL(route.request().url())
    requested.push(url.search)
    const second = url.searchParams.has('cursor')
    await route.fulfill({
      json: articlesResponse(
        [
          {
            ...article,
            id: second ? 'article-two' : 'article-one',
            title: second ? 'Second Article' : article.title,
          },
        ],
        second ? null : 'next-articles-page',
      ),
    })
  })
  await page.route('**/api/library/articles/article-one', (route) =>
    route.fulfill({
      json: {
        ...article,
        sourceCategory: 'article',
        currentLocation: 'archive',
        acquisitionSource: 'web',
        summary: 'A concise article summary.',
        wordCount: 1200,
        documentNote: 'Remember this.',
        highlightDocumentNote: null,
        tags: [{ key: 'important', name: 'Important', type: 'manual' }],
        dates: {
          createdAt: null,
          savedAt: '2026-01-01T10:00:00.000Z',
          firstOpenedAt: '2026-02-01T10:00:00.000Z',
          lastOpenedAt: null,
          lastMovedAt: '2026-09-12T10:00:00.000Z',
          updatedAt: '2026-09-12T10:00:00.000Z',
          observedAt: '2026-09-20T10:00:00.000Z',
        },
        annotations: { active: 1, deleted: 0, discarded: 0 },
        content: { available: true, state: 'ready', coverage: 'full', failureClass: null },
        links: {
          original: 'https://example.com/article',
          reader: 'https://read.readwise.io/read/article-one',
        },
        readerRelationships: [
          {
            documentId: 'article-one',
            location: 'archive',
            available: true,
            readerUrl: 'https://read.readwise.io/read/article-one',
          },
        ],
        source: {
          connectionLabel: 'Readwise Reader',
          coverage: 'partial',
          sourceRefreshedAt: '2026-09-20T10:00:00.000Z',
        },
      },
    }),
  )
  await page.route('**/api/library/articles/article-one/history*', (route) =>
    route.fulfill({
      json: {
        data: [
          {
            archiveEntryId: 'archive-one',
            archivedAt: {
              value: '2026-09-12T10:00:00.000Z',
              precision: 'instant',
              basis: 'inferred',
            },
            sourceRecordedAt: null,
            admissionReason: 'readwise_archive_state',
            disposition: 'current',
            connection: { id: 'readwise-one', label: 'Readwise Reader' },
          },
        ],
        nextCursor: null,
      },
    }),
  )
  await page.route('**/api/library/articles/article-one/highlights*', (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: 'highlight-one',
            text: 'A useful passage.',
            note: 'My note.',
            favorite: false,
            highlightedAt: '2026-09-12T10:00:00.000Z',
            location: 'order 1',
            readerUrl: 'https://readwise.io/open/highlight-one',
          },
        ],
        nextCursor: null,
      },
    }),
  )
  await page.goto('/library/articles/archive')
  await expect(page.getByRole('heading', { name: 'Articles' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Archive 72' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Queue 178' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Feed 666' })).toBeVisible()
  await page.getByRole('button', { name: 'Load more articles' }).click()
  await expect(page.getByRole('button', { name: /Second Article/ })).toBeVisible()
  const afterPaging = requested.length
  await page.getByRole('button', { name: 'Expanded' }).click()
  await expect(page).toHaveURL(/density=expanded/)
  await expect(page.getByRole('button', { name: /Second Article/ })).toBeVisible()
  await page.getByRole('button', { name: /A Distant Article/ }).click()
  await expect(page.getByText('A concise article summary.')).toBeVisible()
  await expect(page.getByText('1,200')).toBeVisible()
  await expect(page.getByText('Readwise Reader · archive')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Reader relationships' })).toBeVisible()
  await page.getByRole('tab', { name: 'History' }).click()
  await expect(page.getByText('Current state')).toBeVisible()
  await expect(page.getByText('50%')).toBeVisible()
  await expect(page.getByText('Remember this.')).toBeVisible()
  await expect(page.getByText('A useful passage.')).toBeVisible()
  await expect(page.getByText('My note.')).toBeVisible()
  await page.getByRole('button', { name: 'Close inspector' }).last().click()
  await expect(page.getByRole('button', { name: /Second Article/ })).toBeVisible()
  expect(requested).toHaveLength(afterPaging)
  expect(requested.every((value) => !value.includes('density=') && !value.includes('item='))).toBe(
    true,
  )
})

test('shows separate account progress and resumes the selected account', async ({ page }) => {
  let resumed = false
  await page.route('**/api/connections', (route) =>
    route.fulfill({
      json: {
        data: ['first', 'second'].map((id, index) => ({
          id,
          label: `YouTube ${id} account`,
          source: 'youtube',
          status: 'connected',
          coverage: 'complete',
          lastSuccessfulSyncAt: null,
          lastAttemptedSyncAt: null,
          lastExportAt: null,
          incompleteImports:
            index === 1 && !resumed
              ? [
                  {
                    importId: 'synthetic-hash',
                    status: 'processing',
                    nextOffset: 100,
                    totalRecords: 200,
                  },
                ]
              : [],
        })),
      },
    }),
  )
  await page.route('**/api/sync-runs*', (route) =>
    route.fulfill({ json: { data: [], nextCursor: null } }),
  )
  await page.route('**/api/connections/youtube/import/synthetic-hash/continue*', async (route) => {
    expect(new URL(route.request().url()).searchParams.get('connectionId')).toBe('second')
    resumed = true
    await route.fulfill({
      json: {
        syncRunId: 'run',
        importId: 'synthetic-hash',
        alreadyImported: false,
        completed: true,
        nextOffset: null,
        totalRecords: 200,
        activityCards: 200,
        videos: 100,
        archiveEntries: 100,
        sourceRecords: 100,
        unresolvedRecords: 0,
        ignoredRecords: 0,
        watchLaterRecords: 0,
      },
    })
  })
  await page.goto('/connections')
  await expect(page.getByText('YouTube first account', { exact: true })).toBeVisible()
  await expect(page.getByText('YouTube second account', { exact: true })).toBeVisible()
  await expect(page.getByText('Import processing: 100 / 200 records committed.')).toBeVisible()
  await page.getByRole('button', { name: 'Resume import' }).click()
  await expect(page.getByRole('button', { name: 'Resume import' })).toHaveCount(0)
  expect(resumed).toBe(true)
})
