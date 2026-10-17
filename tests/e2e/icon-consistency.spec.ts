import { expect, test } from '@playwright/test'
import { installDefaultApiMocks } from './default-api-mocks'
import { musicResponse, track } from './ui-fixtures'

test('missing Music artwork reflects the kind consistently in collections and inspectors', async ({
  page,
}, testInfo) => {
  await installDefaultApiMocks(page)
  const fallbackShapes = new Set<string>()
  const items = (['track', 'album', 'artist'] as const).map((kind) => ({
    ...track,
    id: `${kind}-fallback`,
    kind,
    title: `Synthetic ${kind}`,
  }))
  await page.route('**/api/library/music?*', (route) => {
    const view = new URL(route.request().url()).searchParams.get('view') ?? 'tracks'
    const data = items.filter((item) => `${item.kind}s` === view)
    return route.fulfill({
      json: { ...musicResponse([]), data, totalCount: data.length, filteredCount: data.length },
    })
  })

  for (const item of items) {
    const view = `${item.kind}s`
    await page.route(`**/api/library/music/${view}/${item.id}`, (route) =>
      route.fulfill({
        json: { ...item, firstPlayedAt: null, durationMs: null, isrc: null },
      }),
    )

    await page.goto(`/library/music/${view}?layout=list`)
    const row = page.locator(`[data-collection-item="${item.id}"]`)
    const rowIcon = row.locator('svg')
    await expect(rowIcon).toBeVisible()
    const shape = await rowIcon.innerHTML()
    fallbackShapes.add(shape)

    await row.click()
    const inspector = page.getByRole('complementary', { name: 'Music inspector' })
    await expect(inspector.getByRole('heading', { name: item.title, exact: true })).toBeVisible()
    const inspectorIcon = inspector.locator('[data-ui~="inspector-hero"] svg')
    await expect(inspectorIcon).toBeVisible()
    await expect(inspectorIcon).toHaveJSProperty('innerHTML', shape)
    await expect(inspectorIcon).toHaveAttribute('aria-hidden', 'true')
    await expect
      .poll(() =>
        inspector.evaluate((element) => {
          const rect = element.getBoundingClientRect()
          return rect.width >= 300 && rect.left >= 0 && rect.right <= innerWidth + 1
        }),
      )
      .toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`${item.kind}.png`) })
  }

  // Tracks, albums, and artists must not collapse to the same placeholder.
  expect(fallbackShapes.size).toBe(3)
})
