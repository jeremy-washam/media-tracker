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
  await page.route('**/api/library/music{,/summary}?*', (route) => {
    const view = new URL(route.request().url()).searchParams.get('section') ?? 'tracks'
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

for (const dark of [false, true]) {
  for (const width of [1440, 600]) {
    test(`artist photos load in list, grid and inspector in ${dark ? 'dark' : 'light'} at ${width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript(
        (dark) => localStorage.setItem('media-tracker:dark', String(dark)),
        dark,
      )
      await installDefaultApiMocks(page)
      const artist = {
        ...track,
        id: 'artist-photo',
        kind: 'artist',
        title: 'Synthetic Artist',
        imageUrl: 'https://example.invalid/artist-photo.svg',
      }
      await page.route(artist.imageUrl, (route) =>
        route.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#52778b"/><circle cx="40" cy="27" r="14" fill="#c9d9e2"/><path d="M12 80V65a28 28 0 0 1 56 0v15" fill="#c9d9e2"/></svg>',
        }),
      )
      await page.route('**/api/library/music{,/summary}?*', (route) =>
        route.fulfill({
          json: { ...musicResponse([]), data: [artist], filteredCount: 1, totalCount: 1 },
        }),
      )
      await page.route('**/api/library/music/artists/artist-photo', (route) =>
        route.fulfill({ json: { ...artist, firstPlayedAt: null, durationMs: null, isrc: null } }),
      )
      await page.goto('/library/music/artists?layout=list')
      const row = page.locator('[data-collection-item="artist-photo"]')
      await expect
        .poll(() =>
          row
            .locator('img')
            .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
        )
        .toBe(true)
      await page.screenshot({ path: testInfo.outputPath('list.png') })
      await page.getByRole('button', { name: 'Grid view' }).click()
      await expect(row.locator('img')).toBeVisible()
      await row.click()
      const inspector = page.getByRole('complementary', { name: 'Music inspector' })
      await expect
        .poll(() =>
          inspector
            .locator('[data-ui~="inspector-hero"] img')
            .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
        )
        .toBe(true)
      await expect
        .poll(() =>
          inspector.evaluate((element) => {
            const bounds = element.getBoundingClientRect()
            return Math.abs(bounds.right - innerWidth) < 2
          }),
        )
        .toBe(true)
      await page.screenshot({ path: testInfo.outputPath('inspector.png') })
    })
  }
}
