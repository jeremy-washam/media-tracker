import { expect, test, type Page, type Route, type Request } from '@playwright/test'
import {
  booksResponse,
  moviesResponse,
  articlesResponse,
  podcastsResponse,
  musicResponse,
  videosResponse,
  book,
} from './ui-fixtures'

const cacheKey = 'media-tracker:library-initial-pages:v2'
const sections = [
  ['books', 'archive'],
  ['books', 'queue'],
  ['movies', 'archive'],
  ['movies', 'queue'],
  ['articles', 'archive'],
  ['articles', 'queue'],
  ['articles', 'feed'],
  ['podcasts', 'archive'],
  ['podcasts', 'queue'],
  ['podcasts', 'following'],
  ['music', 'tracks'],
  ['music', 'albums'],
  ['music', 'artists'],
  ['videos', 'archive'],
  ['videos', 'queue'],
  ['videos', 'channels'],
]
const responses = {
  books: booksResponse,
  movies: moviesResponse,
  articles: articlesResponse,
  podcasts: podcastsResponse,
  music: musicResponse,
  videos: videosResponse,
}
type CollectionHook = (route: Route, url: URL) => Promise<boolean>

async function mockApi(page: Page, hook?: CollectionHook) {
  const requests: URL[] = []
  const urlsByRequest = new Map<Request, URL>()
  page.on('requestfailed', (request) => {
    const url = urlsByRequest.get(request)
    if (url) requests.splice(requests.indexOf(url), 1)
  })
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    requests.push(url)
    urlsByRequest.set(route.request(), url)
    if (url.pathname === '/api/health')
      return route.fulfill({
        json: {
          status: 'ok',
          service: 'media-tracker-api',
          version: '0.0.0',
          timestamp: new Date().toISOString(),
          requestId: 'cache-test',
        },
      })
    if (url.pathname === '/api/connections') return route.fulfill({ json: { data: [] } })
    if (url.pathname === '/api/sync-runs')
      return route.fulfill({ json: { data: [], nextCursor: null } })
    const media = url.pathname.match(
      /^\/api\/library\/(books|movies|articles|podcasts|music|videos)(?:\/summary)?$/,
    )?.[1] as keyof typeof responses | undefined
    if (media) {
      if (hook && !url.pathname.endsWith('/summary') && (await hook(route, url))) return
      return route.fulfill({ json: responses[media]() })
    }
    return route.fulfill({
      status: 404,
      json: { error: { message: 'Synthetic resource unavailable' } },
    })
  })
  return requests
}
function collections(requests: URL[]) {
  return requests.filter((url) => /^\/api\/library\/[^/]+$/.test(url.pathname))
}
async function waitForWarmCache(page: Page) {
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const saved = localStorage.getItem(key)
        return saved ? JSON.parse(saved).entries.length : 0
      }, cacheKey),
    )
    .toBe(16)
}

test('loads the current tab first, then warms all sections with at most two background requests', async ({
  page,
}) => {
  let releaseFirst!: () => void
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })
  let releaseBackground!: () => void
  const backgroundGate = new Promise<void>((resolve) => {
    releaseBackground = resolve
  })
  const requests = await mockApi(page, async (_route, url) => {
    if (url.pathname === '/api/library/videos' && url.searchParams.get('section') === 'archive')
      await firstGate
    else await backgroundGate
    return false
  })
  try {
    await page.goto('/library/videos/archive')
    await expect.poll(() => collections(requests).length).toBe(1)
    expect(collections(requests)[0]!.pathname).toBe('/api/library/videos')
    releaseFirst()
    await expect(page.getByRole('button', { name: /A Distant Video/ })).toBeVisible()
    await expect.poll(() => collections(requests).length).toBe(3)
    // Both slots remain occupied until their responses finish.
    await page.waitForTimeout(250)
    expect(collections(requests)).toHaveLength(3)
    releaseBackground()
    await waitForWarmCache(page)
    expect(collections(requests)).toHaveLength(16)
    const visited = collections(requests).map(
      (url) => `${url.pathname.split('/').at(-1)}/${url.searchParams.get('section')}`,
    )
    expect(visited.sort()).toEqual(sections.map(([media, section]) => `${media}/${section}`).sort())
    await expect.poll(() => requests.some((url) => url.pathname === '/api/connections')).toBe(true)
    await expect.poll(() => requests.some((url) => url.pathname === '/api/sync-runs')).toBe(true)
  } finally {
    releaseFirst()
    releaseBackground()
  }
})

test('reuses initial content after six minutes and across reloads, then refreshes stale content in the background', async ({
  page,
}) => {
  let delayRefresh = false
  let releaseRefresh!: () => void
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve
  })
  const requests = await mockApi(page, async (_route, url) => {
    if (delayRefresh && url.pathname === '/api/library/movies') await refreshGate
    return false
  })
  try {
    await page.goto('/library/books/archive')
    await waitForWarmCache(page)
    const fetchedAt = await page.evaluate(() => Date.now())
    await page.clock.setFixedTime(fetchedAt + 6 * 60_000)
    await page.getByRole('link', { name: 'Movies', exact: true }).click()
    await expect(page.getByRole('button', { name: /A Distant Movie/ })).toBeVisible()
    expect(collections(requests)).toHaveLength(16)
    await page.reload()
    await expect(page.getByRole('button', { name: /A Distant Movie/ })).toBeVisible()
    expect(collections(requests)).toHaveLength(16)
    delayRefresh = true
    await page.clock.setFixedTime(fetchedAt + 11 * 60_000)
    await page.reload()
    await expect
      .poll(
        () => collections(requests).filter((url) => url.pathname === '/api/library/movies').length,
      )
      .toBe(3)
    // Restored data stays visible while the stale request is held open.
    await expect(page.getByRole('button', { name: /A Distant Movie/ })).toBeVisible()
    releaseRefresh()
  } finally {
    releaseRefresh()
  }
})

test('persists only the first page and preserves cursor pagination and explicit search on reload', async ({
  page,
}) => {
  const requests = await mockApi(page, async (route, url) => {
    if (url.pathname !== '/api/library/books' || url.searchParams.get('section') !== 'archive')
      return false
    if (url.searchParams.has('cursor')) {
      expect(url.searchParams.get('cursor')).toBe('next-books-page')
      await route.fulfill({
        json: booksResponse([{ ...book, id: 'book-two', title: 'Second Book' }]),
      })
    } else if (url.searchParams.has('q')) {
      await route.fulfill({
        json: booksResponse([{ ...book, id: 'filtered-book', title: 'Filtered Book' }]),
      })
    } else
      await route.fulfill({
        json: booksResponse(
          [
            book,
            ...Array.from({ length: 19 }, (_, index) => ({
              ...book,
              id: `cache-book-${index}`,
              title: `Cache Book ${index}`,
            })),
          ],
          'next-books-page',
        ),
      })
    return true
  })
  await page.goto('/library/books/archive')
  await waitForWarmCache(page)
  await page.locator('[data-ui~="library-collection"]').evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(page.getByRole('button', { name: /Second Book/ })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: /A Distant Book/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Second Book/ })).toHaveCount(0)
  await page.locator('[data-ui~="library-collection"]').evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(page.getByRole('button', { name: /Second Book/ })).toBeVisible()
  await page.goto('/library/books/archive?q=Explicit&layout=grid')
  await expect(page).toHaveURL(/q=Explicit/)
  await expect(page.getByRole('button', { name: /Filtered Book/ })).toBeVisible()
  expect(collections(requests).some((url) => url.searchParams.get('q') === 'Explicit')).toBe(true)
  await expect
    .poll(() =>
      page.evaluate(
        (key) =>
          JSON.parse(localStorage.getItem(key)!).entries.find(
            (entry: { path: string }) => entry.path === '/library/books/archive',
          ).page.data[0].id,
        cacheKey,
      ),
    )
    .toBe('book-one')
})

test('polls idle Connections once per minute with the longer Library freshness window', async ({
  page,
}) => {
  const requests = await mockApi(page)
  await page.clock.install()
  await page.goto('/library/books/archive')
  await waitForWarmCache(page)
  await page.getByRole('link', { name: 'Connections', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Connections', exact: true })).toBeVisible()
  const connectionCount = requests.filter((url) => url.pathname === '/api/connections').length
  const runCount = requests.filter((url) => url.pathname === '/api/sync-runs').length
  await page.clock.runFor(5100)
  expect(requests.filter((url) => url.pathname === '/api/connections')).toHaveLength(
    connectionCount,
  )
  expect(requests.filter((url) => url.pathname === '/api/sync-runs')).toHaveLength(runCount)
  await page.clock.runFor(60_000)
  await expect
    .poll(() => requests.filter((url) => url.pathname === '/api/connections').length)
    .toBeGreaterThan(connectionCount)
  await expect
    .poll(() => requests.filter((url) => url.pathname === '/api/sync-runs').length)
    .toBeGreaterThan(runCount)
})

test('legacy Movies layout links share the default item cache without presentation parameters', async ({
  page,
}) => {
  const requests = await mockApi(page)
  await page.goto('/library/movies/archive?view=list')
  await expect(page.getByRole('button', { name: 'List view' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await waitForWarmCache(page)
  const moviePages = () =>
    collections(requests).filter(
      (url) =>
        url.pathname === '/api/library/movies' && url.searchParams.get('section') === 'archive',
    )
  expect(moviePages()).toHaveLength(1)
  expect(
    moviePages().every((url) => !url.searchParams.has('view') && !url.searchParams.has('layout')),
  ).toBe(true)
  await page.getByRole('link', { name: 'Books', exact: true }).click()
  await expect(page.getByRole('button', { name: /A Distant Book/ })).toBeVisible()
  await page.getByRole('link', { name: 'Movies', exact: true }).click()
  await expect(page.getByRole('button', { name: /A Distant Movie/ })).toBeVisible()
  expect(moviePages()).toHaveLength(1)
})
