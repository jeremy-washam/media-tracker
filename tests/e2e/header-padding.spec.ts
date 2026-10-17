import { installDefaultApiMocks } from './default-api-mocks'
import { expect, test } from '@playwright/test'
import {
  booksResponse,
  moviesResponse,
  articlesResponse,
  podcastsResponse,
  musicResponse,
  videosResponse,
} from './ui-fixtures'

test.beforeEach(async ({ page }) => {
  await installDefaultApiMocks(page)
})

const collections = [
  { media: 'books', section: 'archive', response: booksResponse },
  { media: 'movies', section: 'archive', response: moviesResponse },
  { media: 'articles', section: 'archive', response: articlesResponse },
  { media: 'podcasts', section: 'archive', response: podcastsResponse },
  { media: 'music', section: 'tracks', response: musicResponse },
  { media: 'videos', section: 'archive', response: videosResponse },
] as const

for (const dark of [false, true]) {
  for (const { media, section, response } of collections) {
    test(`aligns ${media} header and collection edges in ${dark ? 'dark' : 'light'} appearance`, async ({
      page,
    }) => {
      await page.addInitScript(
        (dark) => localStorage.setItem('media-tracker:dark', String(dark)),
        dark,
      )
      await page.route(`**/api/library/${media}{,/summary}?*`, (route) =>
        route.fulfill({ json: response() }),
      )
      await page.route(`**/api/library/${media}/**`, (route) =>
        new URL(route.request().url()).pathname.endsWith('/summary')
          ? route.fallback()
          : route.fulfill({
              status: 404,
              json: { error: { message: 'Synthetic detail unavailable' } },
            }),
      )
      await page.goto(`/library/${media}/${section}`)
      const row = page
        .locator(
          'button[data-ui~="book-row"], button[data-ui~="movie-row"], button[data-ui~="article-row"], button[data-ui~="spotify-result"], button[data-ui~="video-result"]',
        )
        .first()
      await expect(row).toBeVisible()
      const aligned = () =>
        page.evaluate(() => {
          const header = document.querySelector<HTMLElement>('[data-ui~="workspace-header"]')!
          const breadcrumb = document.querySelector<HTMLElement>(
            '[data-ui~="workspace-breadcrumb"]',
          )!
          const mobile = document.querySelector<HTMLElement>('[data-ui~="mobile-nav-trigger"]')!
          const nav = document.querySelector<HTMLElement>('[data-ui~="workspace-tabs"]')!
          const toolbar = document.querySelector<HTMLElement>('[data-ui~="library-toolbar"]')!
          const row = document.querySelector<HTMLElement>(
            'button[data-ui~="book-row"], button[data-ui~="movie-row"], button[data-ui~="article-row"], button[data-ui~="spotify-result"], button[data-ui~="video-result"]',
          )!
          const leading = getComputedStyle(mobile).display === 'none' ? breadcrumb : mobile
          const left = toolbar.getBoundingClientRect().left
          const right = toolbar.getBoundingClientRect().right
          const active = header.querySelector<HTMLElement>('[role=tab][aria-selected=true]')!
          const underline = getComputedStyle(active, '::after')
          return (
            Math.abs(leading.getBoundingClientRect().left - left) < 1 &&
            Math.abs(nav.getBoundingClientRect().right - right) < 1 &&
            Math.abs(row.getBoundingClientRect().left - left) < 1 &&
            Math.abs(row.getBoundingClientRect().right - right) < 1 &&
            underline.height === '2px' &&
            underline.opacity === '1'
          )
        })
      for (const width of [1280, 1024, 768, 390]) {
        await page.setViewportSize({ width, height: 768 })
        await expect.poll(aligned, { message: `${media}: matching edges at ${width}px` }).toBe(true)
      }
      await page.setViewportSize({ width: 1280, height: 768 })
      await page.addStyleTag({
        content:
          '[data-ui~="library-collection"]::-webkit-scrollbar, [data-ui~="workspace-header"]::-webkit-scrollbar { width: 16px; }',
      })
      await expect
        .poll(() =>
          page
            .locator('[data-ui~="library-collection"]')
            .evaluate((e) => (e as HTMLElement).offsetWidth - e.clientWidth),
        )
        .toBeGreaterThan(0)
      await expect
        .poll(aligned, { message: 'matching edges with a reserved classic scrollbar gutter' })
        .toBe(true)
      await row.click()
      await expect(page.locator('[data-ui~="library-workspace"]')).toHaveAttribute(
        'data-inspector-open',
        'true',
      )
      await expect.poll(aligned, { message: 'matching edges with the inspector open' }).toBe(true)
      await page
        .locator('[data-ui~="book-inspector"], [data-ui~="media-inspector"]')
        .getByRole('button', { name: 'Close inspector', exact: true })
        .click()
      await expect
        .poll(aligned, { message: 'matching edges after closing the inspector' })
        .toBe(true)
    })
  }
}

for (const dark of [false, true]) {
  test(`centers desktop branding with the header in ${dark ? 'dark' : 'light'} appearance`, async ({
    page,
  }) => {
    await page.addInitScript((dark) => {
      localStorage.setItem('media-tracker:dark', String(dark))
      localStorage.setItem('media-tracker:sidebar-collapsed', 'false')
    }, dark)
    await page.route('**/api/library/books{,/summary}?*', (route) =>
      route.fulfill({ json: booksResponse() }),
    )
    await page.goto('/library/books/archive')
    const aligned = () =>
      page.evaluate(() => {
        const header = document.querySelector<HTMLElement>('[data-ui~="workspace-header"]')!
        const sidebar = document.querySelector<HTMLElement>(
          '[data-ui~="app-frame"] > [data-ui~="app-sidebar"]',
        )!
        const brand = sidebar.querySelector<HTMLElement>('[data-ui~="app-brand"]')!
        const headerRect = header.getBoundingClientRect()
        const brandRect = brand.getBoundingClientRect()
        const center = headerRect.top + headerRect.height / 2
        const targets = [sidebar.querySelector<HTMLElement>('[data-ui~="sidebar-collapse"]')!]
        if (!sidebar.closest('[data-sidebar-collapsed="true"]')) {
          targets.push(
            sidebar.querySelector<HTMLElement>('[data-ui~="app-brand-mark"]')!,
            sidebar.querySelector<HTMLElement>('[data-ui~="app-brand-wordmark"]')!,
          )
        }
        return (
          Math.abs(brandRect.top - headerRect.top) < 1 &&
          Math.abs(brandRect.height - headerRect.height) < 1 &&
          targets.every((element) => {
            const rect = element.getBoundingClientRect()
            return Math.abs(rect.top + rect.height / 2 - center) < 1
          })
        )
      })
    for (const width of [1280, 1024]) {
      await page.setViewportSize({ width, height: 768 })
      await expect.poll(aligned, { message: `Expanded branding centered at ${width}px` }).toBe(true)
      await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click()
      await expect.poll(aligned, { message: `Collapsed control centered at ${width}px` }).toBe(true)
      await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click()
      await expect.poll(aligned).toBe(true)
    }
  })
}
