import { installDefaultApiMocks } from './default-api-mocks'
import { expect, test, type Page } from '@playwright/test'
async function checkInspectorTabs(page: Page, label: string) {
  const inspector = page.locator(`aside[aria-label="${label}"]`)
  const tabs = inspector.getByRole('tablist').first().getByRole('tab')
  const first = tabs.first()
  await expect(first).toHaveAttribute('aria-selected', 'true')
  for (const trigger of await tabs.all()) {
    await expect(trigger).toHaveAttribute('aria-controls', /.+/)
    const id = await trigger.getAttribute('aria-controls')
    const panel = page.locator(`[id="${id}"]`)
    await expect(panel).toHaveAttribute('role', 'tabpanel')
    if ((await trigger.getAttribute('aria-selected')) === 'false') await expect(panel).toBeHidden()
  }
  await first.press('ArrowRight')
  await expect(tabs.nth(1)).toBeFocused()
  await tabs.nth(1).press('Enter')
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')
  await expect(tabs.nth(1)).toHaveAttribute('aria-controls', /.+/)
  const association = await tabs.nth(1).evaluate((tab) => {
    const panel = document.getElementById(tab.getAttribute('aria-controls')!)
    return {
      panel: panel?.getAttribute('role'),
      labelledBy: panel?.getAttribute('aria-labelledby'),
      triggerId: tab.id,
      font: getComputedStyle(tab).fontSize,
    }
  })
  expect(association.panel).toBe('tabpanel')
  expect(association.labelledBy).toBe(association.triggerId)
  expect(association.font).toBe('14px')
  await tabs.nth(1).press('Home')
  await first.press('Enter')
  await expect(first).toBeFocused()
  await expect(first).toHaveAttribute('aria-selected', 'true')
}

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
  await page.route('**/api/library/podcasts{,/summary}?*', (route) =>
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
  await expect(page.getByText('1 episode', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Filters' }).click()
  await page.getByRole('checkbox', { name: 'A Distant Show 2' }).check()
  await expect(page).toHaveURL(/show=%5B%22show-one%22%5D/)
  await expect(page.getByRole('group', { name: /Shows \(1 selected\)/ })).toBeVisible()
})

test('searches and applies complete Music artist facet options', async ({ page }) => {
  await page.route('**/api/library/music{,/summary}?*', (route) =>
    route.fulfill({ json: musicResponse() }),
  )
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

test('keeps loaded Podcast pages while opening the inspector in list-only Archive', async ({
  page,
}) => {
  const requested: string[] = []
  await page.route('**/api/library/podcasts{,/summary}?*', async (route) => {
    const url = new URL(route.request().url())
    if (!url.pathname.endsWith('/summary') && url.searchParams.get('section') === 'archive')
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
  await page.locator('[data-ui~="library-collection"]').evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(page.getByRole('button', { name: /Second Episode/ })).toBeVisible()
  const afterPaging = requested.length
  await expect(page.getByRole('button', { name: 'Grid view' })).toHaveCount(0)
  await page.getByRole('button', { name: /A Distant Episode/ }).click()
  await expect(page.getByText('Episode description.')).toBeVisible()
  await checkInspectorTabs(page, 'Podcast inspector')
  await expect(page.getByText('1969', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close inspector' }).click()
  await expect(page.getByRole('button', { name: /A Distant Episode/ })).toBeFocused()
  await expect(page.getByRole('button', { name: /Second Episode/ })).toBeVisible()
  expect(requested).toHaveLength(afterPaging)
  expect(requested.every((value) => !value.includes('layout=') && !value.includes('item='))).toBe(
    true,
  )
})

test('keeps loaded Music pages while opening the inspector in list-only Tracks', async ({
  page,
}) => {
  const requested: string[] = []
  await page.route('**/api/library/music{,/summary}?*', async (route) => {
    const url = new URL(route.request().url())
    if (!url.pathname.endsWith('/summary') && url.searchParams.get('section') === 'tracks')
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
  await page.locator('[data-ui~="library-collection"]').evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(page.getByRole('button', { name: /Second Track/ })).toBeVisible()
  const afterPaging = requested.length
  await expect(page.getByRole('button', { name: 'Grid view' })).toHaveCount(0)
  await page.getByRole('button', { name: /A Distant Track/ }).click()
  await expect(page.getByRole('heading', { name: 'A Distant Track' })).toBeVisible()
  await checkInspectorTabs(page, 'Music inspector')
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
  await page.route('**/api/library/music{,/summary}?*', (route) =>
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
        relatedTracks: [{ id: 'track-one', title: 'A Distant Track', playbackCount: 1 }],
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
  await expect(page.getByText('1 observation', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: /History/ }).click()
  await expect(page.getByRole('link', { name: 'A Distant Track' })).toBeVisible()
  await page.getByRole('tab', { name: /^Artists / }).click()
  await expect(page).toHaveURL(/\/library\/music\/artists/)
  await expect(page).not.toHaveURL(/[?&]item=/)
  await expect(page.getByRole('complementary', { name: 'Music inspector' })).toHaveCount(0)
})

test('keeps loaded Video pages while changing layout and opening the inspector', async ({
  page,
}) => {
  const requested: string[] = []
  await page.route('**/api/library/videos{,/summary}?*', async (route) => {
    const url = new URL(route.request().url())
    if (!url.pathname.endsWith('/summary') && url.searchParams.get('section') === 'archive')
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
  await page.locator('[data-ui~="library-collection"]').evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(page.getByRole('button', { name: /Second Video/ })).toBeVisible()
  const afterPaging = requested.length
  await page.getByRole('button', { name: 'Grid view' }).click()
  await page.getByRole('button', { name: /A Distant Video/ }).click()
  await expect(page.getByRole('heading', { name: 'A Distant Video' })).toBeVisible()
  await checkInspectorTabs(page, 'Video inspector')
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

test('uses the dense Music Artist list by default', async ({ page }) => {
  await page.route('**/api/library/music{,/summary}?*', (route) =>
    route.fulfill({ json: musicResponse([]) }),
  )
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
  await installDefaultApiMocks(page)
  await page.route('**/api/library/books{,/summary}?*', (route) =>
    route.fulfill({ json: booksResponse() }),
  )
})

for (const scenario of [
  {
    media: 'books',
    start: 'archive',
    next: 'Queue',
    nav: 'Book collections',
    response: booksResponse,
  },
  {
    media: 'movies',
    start: 'archive',
    next: 'Queue',
    nav: 'Movie collections',
    response: moviesResponse,
  },
  {
    media: 'articles',
    start: 'archive',
    next: 'Queue',
    nav: 'Article sections',
    response: articlesResponse,
  },
  {
    media: 'podcasts',
    start: 'archive',
    next: 'Queue',
    nav: 'Podcast sections',
    response: podcastsResponse,
  },
  {
    media: 'music',
    start: 'tracks',
    next: 'Albums',
    nav: 'Music sections',
    response: musicResponse,
  },
  {
    media: 'videos',
    start: 'archive',
    next: 'Queue',
    nav: 'Video sections',
    response: videosResponse,
  },
]) {
  test(`holds section counts and tab geometry while switching ${scenario.media}`, async ({
    page,
  }) => {
    let hold = false
    let release = () => {}
    let markRequested = () => {}
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const requested = new Promise<void>((resolve) => {
      markRequested = resolve
    })
    await page.route(`**/api/library/${scenario.media}{,/summary}?*`, async (route) => {
      if (hold) {
        markRequested()
        await pending
      }
      const response = scenario.response()
      // Fresh totals must also survive returning to an older cached section.
      if (hold && 'sectionCounts' in response && 'channels' in response.sectionCounts) {
        response.sectionCounts.queue = 111
      }
      await route.fulfill({ json: response })
    })
    await page.goto(`/library/${scenario.media}/${scenario.start}`)
    const nav = page.getByRole('navigation', { name: scenario.nav })
    await expect(page.locator('[data-ui~="workspace-header"]').getByRole('tablist')).toBeVisible()
    await expect(page.locator('[data-ui~="books-header"]')).toHaveCount(0)
    expect(
      await page
        .locator('[data-ui~="workspace-breadcrumb"] strong')
        .evaluate((e) => getComputedStyle(e).fontSize),
    ).toBe('14px')
    await expect(nav.locator('span').first()).not.toHaveText('—')
    await expect
      .poll(() =>
        nav
          .locator('[aria-selected="true"]')
          .evaluate((e) => getComputedStyle(e, '::after').height),
      )
      .toBe('2px')
    const geometry = () =>
      nav.locator('a').evaluateAll((links) =>
        links.map((link) => {
          const rect = link.getBoundingClientRect()
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        }),
      )
    const nextPath = `/library/${scenario.media}/${scenario.next.toLowerCase()}`
    await expect
      .poll(
        () =>
          page.evaluate((path) => {
            const saved = localStorage.getItem('media-tracker:library-initial-pages:v2')
            return saved
              ? JSON.parse(saved).entries.some((entry: { path: string }) => entry.path === path)
              : false
          }, nextPath),
        { timeout: 15_000 },
      )
      .toBe(true)
    const before = await geometry()
    const counts = await nav.locator('span').allTextContents()
    // A warm section stays visible during a refresh once its ten-minute window expires.
    await page.clock.setFixedTime((await page.evaluate(() => Date.now())) + 11 * 60_000)
    hold = true
    try {
      await nav.getByRole('tab', { name: new RegExp(`^${scenario.next} `) }).click()
      await requested
      await expect(nav.locator('a[aria-current="page"]')).toContainText(scenario.next)
      expect(await geometry()).toEqual(before)
      await expect(nav.locator('span')).toHaveText(counts)
      const results = page.locator(
        '[data-ui~="book-row"], [data-ui~="movie-row"], [data-ui~="article-row"], [data-ui~="spotify-result"], [data-ui~="video-result"]',
      )
      await expect(results).toHaveCount(1)
      release()
      await expect(results).toHaveCount(1)
      const freshCounts = scenario.media === 'videos' ? [counts[0]!, '111', counts[2]!] : counts
      expect(await geometry()).toEqual(before)
      await expect(nav.locator('span')).toHaveText(freshCounts)
      await nav
        .getByRole('tab', {
          name: new RegExp(`^${scenario.start === 'tracks' ? 'Tracks' : 'Archive'} `),
        })
        .click()
      await expect(nav.locator('span')).toHaveText(freshCounts)
      expect(await geometry()).toEqual(before)
    } finally {
      release()
    }
  })
}

test('shows the production Books shell and preserves Connections', async ({ page }) => {
  await page.route('**/api/connections', (route) =>
    route.fulfill({
      json: {
        data: ['readwise', 'youtube'].map((source) => ({
          id: `synthetic-${source}`,
          label: source,
          source,
          status: 'connected',
          coverage: 'complete',
          lastSuccessfulSyncAt: null,
          lastAttemptedSyncAt: null,
          lastExportAt: null,
          incompleteImports: [],
        })),
      },
    }),
  )
  await page.route('**/api/sync-runs*', (route) =>
    route.fulfill({ json: { data: [], nextCursor: null } }),
  )
  await page.goto('/')

  await expect(page).toHaveURL(/\/library\/books\/archive/)
  await expect(page.getByRole('heading', { name: 'Books' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Archive 128' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Queue 986' })).toBeVisible()
  await expect(page.getByText('Local API connected')).toBeVisible()

  await page.getByRole('link', { name: 'Connections' }).click()

  await expect(page.getByRole('region', { name: 'Connections', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Readwise Reader' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'YouTube', exact: true }).first()).toBeVisible()
})

test('keeps Books collection controls in the URL and loads subsequent pages', async ({ page }) => {
  const requested: string[] = []
  await page.unroute('**/api/library/books{,/summary}?*')
  await page.route('**/api/library/books{,/summary}?*', async (route) => {
    const url = new URL(route.request().url())
    if (!url.pathname.endsWith('/summary') && url.searchParams.get('section') === 'archive')
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
  await page.locator('[data-ui~="library-collection"]').evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(page.getByRole('button', { name: /Second Book/ })).toBeVisible()
  const requestsAfterPaging = requested.length
  await page.getByRole('button', { name: 'Grid view' }).click()
  await expect(page).toHaveURL(/layout=grid/)
  await expect(page.getByRole('button', { name: /Second Book/ })).toBeVisible()
  const cardBefore = await page.getByRole('button', { name: /A Distant Book/ }).boundingBox()
  await page.getByRole('button', { name: /A Distant Book/ }).click()
  await expect(page).toHaveURL(/item=book-one/)
  const cardAfter = await page.getByRole('button', { name: /A Distant Book/ }).boundingBox()
  expect(cardAfter!.width).toBeCloseTo(cardBefore!.width, 0)
  expect(cardAfter!.height).toBeCloseTo(cardBefore!.height, 0)
  await page.getByRole('button', { name: 'Close inspector' }).last().click()
  await expect(page.getByRole('button', { name: /Second Book/ })).toBeVisible()
  expect(requested).toHaveLength(requestsAfterPaging)
  expect(requested.every((value) => !value.includes('layout=') && !value.includes('item='))).toBe(
    true,
  )
  await page.getByRole('textbox', { name: 'Search books' }).fill('Ada')
  await expect(page).toHaveURL(/q=Ada/)
  await page.getByRole('button', { name: 'Sort ascending' }).click()
  await expect(page).toHaveURL(/direction=asc/)
  expect(requested.some((value) => value.includes('cursor=next-page'))).toBe(true)
  expect(requested.some((value) => value.includes('q=Ada'))).toBe(true)
})

test('keeps Books range drafts valid until a boundary is entered', async ({ page }) => {
  const invalid: string[] = []
  const requested: URL[] = []
  await page.route('**/api/library/books{,/summary}?*', async (route) => {
    const url = new URL(route.request().url())
    if (!url.pathname.endsWith('/summary')) requested.push(url)
    const bad = ['finished', 'published', 'added'].some(
      (prefix) =>
        url.searchParams.get(`${prefix}Mode`) === 'range' &&
        !url.searchParams.get(`${prefix}From`) &&
        !url.searchParams.get(`${prefix}To`),
    )
    if (bad) invalid.push(url.search)
    await route.fulfill({
      status: bad ? 400 : 200,
      json: bad ? { error: { message: 'Invalid range' } } : booksResponse(),
    })
  })
  await page.goto('/library/books/archive')
  await expect(page.locator('[data-ui~="book-row"]').first()).toBeVisible()
  await page.getByRole('button', { name: 'Filters', exact: true }).click()
  for (const label of ['Finished', 'Published']) {
    const select = page.getByRole('combobox', { name: label, exact: true })
    await select.click()
    await expect(select).toHaveAttribute('aria-expanded', 'true')
    const listId = await select.getAttribute('aria-controls')
    expect(listId).toBeTruthy()
    await page
      .locator(`[id="${listId}"]`)
      .getByRole('option', { name: 'Custom range', exact: true })
      .click()
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await expect(page.locator('[data-ui~="book-row"]').first()).toBeVisible()
    await page.getByRole('textbox', { name: `${label} from`, exact: true }).fill('2020-01-01')
    await expect
      .poll(() =>
        requested.some(
          (url) =>
            url.searchParams.get(`${label === 'Finished' ? 'finished' : 'published'}From`) ===
            '2020-01-01',
        ),
      )
      .toBe(true)
    await page.getByRole('textbox', { name: `${label} from`, exact: true }).fill('')
    await expect(page).toHaveURL(
      (url) => !url.searchParams.has(`${label === 'Finished' ? 'finished' : 'published'}From`),
    )
    await expect(page.locator('[data-ui~="book-row"]').first()).toBeVisible()
  }
  expect(invalid).toEqual([])
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('deselects a selected Book by clicking it again', async ({ page }) => {
  await page.route('**/api/library/books/book-one', (route) =>
    route.fulfill({ status: 404, json: { error: { message: 'Synthetic detail unavailable' } } }),
  )
  await page.goto('/library/books/archive')
  const card = page.getByRole('button', { name: /A Distant Book/ })
  await card.click()
  await expect(page).toHaveURL(/item=book-one/)
  await card.click()
  await expect(page).not.toHaveURL(/[?&]item=/)
  await expect(page.getByRole('complementary', { name: 'Book inspector' })).toHaveCount(0)
})

test('searches Books without Enter and clears the applied query', async ({ page }) => {
  const requested: URL[] = []
  await page.route('**/api/library/books{,/summary}?*', async (route) => {
    const url = new URL(route.request().url())
    if (!url.pathname.endsWith('/summary')) requested.push(url)
    await route.fulfill({ json: booksResponse(url.searchParams.get('q') ? [] : [book]) })
  })
  await page.goto('/library/books/archive')
  await expect(page.getByRole('button', { name: /A Distant Book/ })).toBeVisible()
  await page.getByRole('textbox', { name: 'Search books' }).fill('absent title')
  await expect(page).toHaveURL(/q=absent/)
  await expect(page.getByRole('button', { name: /A Distant Book/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Clear search', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Search books' })).toHaveValue('')
  await expect(page).not.toHaveURL(/[?&]q=/)
  await expect(page.getByRole('button', { name: /A Distant Book/ })).toBeVisible()
  expect(requested.some((url) => url.searchParams.get('q') === 'absent title')).toBe(true)
})

for (const media of ['movies', 'articles', 'podcasts', 'music', 'videos'] as const) {
  test(`applies ${media} search while typing and exposes clearing`, async ({ page }) => {
    const responses = {
      movies: moviesResponse(),
      articles: articlesResponse(),
      podcasts: podcastsResponse(),
      music: musicResponse(),
      videos: videosResponse(),
    }
    const queries: Array<string | null> = []
    await page.route(`**/api/library/${media}{,/summary}?*`, async (route) => {
      queries.push(new URL(route.request().url()).searchParams.get('q'))
      await route.fulfill({ json: responses[media] })
    })
    await page.goto(`/library/${media}/${media === 'music' ? 'tracks' : 'archive'}`)
    const search = page.getByRole('textbox', { name: `Search ${media}` })
    await search.fill('distant')
    await expect(page).toHaveURL(/q=distant/)
    await expect.poll(() => queries.includes('distant')).toBe(true)
    await page.getByRole('button', { name: 'Clear search', exact: true }).click()
    await expect(search).toHaveValue('')
    await expect(page).not.toHaveURL(/[?&]q=/)
  })
}

test('shares the saved layout across media and reloads while respecting explicit URLs', async ({
  page,
}) => {
  await page.route('**/api/library/movies{,/summary}?*', (route) =>
    route.fulfill({ json: moviesResponse() }),
  )
  await page.goto('/library/books/archive')
  const layouts = page.locator('[data-ui~="layout-toggle"] button')
  await expect(layouts.nth(0)).toHaveAttribute('aria-label', 'List view')
  await expect(layouts.nth(1)).toHaveAttribute('aria-label', 'Grid view')
  await expect(page.getByRole('button', { name: 'List view' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: 'Grid view' }).click()
  await page.getByRole('link', { name: 'Movies', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Grid view' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.reload()
  await expect(page.getByRole('button', { name: 'Grid view' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.goto('/library/movies/archive?view=list')
  await expect(page.getByRole('button', { name: 'List view' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: 'List view' }).click()
  await page.getByRole('link', { name: 'Books', exact: true }).click()
  await expect(page.getByRole('button', { name: 'List view' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
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
  await checkInspectorTabs(page, 'Book inspector')
  await page.getByRole('tab', { name: 'History' }).click()
  await expect(page.getByText('Paperback')).toBeVisible()
  await page.getByRole('button', { name: 'Close inspector' }).last().click()
  await expect(page.getByRole('button', { name: /A Distant Book/ })).toBeFocused()
})

test('keeps loaded Movies pages while changing layout and inspecting History', async ({ page }) => {
  const requested: string[] = []
  await page.route('**/api/library/movies{,/summary}?*', async (route) => {
    const url = new URL(route.request().url())
    if (!url.pathname.endsWith('/summary') && url.searchParams.get('section') === 'archive')
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
  await expect(page.getByRole('tab', { name: 'Archive 372' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Queue 309' })).toBeVisible()
  await page.locator('[data-ui~="library-collection"]').evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(page.getByRole('button', { name: /Second Movie/ })).toBeVisible()

  const requestsAfterPaging = requested.length
  await page.getByRole('button', { name: 'Grid view' }).click()
  await expect(page).toHaveURL(/layout=grid/)
  await expect(page.getByRole('button', { name: /Second Movie/ })).toBeVisible()
  await page.getByRole('button', { name: /A Distant Movie/ }).click()
  await expect(page).toHaveURL(/item=movie-one/)
  await expect(page.getByText('TMDB metadata is not configured.')).toBeVisible()
  await checkInspectorTabs(page, 'Movie inspector')
  await expect(
    page.getByText('Reviewed occurrences').locator('xpath=following-sibling::dd[1]'),
  ).toHaveText('1')
  await page.getByRole('tab', { name: 'History (2)' }).click()
  await expect(page.getByText('A personal review.')).toBeVisible()
  await expect(page.getByRole('link', { name: /Open film on Letterboxd/ })).toBeVisible()
  await page.getByRole('button', { name: 'Close inspector' }).last().click()
  await expect(page.getByRole('button', { name: /Second Movie/ })).toBeVisible()
  expect(requested).toHaveLength(requestsAfterPaging)
  expect(requested.every((value) => !value.includes('layout=') && !value.includes('item='))).toBe(
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
  await page.route('**/api/library/movies{,/summary}?*', (route) =>
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
  await expect(
    page
      .getByRole('complementary', { name: 'Movie inspector' })
      .getByText('Patrick McHale', { exact: true }),
  ).toBeVisible()
})

test('keeps incomplete Movie filter drafts out of API requests', async ({ page }) => {
  const requested: URL[] = []
  await page.route('**/api/library/movies{,/summary}?*', async (route) => {
    if (!new URL(route.request().url()).pathname.endsWith('/summary'))
      requested.push(new URL(route.request().url()))
    await route.fulfill({ json: moviesResponse() })
  })

  await page.goto('/library/movies/archive')
  await expect(page.getByRole('heading', { name: 'Movies' })).toBeVisible()
  await page.getByRole('button', { name: /Filters/ }).click()

  await page.getByRole('group', { name: 'Watched date' }).getByRole('combobox').click()
  await page.getByRole('option', { name: 'Custom range', exact: true }).click()
  await expect(page).toHaveURL(/watched=range/)
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await page.getByRole('group', { name: 'Release year' }).getByLabel('Release year from').fill('20')
  await expect(page).toHaveURL(/releaseYearFrom=(?:%22)?20/)
  const rating = page.getByRole('combobox', { name: 'Your rating', exact: true })
  await rating.click()
  await expect(rating).toHaveAttribute('aria-expanded', 'true')
  const ratingListId = await rating.getAttribute('aria-controls')
  expect(ratingListId).toBeTruthy()
  await page
    .locator(`[id="${ratingListId}"]`)
    .getByRole('option', { name: 'Custom range', exact: true })
    .click()

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
  await page.getByRole('combobox', { name: 'Minimum rating', exact: true }).click()
  await page.getByRole('option', { name: '4 ★', exact: true }).click()
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

test('keeps loaded Article pages while inspecting History in expanded rows', async ({ page }) => {
  const requested: string[] = []
  await page.route('**/api/library/articles{,/summary}?*', async (route) => {
    const url = new URL(route.request().url())
    if (!url.pathname.endsWith('/summary') && url.searchParams.get('section') === 'archive')
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
  await expect(page.getByRole('tab', { name: 'Archive 72' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Queue 178' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Feed 666' })).toBeVisible()
  await page.locator('[data-ui~="library-collection"]').evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(page.getByRole('button', { name: /Second Article/ })).toBeVisible()
  const afterPaging = requested.length
  await expect(page.getByRole('button', { name: 'Expanded' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Compact' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Second Article/ })).toBeVisible()
  await page.getByRole('button', { name: /A Distant Article/ }).click()
  await expect(page.getByText('A concise article summary.')).toBeVisible()
  await checkInspectorTabs(page, 'Article inspector')
  await expect(page.getByText('1,200')).toBeVisible()
  await expect(page.getByText('Readwise Reader · archive')).toBeVisible()
  await page.getByRole('button', { name: 'Reader source details' }).click()
  await expect(page.getByText('Reader ID: article-one', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'History' }).click()
  await expect(page.getByText('Current state')).toBeVisible()
  await expect(
    page.getByRole('tabpanel', { name: 'History', exact: true }).getByText('50%'),
  ).toBeVisible()
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

test('searches every channel and pages shadcn channel choices', async ({ page }) => {
  const channelItem = {
    ...video,
    id: 'channel-z',
    kind: 'channel',
    title: 'Zebra Channel',
    channelId: 'channel-z',
    channelTitle: 'Zebra Channel',
  }
  await page.route('**/api/library/videos{,/summary}?*', async (route) => {
    const url = new URL(route.request().url())
    const options = url.searchParams.get('section') === 'channels'
    const searching = url.searchParams.get('q') === 'Zebra'
    await route.fulfill({
      json: options
        ? videosResponse(
            [
              searching
                ? channelItem
                : {
                    ...channelItem,
                    id: url.searchParams.has('cursor') ? 'channel-b' : 'channel-a',
                    title: url.searchParams.has('cursor') ? 'Beta' : 'Alpha',
                  },
            ],
            searching || url.searchParams.has('cursor') ? null : 'next-options',
          )
        : videosResponse(),
    })
  })
  await page.goto('/library/videos/archive')
  await page.getByRole('button', { name: 'Filters', exact: true }).click()
  const channel = page.getByRole('combobox', { name: 'Channel', exact: true })
  await channel.click()
  await expect(page.getByRole('option', { name: 'Alpha', exact: true })).toBeVisible()
  await channel.press('Escape')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await page.getByRole('button', { name: 'Load more channels' }).click()
  await channel.click()
  await expect(page.getByRole('option', { name: 'Beta', exact: true })).toBeVisible()
  await channel.press('Escape')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  const searchResponse = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return (
      url.pathname === '/api/library/videos' &&
      url.searchParams.get('section') === 'channels' &&
      url.searchParams.get('q') === 'Zebra'
    )
  })
  await page.getByRole('searchbox', { name: 'Search channel options' }).fill('Zebra')
  await searchResponse
  await expect(page.locator('[data-ui~="video-channel-picker"]').getByRole('status')).toHaveCount(0)
  await channel.click()
  await expect(channel).toHaveAttribute('aria-expanded', 'true')
  await page.getByRole('option', { name: 'Zebra Channel', exact: true }).click()
  await expect(page).toHaveURL(/channel=%5B%22channel-z%22%5D/)
})

test('shows positive short video duration as under a minute', async ({ page }) => {
  await page.route('**/api/library/videos{,/summary}?*', (route) =>
    route.fulfill({ json: videosResponse([{ ...video, durationMs: 20000 }]) }),
  )
  await page.goto('/library/videos/archive')
  await expect(page.getByRole('button', { name: /A Distant Video/ })).toContainText('<1 min')
})

test('uses aligned shadcn toolbars and sorting on every Library media collection', async ({
  page,
}) => {
  const collections = [
    { media: 'books', view: 'archive', option: 'Title', response: booksResponse() },
    { media: 'movies', view: 'archive', option: 'Title', response: moviesResponse() },
    { media: 'articles', view: 'archive', option: 'Title', response: articlesResponse() },
    { media: 'podcasts', view: 'archive', option: 'Episode', response: podcastsResponse() },
    { media: 'music', view: 'tracks', option: 'Track', response: musicResponse() },
    { media: 'videos', view: 'archive', option: 'Title', response: videosResponse() },
  ]
  for (const collection of collections) {
    await page.route(`**/api/library/${collection.media}?*`, (route) =>
      route.fulfill({ json: collection.response }),
    )
    await page.goto(`/library/${collection.media}/${collection.view}`)
    const trigger = page.getByRole('combobox', { name: `Sort ${collection.media}`, exact: true })
    await expect(trigger).toHaveAttribute('data-slot', 'select-trigger')
    const controls = await page.locator('[data-ui~="library-toolbar"]').evaluate((toolbar) =>
      Array.from(toolbar.children).map((control) => {
        const rect = control.getBoundingClientRect()
        return { height: rect.height, top: rect.top, left: rect.left, right: rect.right }
      }),
    )
    for (const [index, control] of controls.entries()) {
      expect(control.height, `${collection.media} toolbar control ${index}`).toBe(32)
      expect(Math.abs(control.top - controls[0]!.top)).toBeLessThanOrEqual(1)
      if (index > 0) expect(control.left).toBeGreaterThanOrEqual(controls[index - 1]!.right)
    }
    await trigger.click()
    await page.getByRole('option', { name: collection.option, exact: true }).click()
    await expect(page).toHaveURL(/sort=title/)
    await expect(trigger).toContainText(collection.option)
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await expect(trigger).toBeFocused()
  }
})

test('preserves keyboard selection, focus, URL history and clearing with shadcn Select', async ({
  page,
}) => {
  await page.route('**/api/library/podcasts{,/summary}?*', (route) =>
    route.fulfill({ json: podcastsResponse() }),
  )
  await page.goto('/library/podcasts/archive')
  const trigger = page.getByRole('combobox', { name: 'Show', exact: true })
  await expect(trigger).toContainText('All shows')
  const before = await trigger.boundingBox()
  await trigger.press('ArrowDown')
  await expect(page.getByRole('listbox')).toBeVisible()
  await expect(page.getByRole('option', { name: 'All shows', exact: true })).toBeFocused()
  await page.keyboard.press('End')
  await expect(page.getByRole('option', { name: 'Not following', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/following=not_following/)
  await expect(trigger).toContainText('Not following')
  await expect(trigger).toBeFocused()
  await trigger.click()
  await page.getByRole('option', { name: 'All shows', exact: true }).click()
  await expect(trigger).toContainText('All shows')
  await page.goBack()
  await expect(trigger).toContainText('Not following')
  await page.goForward()
  await expect(trigger).toContainText('All shows')
  await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await page.getByRole('option', { name: 'All shows', exact: true }).press('Escape')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(trigger).toBeFocused()
  expect(await trigger.boundingBox()).toEqual(before)
  const geometry = await trigger.evaluate((el) => {
    const rect = el.getBoundingClientRect()
    const icon = el.querySelector('svg')!.getBoundingClientRect()
    return {
      centerDifference: Math.abs(rect.top + rect.height / 2 - (icon.top + icon.height / 2)),
      rightInset: rect.right - icon.right,
      outline: getComputedStyle(el).outlineStyle,
    }
  })
  expect(geometry.centerDifference).toBeLessThanOrEqual(1)
  expect(geometry.rightInset).toBeGreaterThanOrEqual(8)
  expect(geometry.outline).toBe('none')
})

for (const dark of [false, true]) {
  for (const media of ['books', 'movies', 'articles', 'podcasts', 'music', 'videos'] as const) {
    test(`keeps ${media} controls and menus within the pane in ${dark ? 'dark' : 'light'} appearance`, async ({
      page,
    }) => {
      const responses = {
        books: booksResponse(),
        movies: moviesResponse(),
        articles: articlesResponse(),
        podcasts: podcastsResponse(),
        music: musicResponse(),
        videos: videosResponse(),
      }
      await page.addInitScript((dark) => {
        localStorage.setItem('media-tracker:dark', String(dark))
      }, dark)
      await page.route(`**/api/library/${media}{,/summary}?*`, (route) =>
        route.fulfill({ json: responses[media] }),
      )
      await page.route(/\/api\/library\/(books|movies|articles|podcasts|music|videos)\//, (route) =>
        route.fulfill({
          status: 404,
          json: { error: { message: 'Synthetic inspector details unavailable' } },
        }),
      )
      const toolbar = page.locator('[data-ui~="library-toolbar"]')
      const trigger = page.getByRole('combobox', { name: `Sort ${media}`, exact: true })
      const measure = () =>
        toolbar.evaluate((el) => {
          const bounds = el.getBoundingClientRect()
          const controls = Array.from(el.children).map((child) => child.getBoundingClientRect())
          return controls.every(
            (rect) =>
              rect.height === 32 &&
              rect.left >= bounds.left - 1 &&
              rect.right <= bounds.right + 1 &&
              rect.top >= bounds.top - 1 &&
              rect.bottom <= bounds.bottom + 1,
          )
        })
      for (const width of [1280, 1024, 853, 768, 390]) {
        await page.setViewportSize({ width, height: 768 })
        await page.goto(`/library/${media}/${media === 'music' ? 'tracks' : 'archive'}`)
        await expect(trigger).toBeVisible()
        if (media === 'articles') {
          await expect(page.getByRole('button', { name: 'Expanded' })).toHaveCount(0)
          await expect(page.getByRole('button', { name: 'Compact' })).toHaveCount(0)
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        )
        await expect.poll(measure, { message: `${media} toolbar at ${width}px` }).toBe(true)
        await trigger.click()
        const menu = page.getByRole('listbox')
        await expect(menu).toBeVisible()
        const rect = await menu.boundingBox()
        expect(rect!.x).toBeGreaterThanOrEqual(0)
        expect(rect!.x + rect!.width).toBeLessThanOrEqual(width + 1)
        expect(rect!.y + rect!.height).toBeLessThanOrEqual(769)
        const labelsFit = await page.getByRole('option').evaluateAll((options) =>
          options.every((option) => {
            const label = option.firstElementChild!
            return label.scrollWidth <= label.clientWidth + 1
          }),
        )
        expect(labelsFit, `${media} menu labels at ${width}px`).toBe(true)
        await trigger.press('Escape')
        await expect(menu).toHaveCount(0)
      }
      await page.setViewportSize({ width: 1024, height: 768 })
      await page
        .locator(
          'button[data-ui~="book-row"], button[data-ui~="movie-row"], button[data-ui~="article-row"], button[data-ui~="spotify-result"], button[data-ui~="video-result"]',
        )
        .first()
        .click()
      await expect(page.locator('[data-ui~="library-workspace"]')).toHaveAttribute(
        'data-inspector-open',
        'true',
      )
      await expect
        .poll(() =>
          page
            .locator('[data-ui~="library-workspace"]')
            .evaluate((el) =>
              Math.round(parseFloat(getComputedStyle(el).getPropertyValue('--inspector-space'))),
            ),
        )
        .toBe(360)
      await expect.poll(measure, { message: `${media} toolbar with inspector open` }).toBe(true)
      // Narrow Books/Movie/Article inspectors intentionally block the backdrop.
      // Verify menu interaction at the nonmodal desktop width.
      await page.setViewportSize({ width: 1280, height: 768 })
      await expect.poll(measure).toBe(true)
      await trigger.click()
      await expect(page.getByRole('listbox')).toBeVisible()
      await trigger.press('Escape')
      await page
        .locator('[data-ui~="book-inspector"], [data-ui~="media-inspector"]')
        .getByRole('button', { name: 'Close inspector', exact: true })
        .click()
      await expect
        .poll(() =>
          page
            .locator('[data-ui~="library-workspace"]')
            .evaluate((el) =>
              Math.round(parseFloat(getComputedStyle(el).getPropertyValue('--inspector-space'))),
            ),
        )
        .toBe(0)
      await expect.poll(measure).toBe(true)
    })
  }
}

test('wraps long channel labels inside the viewport without losing the complete option', async ({
  page,
}) => {
  const title =
    'A channel with a deliberately long name about films, technology, books, music, and the people who create them'
  await page.setViewportSize({ width: 390, height: 768 })
  await page.route('**/api/library/videos{,/summary}?*', (route) => {
    const channels = new URL(route.request().url()).searchParams.get('section') === 'channels'
    return route.fulfill({
      json: channels
        ? videosResponse([
            {
              ...video,
              id: 'channel-long',
              kind: 'channel',
              title,
              channelId: 'channel-long',
              channelTitle: title,
            },
          ])
        : videosResponse(),
    })
  })
  await page.goto('/library/videos/archive')
  await page.getByRole('button', { name: 'Filters', exact: true }).click()
  await page.getByRole('combobox', { name: 'Channel', exact: true }).click()
  const option = page.getByRole('option', { name: title, exact: true })
  await expect(option).toBeVisible()
  const label = await option.evaluate((el) => {
    const label = el.firstElementChild!
    return {
      width: label.clientWidth,
      scroll: label.scrollWidth,
      height: label.getBoundingClientRect().height,
    }
  })
  expect(label.scroll).toBeLessThanOrEqual(label.width + 1)
  expect(label.height).toBeGreaterThan(32)
  const menu = (await page.getByRole('listbox').boundingBox())!
  expect(menu.x).toBeGreaterThanOrEqual(0)
  expect(menu.x + menu.width).toBeLessThanOrEqual(391)
  await option.click()
  await expect(page).toHaveURL(/channel=%5B%22channel-long%22%5D/)
})

test('uses shared keyboard tabs and associated panels in the Channel inspector', async ({
  page,
}) => {
  const channel = {
    ...video,
    id: 'channel-one',
    kind: 'channel',
    title: 'A Distant Channel',
    canonicalUrl: 'https://www.youtube.com/channel/channel-one',
    archiveVideoCount: 2,
    queueVideoCount: 1,
  }
  await page.route('**/api/library/videos{,/summary}?*', (route) =>
    route.fulfill({ json: videosResponse([channel]) }),
  )
  await page.route('**/api/library/video-channels/channel-one', (route) =>
    route.fulfill({
      json: {
        ...channel,
        description: 'Channel description.',
        customUrl: null,
        catalogCheckedAt: null,
        country: null,
        metadataMessage: null,
      },
    }),
  )
  await page.route('**/api/library/video-channels/channel-one/videos?*', (route) =>
    route.fulfill({ json: { data: [], nextCursor: null, totalCount: 0 } }),
  )
  await page.goto('/library/videos/channels')
  await page.getByRole('button', { name: /A Distant Channel/ }).click()
  await expect(page.getByText('Channel description.')).toBeVisible()
  await checkInspectorTabs(page, 'Channel inspector')
  const inspector = page.locator('aside[aria-label="Channel inspector"]')
  await inspector.getByRole('tab', { name: 'Library', exact: true }).click()
  const archive = inspector.getByRole('tab', { name: 'Archive', exact: true })
  await archive.press('ArrowRight')
  await inspector.getByRole('tab', { name: 'Queue', exact: true }).press('Enter')
  const queue = inspector.getByRole('tab', { name: 'Queue', exact: true })
  await expect(queue).toHaveAttribute('aria-selected', 'true')
  await expect(queue).toHaveAttribute('aria-controls', /.+/)
  await expect(inspector.getByText('No queued videos.')).toBeVisible()
})
