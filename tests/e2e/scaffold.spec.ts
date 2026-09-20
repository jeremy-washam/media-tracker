import { expect, test } from '@playwright/test'

const book = {
  id: 'book-one',
  title: 'A Distant Book',
  subtitle: null,
  authors: [{ id: 'author-one', name: 'Ada Author' }],
  coverUrl: null,
  coverColor: '#667788',
  publicationDate: '2020',
  publicationPrecision: 'year' as const,
  primarySeries: 'A Series',
  memberships: { archive: true, queue: false, currentlyReading: false },
  latestReadDate: '2026-09-12',
  latestReadPrecision: 'day' as const,
  latestReadFormat: 'Paperback',
  personalRating: 4.5,
  addedToHardcoverDate: '2026-01-01',
  supportedReadCount: 1,
}

const booksResponse = (data = [book], nextCursor: string | null = null) => ({
  data,
  nextCursor,
  counts: { archive: 128, queue: 986, filteredBooks: data.length, supportedReads: data.length },
  facets: {
    formats: [{ value: 'paperback', label: 'Paperback', count: 1 }],
    series: [{ value: 'series-one', label: 'A Series', count: 1 }],
    genres: [{ value: 'fiction', label: 'Fiction', count: 1 }],
  },
  freshness: { lastSuccessfulSyncAt: '2026-09-20T10:00:00.000Z', degraded: false },
})

test.beforeEach(async ({ page }) => {
  await page.route('**/api/library/books?*', (route) => route.fulfill({ json: booksResponse() }))
})

test('shows the production Books shell and preserves Connections', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveURL(/\/library\/books\/archive/)
  await expect(page.getByRole('heading', { name: 'Books' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Archive 128' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Queue 986' })).toBeVisible()
  await expect(page.getByText('Local API connected')).toBeVisible()

  await page.getByRole('link', { name: 'Connections' }).click()

  await expect(page.getByRole('heading', { name: 'Connections' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Readwise Reader' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'YouTube', exact: true }).first()).toBeVisible()
})

test('keeps Books collection controls in the URL and loads subsequent pages', async ({ page }) => {
  const requested: string[] = []
  await page.unroute('**/api/library/books?*')
  await page.route('**/api/library/books?*', async (route) => {
    const url = new URL(route.request().url())
    requested.push(url.search)
    const second = url.searchParams.has('cursor')
    const searched = url.searchParams.get('q') === 'Ada'
    await route.fulfill({
      json: booksResponse(
        [
          {
            ...book,
            id: second ? 'book-two' : 'book-one',
            title: second ? 'Second Book' : 'A Distant Book',
          },
        ],
        searched || second ? null : 'next-page',
      ),
    })
  })
  await page.goto('/library/books/archive')
  await expect(page.getByRole('button', { name: /A Distant Book/ })).toBeVisible()
  await page.getByRole('button', { name: 'Load more' }).click()
  await expect(page.getByRole('button', { name: /Second Book/ })).toBeVisible()
  await page.getByRole('textbox', { name: 'Search books' }).fill('Ada')
  await page.getByRole('textbox', { name: 'Search books' }).press('Enter')
  await expect(page).toHaveURL(/q=Ada/)
  await page.getByRole('button', { name: 'List view' }).click()
  await expect(page).toHaveURL(/layout=list/)
  await page.getByRole('button', { name: 'Sort ascending' }).click()
  await expect(page).toHaveURL(/direction=asc/)
  expect(requested.some((value) => value.includes('cursor=next-page'))).toBe(true)
  expect(requested.some((value) => value.includes('q=Ada'))).toBe(true)
})

test('opens a selected Book and loads personal activity in History', async ({ page }) => {
  await page.route('**/api/library/books/book-one', (route) =>
    route.fulfill({
      json: {
        id: book.id,
        title: book.title,
        subtitle: null,
        description: 'A concise overview.',
        coverUrl: null,
        coverColor: '#667788',
        publicationDate: '2020',
        publicationPrecision: 'year',
        pageCount: 320,
        audioSeconds: null,
        memberships: book.memberships,
        personalRating: 4.5,
        series: [],
        contributors: [{ role: 'Author', contributors: book.authors }],
        selectedEdition: null,
        community: {
          rating: 4.1,
          ratingsCount: 10,
          genres: ['Fiction'],
          moods: [],
          pace: [],
          contentWarnings: [],
        },
        source: {
          label: 'Hardcover',
          url: null,
          refreshedAt: '2026-09-20T10:00:00.000Z',
          coverage: 'complete',
        },
      },
    }),
  )
  await page.route('**/api/library/books/book-one/history*', (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: 'read-one',
            kind: 'read',
            label: 'Read',
            date: '2026-09-12',
            datePrecision: 'day',
            detail: null,
            edition: { id: 'edition-one', format: 'Paperback', title: book.title },
          },
        ],
        nextCursor: null,
      },
    }),
  )
  await page.goto('/library/books/archive')
  await page.getByRole('button', { name: /A Distant Book/ }).click()
  await expect(page).toHaveURL(/item=book-one/)
  await expect(page.getByText('A concise overview.')).toBeVisible()
  await page.getByRole('tab', { name: 'History' }).click()
  await expect(page.getByText('Paperback')).toBeVisible()
  await page.getByRole('button', { name: 'Close inspector' }).last().click()
  await expect(page.getByRole('button', { name: /A Distant Book/ })).toBeFocused()
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
