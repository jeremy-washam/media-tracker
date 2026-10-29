import { installDefaultApiMocks } from './default-api-mocks'
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await installDefaultApiMocks(page)
})

for (const media of ['books', 'movies', 'articles', 'podcasts', 'music', 'videos']) {
  test(`shows only the results loading state for ${media}`, async ({ page }) => {
    await page.route(`**/api/library/${media}?*`, () => {})
    await page.goto(`/library/${media}/${media === 'music' ? 'tracks' : 'archive'}`)
    const summary = page.locator('[data-ui~="collection-summary"]')
    await expect(summary).toBeVisible()
    await expect(summary).not.toContainText(/Loading/i)
    expect((await summary.boundingBox())?.height).toBeGreaterThanOrEqual(34)
    const loading = page.locator('[data-ui~="library-collection"] [data-ui~="collection-loading"]')
    await expect(loading).toHaveCount(1)
    await expect(loading).toBeVisible()
    await expect(loading).toHaveAttribute('role', 'status')
    await expect(loading).toContainText(`Loading ${media}…`)
    const label = loading.getByText(`Loading ${media}…`, { exact: true })
    await expect(label).toHaveCount(1)
    await expect(label).toBeVisible()
    expect((await label.boundingBox())?.height).toBeGreaterThan(10)
  })
}
