import { expect, test } from '@playwright/test'

test('shows the connected application shell and source placeholders', async ({ page }) => {
  await page.goto('/')

  await expect(
    page.getByRole('heading', { name: 'Your media history, in one place.' }),
  ).toBeVisible()
  await expect(page.getByText('Local API connected')).toBeVisible()

  await page.getByRole('link', { name: 'Connections' }).click()

  await expect(page.getByRole('heading', { name: 'Connections' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Readwise Reader' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'YouTube', exact: true }).first()).toBeVisible()
})

test('filters the full Archive and loads subsequent pages', async ({ page }) => {
  const requested: string[] = []
  await page.route('**/api/media*', async (route) => {
    const url = new URL(route.request().url())
    requested.push(url.search)
    const book = url.searchParams.get('type') === 'book'
    const second = url.searchParams.has('cursor')
    await route.fulfill({
      json: {
        data: [
          {
            id: book ? 'book-one' : second ? 'video-two' : 'video-one',
            type: book ? 'book' : 'video',
            title: book ? 'A distant book' : second ? 'Second video' : 'First video',
          },
        ],
        nextCursor: book || second ? null : 'next-page',
        totalCount: 1006,
        filteredCount: book ? 1 : 1006,
        counts: { article: 0, video: 1005, book: 1, movie: 0, song: 0, podcast_episode: 0 },
      },
    })
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'First video' })).toBeVisible()
  await page.getByRole('button', { name: 'Load more' }).click()
  await expect(page.getByRole('heading', { name: 'Second video' })).toBeVisible()
  await page.getByRole('button', { name: 'Books 1', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'A distant book' })).toBeVisible()
  await expect(page.getByText('Showing 1 of 1 items.')).toBeVisible()
  expect(requested.some((value) => value.includes('cursor=next-page'))).toBe(true)
  expect(requested.some((value) => value.includes('type=book'))).toBe(true)
})

test('shows separate account progress and resumes the selected account', async ({ page }) => {
  let resumed = false
  await page.route('**/api/connections', (route) =>
    route.fulfill({
      json: {
        data: ['first', 'second'].map((id, index) => ({
          id,
          label: `YouTube ${id} account`,
          source: 'youtube',
          status: 'connected',
          coverage: 'complete',
          lastSuccessfulSyncAt: null,
          lastAttemptedSyncAt: null,
          lastExportAt: null,
          incompleteImports:
            index === 1 && !resumed
              ? [
                  {
                    importId: 'synthetic-hash',
                    status: 'processing',
                    nextOffset: 100,
                    totalRecords: 200,
                  },
                ]
              : [],
        })),
      },
    }),
  )
  await page.route('**/api/sync-runs*', (route) =>
    route.fulfill({ json: { data: [], nextCursor: null } }),
  )
  await page.route('**/api/connections/youtube/import/synthetic-hash/continue*', async (route) => {
    expect(new URL(route.request().url()).searchParams.get('connectionId')).toBe('second')
    resumed = true
    await route.fulfill({
      json: {
        syncRunId: 'run',
        importId: 'synthetic-hash',
        alreadyImported: false,
        completed: true,
        nextOffset: null,
        totalRecords: 200,
        activityCards: 200,
        videos: 100,
        archiveEntries: 100,
        sourceRecords: 100,
        unresolvedRecords: 0,
        ignoredRecords: 0,
        watchLaterRecords: 0,
      },
    })
  })
  await page.goto('/connections')
  await expect(page.getByText('YouTube first account', { exact: true })).toBeVisible()
  await expect(page.getByText('YouTube second account', { exact: true })).toBeVisible()
  await expect(page.getByText('Import processing: 100 / 200 records committed.')).toBeVisible()
  await page.getByRole('button', { name: 'Resume import' }).click()
  await expect(page.getByRole('button', { name: 'Resume import' })).toHaveCount(0)
  expect(resumed).toBe(true)
})
