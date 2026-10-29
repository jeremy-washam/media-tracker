import { expect, test, type Page, type Route } from '@playwright/test'
import {
  book,
  movie,
  article,
  podcast,
  track,
  video,
  booksResponse,
  moviesResponse,
  articlesResponse,
  podcastsResponse,
  musicResponse,
  videosResponse,
} from './ui-fixtures'

const fixtures = {
  books: { item: book, response: booksResponse },
  movies: { item: movie, response: moviesResponse },
  articles: { item: article, response: articlesResponse },
  podcasts: { item: podcast, response: podcastsResponse },
  music: { item: track, response: musicResponse },
  videos: { item: video, response: videosResponse },
}
type Media = keyof typeof fixtures
const sections: [Media, string][] = [
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

function response(
  media: Media,
  section: string,
  start: number,
  size: number,
  nextCursor: string | null,
) {
  const kind =
    media === 'podcasts'
      ? section === 'following'
        ? 'show'
        : 'episode'
      : media === 'music'
        ? { tracks: 'track', albums: 'album', artists: 'artist' }[section]
        : media === 'videos'
          ? section === 'channels'
            ? 'channel'
            : 'video'
          : undefined
  const data = Array.from({ length: size }, (_, index) => ({
    ...fixtures[media].item,
    ...(kind ? { kind } : {}),
    id: `${media}-${start + index}`,
    title: `Library Item ${start + index}`,
    displayTitle: `Library Item ${start + index}`,
  }))
  return { ...fixtures[media].response(), data, nextCursor }
}

async function mockApi(
  page: Page,
  target: Media,
  section: string,
  handler: (route: Route, url: URL) => Promise<void>,
) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/health')
      return route.fulfill({
        json: {
          status: 'ok',
          service: 'media-tracker-api',
          version: '0.0.0',
          timestamp: new Date().toISOString(),
          requestId: 'infinite-scroll-test',
        },
      })
    if (url.pathname === '/api/connections') return route.fulfill({ json: { data: [] } })
    if (url.pathname === '/api/sync-runs')
      return route.fulfill({ json: { data: [], nextCursor: null } })
    const media = url.pathname.match(
      /^\/api\/library\/(books|movies|articles|podcasts|music|videos)(?:\/summary)?$/,
    )?.[1] as Media | undefined
    if (media) {
      const requestedSection = url.searchParams.get('section')
      if (url.pathname.endsWith('/summary'))
        return route.fulfill({ json: fixtures[media].response() })
      if (media === target && requestedSection === section) return handler(route, url)
      return route.fulfill({ json: fixtures[media].response() })
    }
    return route.fulfill({
      status: 404,
      json: { error: { message: 'Synthetic details unavailable' } },
    })
  })
}

async function scrollToEnd(page: Page) {
  await page.locator('[data-ui~="library-collection"]').evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
}

function position(page: Page) {
  return page.locator('[data-ui~="library-collection"]').evaluate((element) => {
    const top = element.getBoundingClientRect().top
    const item = Array.from(element.querySelectorAll<HTMLElement>('[data-collection-item]')).find(
      (item) => item.getBoundingClientRect().bottom > top,
    )
    return {
      top: element.scrollTop,
      item: item?.dataset.collectionItem,
      offset: item ? item.getBoundingClientRect().top - top : 0,
    }
  })
}

for (const [media, section] of sections) {
  test(`automatically pages ${media}/${section} and stops at the end`, async ({ page }) => {
    const cursors: string[] = []
    await mockApi(page, media, section, async (route, url) => {
      const cursor = url.searchParams.get('cursor')
      if (cursor) cursors.push(cursor)
      await route.fulfill({
        json: response(media, section, cursor ? 20 : 0, 20, cursor ? null : 'next'),
      })
    })
    await page.goto(`/library/${media}/${section}?layout=list`)
    const items = page.locator('[data-ui~="library-collection"] [data-collection-item]')
    await expect(items).toHaveCount(20)
    expect(cursors).toEqual([])
    await scrollToEnd(page)
    await expect(items).toHaveCount(40)
    expect(cursors).toEqual(['next'])
    await scrollToEnd(page)
    await expect(page.locator('[data-ui~="collection-pagination"] [role="status"]')).toContainText(
      'All 40',
    )
    await page.waitForTimeout(200)
    expect(cursors).toEqual(['next'])
  })
}

test('preloads near the bottom once and preserves existing rows while a page is delayed', async ({
  page,
}) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let requests = 0
  await mockApi(page, 'books', 'archive', async (route, url) => {
    if (url.searchParams.has('cursor')) {
      requests++
      await gate
    }
    await route.fulfill({
      json: response(
        'books',
        'archive',
        url.searchParams.has('cursor') ? 30 : 0,
        30,
        url.searchParams.has('cursor') ? null : 'next',
      ),
    })
  })
  try {
    await page.goto('/library/books/archive')
    await expect(page.locator('[data-collection-item]')).toHaveCount(30)
    await page.locator('[data-ui~="library-collection"]').evaluate((element) => {
      element.scrollTop = element.scrollHeight - element.clientHeight - 250
    })
    await expect.poll(() => requests).toBe(1)
    await scrollToEnd(page)
    await expect(page.getByText('Loading more books…')).toBeVisible()
    const before = await position(page)
    await page.waitForTimeout(200)
    expect(requests).toBe(1)
    release()
    await expect(page.locator('[data-collection-item]')).toHaveCount(60)
    const after = await position(page)
    expect(after.item).toBe(before.item)
    expect(Math.abs(after.offset - before.offset)).toBeLessThan(1)
    expect(requests).toBe(1)
  } finally {
    release()
  }
})

test('continues filling a short pane without requiring a new scroll event', async ({ page }) => {
  const cursors: string[] = []
  await mockApi(page, 'books', 'archive', async (route, url) => {
    const cursor = url.searchParams.get('cursor') ?? '0'
    if (url.searchParams.has('cursor')) cursors.push(cursor)
    const index = Number(cursor)
    await route.fulfill({
      json: response('books', 'archive', index, 1, index < 2 ? String(index + 1) : null),
    })
  })
  await page.goto('/library/books/archive')
  await expect(page.locator('[data-collection-item]')).toHaveCount(3)
  expect(cursors).toEqual(['1', '2'])
  await expect(page.locator('[data-ui~="collection-pagination"] [role="status"]')).toContainText(
    'All 3 books loaded',
  )
})

test('keeps loaded results after failure and retries only the next page', async ({ page }) => {
  let failing = true
  let attempts = 0
  let initialRequests = 0
  await mockApi(page, 'books', 'archive', async (route, url) => {
    if (!url.searchParams.has('cursor')) {
      initialRequests++
      return route.fulfill({ json: response('books', 'archive', 0, 20, 'next') })
    }
    attempts++
    if (failing)
      return route.fulfill({ status: 500, json: { error: { message: 'Temporary failure' } } })
    return route.fulfill({ json: response('books', 'archive', 20, 20, null) })
  })
  await page.goto('/library/books/archive')
  await expect(page.locator('[data-collection-item]')).toHaveCount(20)
  await scrollToEnd(page)
  const retry = page
    .locator('[data-ui~="collection-pagination"]')
    .getByRole('button', { name: 'Try again' })
  // Wait for TanStack's initial attempt and three default retries to finish.
  // This separates the retry backoff from the UI assertion under parallel load.
  await expect.poll(() => attempts, { timeout: 20000 }).toBe(4)
  await expect(retry).toBeVisible()
  await expect(page.locator('[data-collection-item]')).toHaveCount(20)
  await expect(page.getByRole('heading', { name: 'Books could not be loaded' })).toHaveCount(0)
  const before = attempts
  await scrollToEnd(page)
  await page.waitForTimeout(300)
  expect(attempts).toBe(before)
  failing = false
  await retry.click()
  await expect(page.locator('[data-collection-item]')).toHaveCount(40)
  expect(attempts).toBe(before + 1)
  expect(initialRequests).toBeLessThanOrEqual(2)
})

test('preserves loaded pages and position across the inspector and Back navigation', async ({
  page,
}) => {
  let cursorRequests = 0
  await mockApi(page, 'books', 'archive', async (route, url) => {
    const second = url.searchParams.has('cursor')
    if (second) cursorRequests++
    await route.fulfill({
      json: response('books', 'archive', second ? 30 : 0, 30, second ? null : 'next'),
    })
  })
  await page.goto('/library/books/archive')
  await expect(page.locator('[data-collection-item]')).toHaveCount(30)
  await scrollToEnd(page)
  await expect(page.locator('[data-collection-item]')).toHaveCount(60)
  await page.locator('[data-collection-item="books-40"]').scrollIntoViewIfNeeded()
  const before = await position(page)
  await page.locator('[data-collection-item="books-40"]').click()
  await expect(page.getByRole('complementary', { name: 'Book inspector' })).toBeVisible()
  await page.getByRole('button', { name: 'Close inspector', exact: true }).click()
  const closed = await position(page)
  expect(closed.item).toBe(before.item)
  expect(Math.abs(closed.offset - before.offset)).toBeLessThan(1)
  await page.locator('a[href="/library/music/tracks"]').first().click()
  await expect(page).toHaveURL(/\/library\/music\/tracks/)
  await page.goBack()
  await expect(page.locator('[data-collection-item]')).toHaveCount(60)
  const returned = await position(page)
  expect(returned.item).toBe(before.item)
  expect(Math.abs(returned.offset - before.offset)).toBeLessThan(1)
  expect(cursorRequests).toBe(1)

  // Returning keyboard focus to an opener that is now outside the viewport
  // must not undo the user's scrolling while the inspector was open.
  await page.locator('[data-collection-item="books-40"]').click()
  await expect(page.getByRole('complementary', { name: 'Book inspector' })).toBeVisible()
  await scrollToEnd(page)
  const scrolled = await position(page)
  await page.getByRole('button', { name: 'Close inspector', exact: true }).click()
  const focused = await position(page)
  expect(focused.item).toBe(scrolled.item)
  expect(Math.abs(focused.offset - scrolled.offset)).toBeLessThan(1)
  await expect(page.locator('[data-collection-item="books-40"]')).toBeFocused()
})

test('anchors the same item when switching layouts and resets a new search', async ({ page }) => {
  await mockApi(page, 'books', 'archive', async (route, url) => {
    await route.fulfill({
      json: response('books', 'archive', 0, url.searchParams.has('q') ? 10 : 60, null),
    })
  })
  await page.goto('/library/books/archive')
  await expect(page.locator('[data-collection-item]')).toHaveCount(60)
  // Scroll and activate in one task: a pending scroll event must not leave the
  // layout change using an old anchor, including controls in the persistent header.
  const before = await page.locator('[data-collection-item="books-30"]').evaluate((target) => {
    const root = target.closest<HTMLElement>('[data-ui~="library-collection"]')!
    root.scrollTop += target.getBoundingClientRect().top - root.getBoundingClientRect().top
    const top = root.getBoundingClientRect().top
    const item = Array.from(root.querySelectorAll<HTMLElement>('[data-collection-item]')).find(
      (item) => item.getBoundingClientRect().bottom > top,
    )!
    const before = {
      item: item.dataset.collectionItem,
      offset: item.getBoundingClientRect().top - top,
    }
    document
      .querySelector<HTMLButtonElement>('[aria-label="Result layout"] [aria-label="Grid view"]')!
      .click()
    return before
  })
  await expect(page).toHaveURL(/layout=grid/)
  await expect(page.locator('[data-ui~="library-workspace"]')).toHaveAttribute(
    'data-layout',
    'grid',
  )
  const anchor = page.locator(`[data-collection-item="${before.item}"]`)
  const offset = await anchor.evaluate(
    (item) =>
      item.getBoundingClientRect().top -
      item.closest('[data-ui~="library-collection"]')!.getBoundingClientRect().top,
  )
  expect(Math.abs(offset - before.offset)).toBeLessThan(1)
  await page.getByRole('button', { name: 'List view' }).dispatchEvent('click')
  await expect(page.locator('[data-ui~="library-workspace"]')).toHaveAttribute(
    'data-layout',
    'list',
  )
  const after = await position(page)
  expect(after.item).toBe(before.item)
  expect(Math.abs(after.offset - before.offset)).toBeLessThan(1)
  await page.getByRole('textbox', { name: 'Search books' }).fill('Different')
  await expect(page).toHaveURL(/q=Different/)
  await expect(page.locator('[data-collection-item]')).toHaveCount(10)
  expect((await position(page)).top).toBe(0)
})

test('provides an operable keyboard fallback when observers are unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as unknown as { IntersectionObserver?: unknown }).IntersectionObserver
  })
  await mockApi(page, 'books', 'archive', async (route, url) => {
    const second = url.searchParams.has('cursor')
    await route.fulfill({
      json: response('books', 'archive', second ? 1 : 0, 1, second ? null : 'next'),
    })
  })
  await page.goto('/library/books/archive')
  await expect(page.locator('[data-collection-item]')).toHaveCount(1)
  const load = page.getByRole('button', { name: 'Load more books', exact: true })
  await expect(load).toBeVisible()
  await load.focus()
  await load.press('Enter')
  await expect(page.locator('[data-collection-item]')).toHaveCount(2)
  await expect(page.locator('[data-collection-item="books-1"]')).toBeFocused()
})

for (const dark of [false, true]) {
  for (const width of [1280, 390]) {
    for (const layout of ['list', 'grid']) {
      test(`shows pagination states in ${dark ? 'dark' : 'light'} ${width}px ${layout}`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width, height: 800 })
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.addInitScript(
          (dark) => localStorage.setItem('media-tracker:dark', String(dark)),
          dark,
        )
        let release!: () => void
        const gate = new Promise<void>((resolve) => {
          release = resolve
        })
        await mockApi(page, 'books', 'archive', async (route, url) => {
          const second = url.searchParams.has('cursor')
          if (second) await gate
          await route.fulfill({
            json: response('books', 'archive', second ? 12 : 0, 12, second ? null : 'next'),
          })
        })
        try {
          await page.goto(`/library/books/archive?layout=${layout}`)
          await expect(page.locator('[data-collection-item]')).toHaveCount(12)
          await scrollToEnd(page)
          await expect(page.getByText('Loading more books…')).toBeVisible()
          const footer = page.locator('[data-ui~="collection-pagination"]')
          const bounds = await footer.boundingBox()
          expect(bounds!.x).toBeGreaterThanOrEqual(0)
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
          expect(
            await footer
              .locator('[data-slot="spinner"]')
              .evaluate((el) => getComputedStyle(el).animationName),
          ).toBe('none')
          await page.screenshot({ path: testInfo.outputPath('loading.png') })
          if (width === 1280) {
            const before = await position(page)
            await page.locator('[data-collection-item]').last().click()
            await expect(page.getByRole('complementary', { name: 'Book inspector' })).toBeVisible()
            await page.getByRole('button', { name: 'Close inspector', exact: true }).click()
            await expect(page.getByRole('complementary', { name: 'Book inspector' })).toHaveCount(0)
            const after = await position(page)
            expect(after.item).toBe(before.item)
            expect(Math.abs(after.offset - before.offset)).toBeLessThan(1)
          }
          release()
          await expect(page.locator('[data-collection-item]')).toHaveCount(24)
          await scrollToEnd(page)
          await expect(footer.getByRole('status')).toContainText('All 24 books loaded')
          await page.screenshot({ path: testInfo.outputPath('complete.png') })
        } finally {
          release()
        }
      })
    }
  }
}

test('resumes a paused next page when the connection returns', async ({ page, context }) => {
  await mockApi(page, 'books', 'archive', async (route, url) => {
    const second = url.searchParams.has('cursor')
    await route.fulfill({
      json: response('books', 'archive', second ? 20 : 0, 20, second ? null : 'next'),
    })
  })
  await page.goto('/library/books/archive')
  await expect(page.locator('[data-collection-item]')).toHaveCount(20)
  await context.setOffline(true)
  try {
    await scrollToEnd(page)
    await expect(page.getByText('Waiting for a connection…')).toBeVisible()
    await expect(page.locator('[data-collection-item]')).toHaveCount(20)
  } finally {
    await context.setOffline(false)
  }
  await expect(page.locator('[data-collection-item]')).toHaveCount(40)
})

test('browses twenty pages without duplicate requests or items', async ({ page }, testInfo) => {
  test.setTimeout(60000)
  const cursors: string[] = []
  await mockApi(page, 'books', 'archive', async (route, url) => {
    const cursor = url.searchParams.get('cursor')
    if (cursor) cursors.push(cursor)
    const index = Number(cursor ?? 0)
    await route.fulfill({
      json: response('books', 'archive', index * 48, 48, index < 19 ? String(index + 1) : null),
    })
  })
  await page.goto('/library/books/archive')
  const items = page.locator('[data-collection-item]')
  await expect(items).toHaveCount(48)
  const started = Date.now()
  for (let count = 96; count <= 960; count += 48) {
    await scrollToEnd(page)
    await expect(items).toHaveCount(count)
  }
  expect(cursors).toEqual(Array.from({ length: 19 }, (_, index) => String(index + 1)))
  const ids = await items.evaluateAll((elements) =>
    elements.map((element) => (element as HTMLElement).dataset.collectionItem),
  )
  expect(new Set(ids).size).toBe(960)
  await scrollToEnd(page)
  await expect(
    page.locator('[data-ui~="collection-pagination"]').getByRole('status'),
  ).toContainText('All 960 books loaded')
  await testInfo.attach('long-collection', {
    contentType: 'application/json',
    body: JSON.stringify({
      items: 960,
      nextPageRequests: cursors.length,
      elapsedMs: Date.now() - started,
    }),
  })
})

test('shares one cursor request between manual and automatic loading', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let requests = 0
  await mockApi(page, 'books', 'archive', async (route, url) => {
    const second = url.searchParams.has('cursor')
    if (second) {
      requests++
      await gate
    }
    await route.fulfill({
      json: response('books', 'archive', second ? 20 : 0, 20, second ? null : 'next'),
    })
  })
  try {
    await page.goto('/library/books/archive')
    await expect(page.locator('[data-collection-item]')).toHaveCount(20)
    await page.locator('[data-ui~="library-collection"]').evaluate((element) => {
      const button = element.querySelector<HTMLButtonElement>(
        '[data-ui~="collection-pagination"] button',
      )!
      button.click()
      button.click()
      element.scrollTop = element.scrollHeight
    })
    await expect.poll(() => requests).toBe(1)
    await expect(page.getByText('Loading more books…')).toBeVisible()
    await scrollToEnd(page)
    await page.waitForTimeout(200)
    expect(requests).toBe(1)
    release()
    await expect(page.locator('[data-collection-item]')).toHaveCount(40)
    expect(requests).toBe(1)
  } finally {
    release()
  }
})
