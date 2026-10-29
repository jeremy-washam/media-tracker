import { expect, test } from '@playwright/test'
import {
  createWorkerRuntime,
  runtimeBookTitle,
  runtimeMovieTitle,
  runtimePodcastTitle,
  runtimeTrackTitle,
  runtimeVideoTitle,
  youtubeArchive,
  type WorkerRuntime,
} from '../support/worker-runtime'

let runtime: WorkerRuntime
test.beforeAll(async () => {
  runtime = await createWorkerRuntime()
})
test.afterAll(async () => {
  await runtime?.dispose()
})
test.beforeEach(async ({ page }) => {
  // API traffic is real. Artwork/source links must never contact external sites.
  await page.route('https://**/*', (route) => route.abort())
})

for (const [section, title, inspector] of [
  ['books/archive', runtimeBookTitle, 'Book inspector'],
  ['movies/archive', runtimeMovieTitle, 'Movie inspector'],
  ['articles/archive', 'A synthetic article', 'Article inspector'],
  ['podcasts/archive', runtimePodcastTitle, 'Podcast inspector'],
  ['music/tracks', runtimeTrackTitle, 'Music inspector'],
  ['videos/archive', `${runtimeVideoTitle} 0`, 'Video inspector'],
] as const) {
  test(`browses imported ${section} through the production Worker`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(new URL(`/library/${section}`, runtime.url).href)
    const item = page.getByRole('button', { name: new RegExp(title) }).first()
    await expect(item).toBeVisible()
    await item.click()
    const pane = page.getByRole('complementary', { name: inspector })
    await expect(pane).toBeVisible()
    await expect(pane.getByRole('heading', { name: title, exact: true }).first()).toBeVisible()
    const history = pane.getByRole('tab', { name: /History/i })
    await history.click()
    const historyPanel = pane.getByRole('tabpanel', { name: /History/i })
    await expect(historyPanel).toBeVisible()
    await expect(historyPanel.locator('article, ol li').first()).toBeVisible()
    await pane.getByRole('button', { name: 'Close inspector' }).click()
    await expect(pane).toHaveCount(0)
    await expect(item).toBeFocused()
    expect(errors).toEqual([])
  })
}

test('uses actual search results and preserves source-derived overlap', async ({ page }) => {
  await page.goto(new URL('/library/books/archive', runtime.url).href)
  const search = page.getByRole('textbox', { name: 'Search books', exact: true })
  await search.fill('missingfixtureterm')
  await expect(page.getByRole('button', { name: new RegExp(runtimeBookTitle) })).toHaveCount(0)
  await search.fill('Runtime Orchard')
  await expect(page.getByRole('button', { name: new RegExp(runtimeBookTitle) })).toBeVisible()
  await page.goto(new URL('/library/books/queue', runtime.url).href)
  await expect(page.getByRole('button', { name: new RegExp(runtimeBookTitle) })).toBeVisible()
})

test('automatically loads a real second cursor page and opens its history', async ({ page }) => {
  await runtime.api('/api/connections/youtube/import?connectionKey=paging&connectionLabel=Paging', {
    method: 'POST',
    body: youtubeArchive(55),
  })
  const cursors: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname === '/api/library/videos' && url.searchParams.has('cursor'))
      cursors.push(url.searchParams.get('cursor')!)
  })
  await page.goto(
    new URL('/library/videos/archive?sort=title&direction=asc&layout=list', runtime.url).href,
  )
  await expect(page.locator('[data-collection-item]')).toHaveCount(50)
  const collection = page.locator('[data-ui~="library-collection"]')
  await collection.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(page.locator('[data-collection-item]')).toHaveCount(55)
  expect(cursors.length).toBeGreaterThan(0)
  const item = page.getByRole('button', { name: /Runtime Video 9\b/ })
  await item.click()
  const inspector = page.getByRole('complementary', { name: 'Video inspector' })
  await inspector.getByRole('tab', { name: 'Watch history', exact: true }).click()
  await expect(inspector.getByText('Paging', { exact: true })).toBeVisible()
  await inspector.getByRole('button', { name: 'Close inspector' }).click()
  await expect(item).toBeFocused()
})

test('resumes an interrupted real import from Connections and refreshes Library results', async ({
  page,
}) => {
  const first = (await (
    await runtime.api(
      '/api/connections/youtube/import?connectionKey=resume-ui&connectionLabel=ResumeUI',
      { method: 'POST', body: youtubeArchive(105) },
    )
  ).json()) as { completed: boolean; importId: string }
  expect(first.completed).toBe(false)
  await page.goto(new URL('/connections', runtime.url).href)
  const account = page.locator('[data-source="youtube"]').filter({ hasText: 'ResumeUI' })
  const resume = account.getByRole('button', { name: 'Resume import' })
  await expect(resume).toBeVisible()
  const continuationUrl = new URL(
    `/api/connections/youtube/import/${first.importId}/continue`,
    runtime.url,
  )
  // Verify the real import response before asserting its refreshed UI state.
  // Backend/network failures should report their own acceptance stage rather
  // than appearing as a missing Connections refresh after the locator timeout.
  const [continued] = await Promise.all([
    page.waitForResponse((response) => {
      const url = new URL(response.url())
      return (
        response.request().method() === 'POST' &&
        url.origin === continuationUrl.origin &&
        url.pathname === continuationUrl.pathname
      )
    }),
    resume.click(),
  ])
  expect(continued.status()).toBe(200)
  expect(await continued.json()).toMatchObject({
    completed: true,
    nextOffset: null,
    activityCards: 105,
    totalRecords: 106,
  })
  await expect(resume).toHaveCount(0)
  await page.goto(new URL('/library/videos/archive?q=Runtime%20Video%20104', runtime.url).href)
  await expect(page.getByRole('button', { name: /Runtime Video 104\b/ })).toBeVisible()
})
