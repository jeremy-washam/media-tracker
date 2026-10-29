import { installDefaultApiMocks } from './default-api-mocks'
import { expect, test, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await installDefaultApiMocks(page)
})

test.beforeEach(async ({ page }) => {
  await page.route('**/api/library/books{,/summary}?*', (route) =>
    route.fulfill({
      json: {
        data: Array.from({ length: 12 }, (_, index) => ({
          id: `motion-book-${index}`,
          title: `Motion Book ${index}`,
          subtitle: null,
          authors: [],
          coverUrl: null,
          coverColor: null,
          publicationDate: null,
          publicationPrecision: null,
          primarySeries: null,
          memberships: { archive: true, queue: false, currentlyReading: false },
          latestReadDate: null,
          latestReadPrecision: null,
          latestReadFormat: null,
          personalRating: null,
          addedToHardcoverDate: null,
          supportedReadCount: 1,
        })),
        nextCursor: null,
        counts: { archive: 12, queue: 0, filteredBooks: 12, supportedReads: 12 },
        facets: { formats: [], series: [], genres: [] },
        freshness: { lastSuccessfulSyncAt: null, degraded: false },
      },
    }),
  )
  await page.route('**/api/library/books/motion-book-0', (route) =>
    route.fulfill({ status: 404, json: { error: { message: 'Synthetic detail unavailable' } } }),
  )
})

function sampleMotion(page: Page) {
  return page.evaluate(() => {
    const workspace = document.querySelector<HTMLElement>('[data-ui~="library-workspace"]')!
    const collection = document.querySelector<HTMLElement>('[data-ui~="library-collection"]')!
    return new Promise<Array<{ space: number; edgeDifference: number }>>((resolve, reject) => {
      const samples: Array<{ space: number; edgeDifference: number }> = []
      const timeout = setTimeout(
        () => reject(new Error('Inspector transition did not finish')),
        3000,
      )
      let frame: number
      const sample = () => {
        const inspector = workspace.querySelector<HTMLElement>('[data-ui~="book-inspector"]')
        if (inspector) {
          samples.push({
            space: parseFloat(getComputedStyle(workspace).getPropertyValue('--inspector-space')),
            edgeDifference:
              collection.getBoundingClientRect().right - inspector.getBoundingClientRect().left,
          })
        }
        frame = requestAnimationFrame(sample)
      }
      const intended = (event: TransitionEvent) =>
        event.target === workspace && event.propertyName === '--inspector-space'
      const onRun = (event: TransitionEvent) => {
        if (!intended(event)) return
        workspace.removeEventListener('transitionrun', onRun)
        sample()
      }
      const onEnd = (event: TransitionEvent) => {
        if (!intended(event)) return
        workspace.removeEventListener('transitionrun', onRun)
        workspace.removeEventListener('transitionend', onEnd)
        clearTimeout(timeout)
        cancelAnimationFrame(frame)
        resolve(samples)
      }
      workspace.addEventListener('transitionrun', onRun)
      workspace.addEventListener('transitionend', onEnd)
    })
  })
}

test('moves the collection and inspector together throughout opening and closing', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/library/books/archive?layout=grid')
  const card = page.getByRole('button', { name: /Motion Book 0/ })
  await expect(card).toBeVisible()
  const collection = page.locator('[data-ui~="library-collection"]')
  const closedWidth = (await collection.boundingBox())!.width
  for (const opening of [true, false]) {
    const sampling = sampleMotion(page)
    if (opening) await card.click()
    else await page.getByRole('button', { name: 'Close inspector', exact: true }).click()
    const samples = await sampling
    const intermediate = samples.filter(({ space }) => space > 1 && space < 359)
    expect(intermediate.length).toBeGreaterThan(1)
    for (const sample of samples) expect(Math.abs(sample.edgeDifference)).toBeLessThan(1)
    const movement = samples.at(-1)!.space - samples[0]!.space
    if (opening) expect(movement).toBeGreaterThan(0)
    else expect(movement).toBeLessThan(0)
  }
  await expect(page.getByRole('complementary', { name: 'Book inspector' })).toHaveCount(0)
  expect((await collection.boundingBox())!.width).toBeCloseTo(closedWidth, 0)
})

test('skips motion with reduced motion and keeps narrow collections full width', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 960, height: 720 })
  await page.goto('/library/books/archive?layout=grid')
  const collection = page.locator('[data-ui~="library-collection"]')
  const closedWidth = (await collection.boundingBox())!.width
  await page.getByRole('button', { name: /Motion Book 0/ }).click()
  await expect(page.getByRole('complementary', { name: 'Book inspector' })).toBeVisible()
  expect((await collection.boundingBox())!.width).toBeCloseTo(closedWidth, 0)
  expect(
    await page
      .locator('[data-ui~="library-workspace"]')
      .evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe('0s')
  await page.getByRole('button', { name: 'Close inspector', exact: true }).last().click()
  await expect(page.getByRole('complementary', { name: 'Book inspector' })).toHaveCount(0)
  expect((await collection.boundingBox())!.width).toBeCloseTo(closedWidth, 0)
})
