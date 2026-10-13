import { expect, test } from '@playwright/test'
import {
  booksResponse,
  moviesResponse,
  articlesResponse,
  podcastsResponse,
  musicResponse,
  videosResponse,
} from './ui-fixtures'

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
      await page.route(`**/api/library/${media}?*`, (route) => route.fulfill({ json: response() }))
      await page.route(`**/api/library/${media}/**`, (route) =>
        route.fulfill({
          status: 404,
          json: { error: { message: 'Synthetic detail unavailable' } },
        }),
      )
      await page.goto(`/library/${media}/${section}`)
      const row = page
        .locator(
          'button.book-row, button.movie-row, button.article-row, button.spotify-result, button.video-result',
        )
        .first()
      await expect(row).toBeVisible()
      const aligned = () =>
        page.evaluate(() => {
          const header = document.querySelector<HTMLElement>('.workspace-header')!
          const breadcrumb = document.querySelector<HTMLElement>('.workspace-breadcrumb')!
          const mobile = document.querySelector<HTMLElement>('.mobile-nav-trigger')!
          const nav = document.querySelector<HTMLElement>('.workspace-header-tabs')!
          const toolbar = document.querySelector<HTMLElement>('.books-toolbar')!
          const row = document.querySelector<HTMLElement>(
            'button.book-row, button.movie-row, button.article-row, button.spotify-result, button.video-result',
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
          '.books-collection::-webkit-scrollbar, .workspace-header::-webkit-scrollbar { width: 16px; }',
      })
      await expect
        .poll(() =>
          page
            .locator('.books-collection')
            .evaluate((e) => (e as HTMLElement).offsetWidth - e.clientWidth),
        )
        .toBeGreaterThan(0)
      await expect
        .poll(aligned, { message: 'matching edges with a reserved classic scrollbar gutter' })
        .toBe(true)
      await row.click()
      await expect(page.locator('.books-page')).toHaveAttribute('data-inspector-open', 'true')
      await expect.poll(aligned, { message: 'matching edges with the inspector open' }).toBe(true)
      await page
        .locator('.book-inspector, .media-inspector')
        .getByRole('button', { name: 'Close inspector', exact: true })
        .click()
      await expect
        .poll(aligned, { message: 'matching edges after closing the inspector' })
        .toBe(true)
    })
  }
}
