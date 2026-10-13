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

for (const { media, section, response } of collections) {
  test(`activates ${media} shadcn checkboxes by label and keyboard`, async ({ page }) => {
    await page.route(`**/api/library/${media}?*`, (r) => r.fulfill({ json: response() }))
    await page.route('**/api/library/**/filter-options?*', (r) =>
      r.fulfill({
        json: {
          data: [{ value: 'test-option', label: 'Test option', count: 1 }],
          nextCursor: null,
        },
      }),
    )
    await page.goto(`/library/${media}/${section}`)
    await page.getByRole('button', { name: 'Filters', exact: true }).click()
    const panel = page.locator('.filter-panel')
    const checkbox = panel.getByRole('checkbox').first()
    await expect(checkbox).toBeVisible()
    await expect(checkbox).toHaveAttribute('data-slot', 'checkbox')
    const label = checkbox.locator('xpath=ancestor::label[1]')
    await label.click({ position: { x: (await label.boundingBox())!.width - 3, y: 8 } })
    await expect(checkbox).toBeChecked()
    const selectedUrl = page.url()
    await checkbox.focus()
    await checkbox.press('Space')
    await expect(checkbox).not.toBeChecked()
    await expect.poll(() => page.url()).not.toBe(selectedUrl)
  })
}

for (const dark of [false, true]) {
  test(`isolates mobile navigation focus and restores it in ${dark ? 'dark' : 'light'} appearance`, async ({
    page,
  }) => {
    await page.addInitScript(
      (dark) => localStorage.setItem('media-tracker:dark', String(dark)),
      dark,
    )
    await page.setViewportSize({ width: 390, height: 768 })
    await page.route('**/api/library/books?*', (r) => r.fulfill({ json: booksResponse() }))
    await page.route('**/api/library/movies?*', (r) => r.fulfill({ json: moviesResponse() }))
    await page.goto('/library/books/archive')
    const trigger = page.getByRole('button', { name: 'Open navigation', exact: true })
    await trigger.click()
    const sheet = page.getByRole('dialog', { name: 'Navigation', exact: true })
    await expect(sheet).toBeVisible()
    await expect.poll(() => sheet.evaluate((e) => e.contains(document.activeElement))).toBe(true)
    for (let i = 0; i < 22; i++) {
      await page.keyboard.press('Tab')
      await expect.poll(() => sheet.evaluate((e) => e.contains(document.activeElement))).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await trigger.click()
    await sheet.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(sheet).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await trigger.click()
    await sheet.getByRole('link', { name: 'Movies', exact: true }).click()
    await expect(page).toHaveURL(/library\/movies\/archive/)
    await expect(sheet).toHaveCount(0)
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true)
  })
}

test('shows sidebar hints to keyboard users without browser title hints', async ({ page }) => {
  await page.route('**/api/library/books?*', (r) => r.fulfill({ json: booksResponse() }))
  await page.goto('/library/books/archive')
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click()
  const books = page.getByRole('link', { name: 'Books', exact: true })
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).press('Tab')
  await page.getByRole('link', { name: 'Library', exact: true }).press('Tab')
  await expect(books).toBeFocused()
  await expect(page.getByRole('tooltip', { name: 'Books', exact: true })).toContainText('Books')
  await expect(books).not.toHaveAttribute('title')
  await books.press('Escape')
  await expect(page.getByRole('tooltip')).toHaveCount(0)
})

test('opens a file chooser from an actual shadcn action without uploading', async ({ page }) => {
  await page.route('**/api/connections', (r) => r.fulfill({ json: { data: [] } }))
  await page.route('**/api/sync-runs*', (r) => r.fulfill({ json: { data: [], nextCursor: null } }))
  await page.goto('/connections')
  await page.getByRole('textbox', { name: 'YouTube account label' }).fill('Synthetic QA account')
  const upload = page.getByRole('button', { name: 'Import a new YouTube account', exact: true })
  await expect(upload).toHaveAttribute('data-slot', 'button')
  const chooserPromise = page.waitForEvent('filechooser')
  await upload.click()
  const chooser = await chooserPromise
  expect(chooser.isMultiple()).toBe(false)
  await expect(page.locator('input[type=file]')).toHaveAttribute('data-slot', 'input')
  await expect(page.locator('input[type=file]')).toHaveAttribute('accept', '.zip,application/zip')
})

test('uses Skeleton and Alert while retaining loading announcements and retry behavior', async ({
  page,
}) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/library/books?*', async (r) => {
    await gate
    await r.fulfill({ status: 500, json: { error: 'Synthetic service failure' } })
  })
  await page.goto('/library/books/archive')
  await expect(page.getByRole('status')).toContainText('Loading')
  await expect(page.locator('[data-slot=skeleton]').first()).toBeVisible()
  release()
  await expect(page.locator('[data-slot=alert]')).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  await page.unroute('**/api/library/books?*')
  await page.route('**/api/library/books?*', (r) => r.fulfill({ json: booksResponse() }))
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.locator('.book-row').first()).toBeVisible()
})

test('keeps the Video duration checkbox and its complete label together', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 768 })
  await page.route('**/api/library/videos?*', (r) => r.fulfill({ json: videosResponse() }))
  await page.goto('/library/videos/archive')
  await page.getByRole('button', { name: 'Filters', exact: true }).click()
  const checkbox = page.getByRole('checkbox', { name: 'Include unknown', exact: true })
  const label = checkbox.locator('xpath=ancestor::label[1]')
  await expect(label).toHaveAttribute('data-slot', 'field-label')
  const bounds = await label.boundingBox()
  expect(bounds!.height).toBeLessThanOrEqual(20)
  await label.click()
  await expect(checkbox).toBeChecked()
  await expect(page).toHaveURL(/durationUnknown=true/)
})
