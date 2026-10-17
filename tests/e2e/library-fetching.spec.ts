import { expect, test } from '@playwright/test'
import { installDefaultApiMocks } from './default-api-mocks'
import { moviesResponse, movie } from './ui-fixtures'

test.beforeEach(async ({ page }) => {
  await installDefaultApiMocks(page)
})

for (const [media, label] of [
  ['books', 'A Distant Book'],
  ['movies', 'A Distant Movie'],
  ['articles', 'A Distant Article'],
  ['podcasts', 'A Distant Episode'],
  ['music', 'A Distant Track'],
  ['videos', 'A Distant Video'],
]) {
  test(`renders ${media} items before its summary is ready`, async ({ page }) => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route(`**/api/library/${media}/summary?*`, async (route) => {
      await gate
      await route.fallback()
    })
    try {
      await page.goto(`/library/${media}/${media === 'music' ? 'tracks' : 'archive'}`)
      await expect(page.getByRole('button', { name: new RegExp(label!) }).first()).toBeVisible()
      await expect(page.locator('[data-ui="collection-summary"]')).not.toContainText(
        /0 (?:books|movies|articles|episodes|tracks|videos)/,
      )
      release()
      await expect(page.locator('[data-ui="collection-summary"]')).toContainText(/\d/)
    } finally {
      release()
    }
  })
}

test('scrolling and sorting fetch items without repeating the Movies summary', async ({ page }) => {
  const requests: URL[] = []
  page.on('requestfinished', (request) => {
    const url = new URL(request.url())
    if (url.pathname.startsWith('/api/library/movies')) requests.push(url)
  })
  const rows = Array.from({ length: 50 }, (_, index) => ({
    ...movie,
    id: `movie-${index}`,
    displayTitle: `Movie ${index}`,
  }))
  await page.route('**/api/library/movies?*', async (route) => {
    const url = new URL(route.request().url())
    const data = url.searchParams.has('cursor')
      ? [{ ...movie, id: 'last', displayTitle: 'Last movie' }]
      : rows
    await route.fulfill({ json: { data, nextCursor: data === rows ? 'second-page' : null } })
  })
  await page.route('**/api/library/movies/summary?*', (route) =>
    route.fulfill({ json: moviesResponse(rows) }),
  )
  await page.goto('/library/movies/archive')
  await expect(page.getByRole('button', { name: /Movie 0 / })).toBeVisible()
  await page.locator('[data-ui="library-collection"]').evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(page.getByRole('button', { name: /Last movie/ })).toBeVisible()
  const summaries = () =>
    requests.filter(
      (url) => url.pathname.endsWith('/summary') && url.searchParams.get('section') === 'archive',
    )
  expect(summaries()).toHaveLength(1)
  await page.getByRole('combobox', { name: 'Sort movies' }).click()
  await page.getByRole('option', { name: 'Title', exact: true }).click()
  await expect(page).toHaveURL(/sort=title/)
  await expect
    .poll(() => requests.some((url) => url.searchParams.get('sort') === 'title'))
    .toBe(true)
  expect(summaries()).toHaveLength(1)
  expect(
    requests
      .filter((url) => !url.pathname.endsWith('/summary'))
      .every(
        (url) => url.searchParams.get('limit') === '50' && !url.searchParams.has('collection'),
      ),
  ).toBe(true)
})

test('debounces Music facet-option search', async ({ page }) => {
  const searches: string[] = []
  await page.route('**/api/library/music/filter-options?*', (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('facet') === 'artist' && url.searchParams.get('optionQ'))
      searches.push(url.searchParams.get('optionQ')!)
    return route.fulfill({ json: { data: [], nextCursor: null } })
  })
  await page.goto('/library/music/tracks')
  await page.getByRole('button', { name: 'Filters' }).click()
  await page
    .getByRole('searchbox', { name: 'Search artists options' })
    .pressSequentially('Ada', { delay: 30 })
  await expect.poll(() => searches).toEqual(['Ada'])
})

test('polls only recent activity and slows down while idle', async ({ page }) => {
  await page.clock.install()
  const cursors: (string | null)[] = []
  await page.route('**/api/sync-runs?*', (route) => {
    const url = new URL(route.request().url())
    const cursor = url.searchParams.get('cursor')
    cursors.push(cursor)
    return route.fulfill({ json: { data: [], nextCursor: cursor ? null : 'older' } })
  })
  await page.goto('/connections')
  await page.getByRole('button', { name: 'Older activity' }).click()
  await expect.poll(() => cursors).toEqual([null, 'older'])
  await page.clock.fastForward(6000)
  expect(cursors).toEqual([null, 'older'])
  await page.clock.fastForward(60000)
  await expect.poll(() => cursors).toEqual([null, 'older', null])
})

test('keeps items usable when a summary fails and retries the summary independently', async ({
  page,
}) => {
  let fail = true
  await page.route('**/api/library/movies/summary?*', (route) =>
    fail
      ? route.fulfill({ status: 503, json: { error: { message: 'Synthetic summary failure' } } })
      : route.fulfill({ json: moviesResponse() }),
  )
  await page.goto('/library/movies/archive')
  await expect(page.getByRole('button', { name: /A Distant Movie/ })).toBeVisible()
  const retry = page.getByRole('button', { name: 'Retry summary' })
  await expect(retry).toBeVisible({ timeout: 15000 })
  fail = false
  await retry.click()
  await expect(page.locator('[data-ui="collection-summary"]')).toContainText('1 movie')
  await expect(retry).toHaveCount(0)
  await expect(page.getByRole('button', { name: /A Distant Movie/ })).toBeVisible()
})

test('refreshes a retained collection after a server-invalidated pagination cursor', async ({
  page,
}) => {
  let refreshed = false
  let invalidRequests = 0
  const rows = Array.from({ length: 20 }, (_, index) => ({
    ...movie,
    id: `retained-${index}`,
    displayTitle: `Retained ${index}`,
  }))
  await page.route('**/api/library/movies?*', (route) => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor')
    if (cursor === 'expired') {
      invalidRequests++
      refreshed = true
      return route.fulfill({
        status: 400,
        json: { error: { code: 'BAD_REQUEST', message: 'Invalid Movies pagination cursor' } },
      })
    }
    return route.fulfill({
      json: cursor
        ? { data: [{ ...movie, id: 'new-row', displayTitle: 'New last movie' }], nextCursor: null }
        : { data: rows, nextCursor: refreshed ? 'fresh' : 'expired' },
    })
  })
  await page.goto('/library/movies/archive')
  const collection = page.locator('[data-ui="library-collection"]')
  await expect(page.locator('[data-collection-item]')).toHaveCount(20)
  await collection.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(page.getByRole('button', { name: 'Refresh collection' })).toBeVisible()
  expect(invalidRequests).toBe(1)
  await expect(page.locator('[data-collection-item]')).toHaveCount(20)
  await page.getByRole('button', { name: 'Refresh collection' }).click()
  await collection.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(page.getByRole('button', { name: /New last movie/ })).toBeVisible()
  await expect(page.locator('[data-collection-item]')).toHaveCount(21)
  expect(invalidRequests).toBe(1)
})
