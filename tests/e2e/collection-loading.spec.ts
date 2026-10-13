import { expect, test } from '@playwright/test'

for (const media of ['books', 'movies', 'articles', 'podcasts', 'music', 'videos']) {
  test(`shows only the results loading state for ${media}`, async ({ page }) => {
    await page.route(`**/api/library/${media}?*`, () => {})
    await page.goto(`/library/${media}/${media === 'music' ? 'tracks' : 'archive'}`)
    const summary = page.locator('.books-result-summary')
    await expect(summary).toBeVisible()
    await expect(summary).not.toContainText(/Loading/i)
    expect((await summary.boundingBox())?.height).toBeGreaterThanOrEqual(43)
    const loading = page.locator('.books-collection .books-loading')
    await expect(loading).toHaveCount(1)
    await expect(loading).toBeVisible()
    await expect(loading).toHaveAttribute('role', 'status')
    await expect(loading).toContainText(`Loading ${media}…`)
    await expect(loading.locator('.sr-only')).toHaveCount(0)
    const label = loading.getByText(`Loading ${media}…`, { exact: true })
    await expect(label).toBeVisible()
    expect((await label.boundingBox())?.height).toBeGreaterThan(10)
  })
}
