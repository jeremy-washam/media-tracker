import { expect, test } from '@playwright/test'
import { installDefaultApiMocks } from './default-api-mocks'
import {
  booksResponse,
  moviesResponse,
  articlesResponse,
  podcastsResponse,
  musicResponse,
  videosResponse,
} from './ui-fixtures'

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
] as const
const responses = {
  books: booksResponse,
  movies: moviesResponse,
  articles: articlesResponse,
  podcasts: podcastsResponse,
  music: musicResponse,
  videos: videosResponse,
}

for (const dark of [false, true]) {
  for (const [media, section] of sections) {
    test(`keeps ${media}/${section} controls and counts above scrolling results in ${dark ? 'dark' : 'light'}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 768 })
      await page.addInitScript(
        (dark) => localStorage.setItem('media-tracker:dark', String(dark)),
        dark,
      )
      await installDefaultApiMocks(page)
      const fixture = responses[media]()
      const kind =
        section === 'following'
          ? 'show'
          : section === 'channels'
            ? 'channel'
            : media === 'music'
              ? { tracks: 'track', albums: 'album', artists: 'artist' }[section]
              : undefined
      await page.route(`**/api/library/${media}?*`, (route) =>
        route.fulfill({
          json: {
            ...fixture,
            data: Array.from({ length: 40 }, (_, index) => ({
              ...fixture.data[0],
              ...(kind ? { kind } : {}),
              id: `${media}-${index}`,
              title: `Header test ${index}`,
              displayTitle: `Header test ${index}`,
            })),
            nextCursor: null,
          },
        }),
      )
      await page.goto(`/library/${media}/${section}?layout=list`)
      const rows = page.locator('[data-collection-item]')
      await expect(rows).toHaveCount(40)
      const toolbar = page.locator('[data-ui~="library-toolbar"]')
      const summary = page.locator('[data-ui~="collection-summary"]')
      const initial = (await toolbar.boundingBox())!
      const results = page.locator('[data-ui~="library-collection"]')
      await results.evaluate((element) => {
        element.scrollTop = 600
      })
      await expect.poll(() => results.evaluate((element) => element.scrollTop)).toBeGreaterThan(300)
      expect((await toolbar.boundingBox())!.y).toBe(initial.y)
      await expect(summary).toBeInViewport()
      expect(
        await page
          .locator('[data-ui~="collection-header"]')
          .evaluate((element) => getComputedStyle(element).boxShadow),
      ).not.toBe('none')
      const trigger = page.getByRole('button', { name: 'Filters', exact: true })
      await trigger.click()
      const dialog = page.getByRole('dialog', { name: 'Collection filters' })
      await expect(dialog).toBeVisible()
      await expect
        .poll(() => dialog.evaluate((element) => element.contains(document.activeElement)))
        .toBe(true)
      await page.keyboard.press('Escape')
      await expect(dialog).not.toBeVisible()
      await expect(trigger).toBeFocused()
      expect(await results.evaluate((element) => element.scrollTop)).toBeGreaterThan(300)
    })
  }

  test(`API status has no hover appearance in ${dark ? 'dark' : 'light'}`, async ({ page }) => {
    await page.addInitScript(
      (dark) => localStorage.setItem('media-tracker:dark', String(dark)),
      dark,
    )
    await installDefaultApiMocks(page)
    await page.goto('/library/books/archive')
    const status = page.locator('[data-ui~="health-indicator"]')
    await expect(status).toHaveText('Local API connected')
    await status.evaluate(async (element) => {
      await new Promise(requestAnimationFrame)
      await Promise.all(
        element.getAnimations().map((animation) => animation.finished.catch(() => {})),
      )
    })
    const appearance = () =>
      status.evaluate((element) => {
        const style = getComputedStyle(element)
        // Compare rendered color, not equivalent oklab/oklch serialization during theme settling.
        const context = document.createElement('canvas').getContext('2d')!
        context.fillStyle = style.color
        context.fillRect(0, 0, 1, 1)
        return {
          background: style.backgroundColor,
          color: Array.from(context.getImageData(0, 0, 1, 1).data),
          shadow: style.boxShadow,
        }
      })
    const before = await appearance()
    await status.hover()
    await expect.poll(appearance).toEqual(before)
  })
}

test('removing a filter group clears its bounds while retaining query and sort', async ({
  page,
}) => {
  await installDefaultApiMocks(page)
  await page.goto(
    '/library/books/archive?q=book&sort=title&finishedMode=range&finishedFrom=2025-01-01&finishedTo=2026-01-01&genre=fiction',
  )
  await page.getByRole('button', { name: 'Remove Read date filter' }).click()
  await expect.poll(() => new URL(page.url()).searchParams.has('finishedMode')).toBe(false)
  const url = new URL(page.url())
  expect(url.searchParams.has('finishedFrom')).toBe(false)
  expect(url.searchParams.has('finishedTo')).toBe(false)
  expect(url.searchParams.get('q')).toBe('book')
  expect(url.searchParams.get('sort')).toBe('title')
  expect(JSON.parse(url.searchParams.get('genre')!)).toEqual(['fiction'])
  await page.getByRole('button', { name: 'Clear all filters', exact: true }).click()
  await expect.poll(() => new URL(page.url()).searchParams.has('genre')).toBe(false)
  expect(new URL(page.url()).searchParams.get('q')).toBe('book')
})
