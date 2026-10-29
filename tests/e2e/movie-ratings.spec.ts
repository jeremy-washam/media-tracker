import { expect, test } from '@playwright/test'
import { installDefaultApiMocks } from './default-api-mocks'
import { movie, moviesResponse } from './ui-fixtures'

for (const appearance of ['light', 'dark']) {
  for (const width of [1440, 600]) {
    test(`distinguishes current and viewing movie ratings in ${appearance} at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 })
      await page.emulateMedia({ colorScheme: appearance as 'light' | 'dark' })
      await installDefaultApiMocks(page)
      const viewingOnly = {
        ...movie,
        personal: {
          currentRating: null,
          viewingRating: { value: 3.5, archiveEntryId: 'viewing-one', watchedOn: '2026-09-12' },
          liked: false,
          reviewed: false,
        },
      }
      await page.route('**/api/library/movies?*', (route) =>
        route.fulfill({
          json: {
            ...moviesResponse(),
            data: [
              viewingOnly,
              { ...movie, id: 'movie-current', displayTitle: 'Current Rated Movie' },
            ],
          },
        }),
      )
      await page.route('**/api/library/movies/movie-one', (route) =>
        route.fulfill({
          json: {
            ...viewingOnly,
            personal: { ...viewingOnly.personal, reviewedOccurrenceCount: 0 },
            overview: null,
            originalTitle: null,
            originalLanguage: null,
            releaseDate: null,
            tagline: null,
            backdropUrl: null,
            genres: [],
            cast: [],
            countries: [],
            tmdbRating: null,
            tmdbVoteCount: null,
            source: {
              letterboxdUrl: null,
              tmdbUrl: null,
              imdbUrl: null,
              connectionLabel: 'Letterboxd',
              coverage: 'complete',
              lastCompleteExportAt: '2026-09-12T10:00:00.000Z',
              lastRssSuccessAt: '2026-09-20T10:00:00.000Z',
              metadataStatus: 'not_configured',
            },
          },
        }),
      )
      await page.goto('/library/movies/archive?view=list')
      const row = page.locator('[data-collection-item="movie-one"]')
      if (width === 1440) {
        await expect(row.getByText('3.5/5')).toBeVisible()
        await expect(row.getByText('Viewing', { exact: true })).toBeVisible()
        await expect(
          page.locator('[data-collection-item="movie-current"]').getByText('4.5/5'),
        ).toBeVisible()
      }
      await page.getByRole('button', { name: 'Grid view' }).click()
      await expect(row.getByRole('img', { name: '3.5 out of 5 stars' })).toBeVisible()
      await expect(row.getByText('Viewing rating')).toBeVisible()
      await row.click()
      const inspector = page.getByRole('complementary', { name: 'Movie inspector' })
      await expect(inspector.getByText('Latest viewing rating 3.5/5')).toBeVisible()
      await expect(inspector.getByText('No current rating imported')).toBeVisible()
      await expect(inspector.getByText('Current film rating', { exact: true })).toBeVisible()
      await expect
        .poll(async () => {
          const bounds = await inspector.boundingBox()
          return bounds ? Math.abs(bounds.x + bounds.width - width) : Infinity
        })
        .toBeLessThan(2)
      await page.screenshot({ path: `/tmp/imladris-ratings-${appearance}-${width}.png` })
      await page.getByRole('button', { name: 'Close inspector' }).last().click()
      await expect(row).toBeFocused()
      await page.getByRole('button', { name: 'Filters', exact: true }).click()
      await expect(
        page.getByText('Current film rating, or the viewing rating shown in the results.'),
      ).toBeVisible()
      await page.getByRole('combobox', { name: 'Your rating', exact: true }).click()
      await page.getByRole('option', { name: 'Rated', exact: true }).click()
      await expect(page).toHaveURL(/rating=rated/)
      await page.goto('/library/movies/queue?view=grid')
      await expect(row.getByText('Viewing rating')).toHaveCount(0)
      await expect(row.getByLabel('Not rated')).toHaveCount(1)
    })
  }
}
