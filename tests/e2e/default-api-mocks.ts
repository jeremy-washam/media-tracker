import type { Page } from '@playwright/test'
import {
  booksResponse,
  moviesResponse,
  articlesResponse,
  podcastsResponse,
  musicResponse,
  videosResponse,
} from './ui-fixtures'

/** Background prefetches must use synthetic data just like each test's foreground reads. */
export async function installDefaultApiMocks(page: Page) {
  const collections = {
    books: booksResponse,
    movies: moviesResponse,
    articles: articlesResponse,
    podcasts: podcastsResponse,
    music: musicResponse,
    videos: videosResponse,
  }
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/health')
      return route.fulfill({
        json: {
          status: 'ok',
          service: 'media-tracker-api',
          version: '0.0.0',
          timestamp: '2026-10-12T12:00:00.000Z',
          requestId: 'synthetic-health',
        },
      })
    if (url.pathname === '/api/connections') return route.fulfill({ json: { data: [] } })
    if (url.pathname === '/api/sync-runs' || url.pathname.endsWith('/filter-options')) {
      return route.fulfill({ json: { data: [], nextCursor: null } })
    }
    const media = url.pathname.match(
      /^\/api\/library\/(books|movies|articles|podcasts|music|videos)$/,
    )?.[1] as keyof typeof collections | undefined
    if (media) return route.fulfill({ json: collections[media]() })
    return route.fulfill({
      status: 404,
      json: { error: { message: 'Synthetic resource unavailable' } },
    })
  })
}
