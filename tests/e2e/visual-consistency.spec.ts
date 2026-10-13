import { expect, test, type Page } from '@playwright/test'
import {
  book,
  booksResponse,
  moviesResponse,
  article,
  articlesResponse,
  podcast,
  podcastsResponse,
  track,
  musicResponse,
  video,
  videosResponse,
} from './ui-fixtures'

const articleDetail = {
  ...article,
  sourceCategory: 'article',
  currentLocation: 'archive',
  acquisitionSource: 'web',
  summary: 'A concise summary.',
  wordCount: 1200,
  documentNote: null,
  highlightDocumentNote: null,
  tags: [],
  dates: {
    createdAt: null,
    savedAt: null,
    firstOpenedAt: null,
    lastOpenedAt: null,
    lastMovedAt: null,
    updatedAt: null,
    observedAt: '2026-09-20T10:00:00.000Z',
  },
  annotations: { active: 0, deleted: 0, discarded: 0 },
  content: { available: false, state: null, coverage: null, failureClass: null },
  links: {
    original: 'https://example.com/article',
    reader: 'https://read.readwise.io/read/article-one',
  },
  readerRelationships: [
    {
      documentId: 'article-one',
      location: 'archive',
      available: true,
      readerUrl: 'https://read.readwise.io/read/article-one',
    },
  ],
  source: {
    connectionLabel: 'Readwise Reader',
    coverage: 'partial',
    sourceRefreshedAt: '2026-09-20T10:00:00.000Z',
  },
}
const bookDetail = {
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
  source: { label: 'Hardcover', url: null, refreshedAt: null, coverage: 'complete' },
}
const channel = {
  ...video,
  id: 'channel-one',
  kind: 'channel',
  title: 'A Distant Channel',
  archiveVideoCount: 2,
  queueVideoCount: 1,
}

async function mocks(page: Page) {
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname
    const empty = { data: [], nextCursor: null, totalCount: 0 }
    if (path === '/api/health')
      return route.fulfill({
        json: {
          status: 'ok',
          service: 'media-tracker-api',
          version: '0.0.0',
          timestamp: '2026-10-12T12:00:00.000Z',
          requestId: 'synthetic',
        },
      })
    if (
      path.endsWith('/history') ||
      path.endsWith('/highlights') ||
      path.endsWith('/filter-options') ||
      path.endsWith('/sync-runs') ||
      path.endsWith('/connections')
    )
      return route.fulfill({ json: empty })
    const collections = {
      books: booksResponse(),
      movies: moviesResponse(),
      articles: articlesResponse(),
      podcasts: podcastsResponse(),
      music: musicResponse(),
      videos: videosResponse(
        path === '/api/library/videos' && url.searchParams.get('view') === 'channels'
          ? [channel]
          : [video],
      ),
    }
    for (const [media, json] of Object.entries(collections)) {
      if (path === `/api/library/${media}`) return route.fulfill({ json })
    }
    if (path === '/api/library/books/book-one') return route.fulfill({ json: bookDetail })
    if (path === '/api/library/articles/article-one') return route.fulfill({ json: articleDetail })
    if (path === '/api/library/music/tracks/track-one')
      return route.fulfill({
        json: {
          ...track,
          firstPlayedAt: '2026-01-01T00:00:00.000Z',
          durationMs: 180000,
          isrc: null,
        },
      })
    if (path === '/api/library/podcasts/episodes/podcast-one')
      return route.fulfill({
        json: {
          ...podcast,
          description: 'A concise description.',
          showId: null,
          publisher: null,
          showDescription: null,
          showUrl: null,
          availability: 'current',
          firstObservedAt: null,
          lastObservedAt: null,
        },
      })
    if (path === '/api/library/videos/video-one')
      return route.fulfill({
        json: {
          ...video,
          description: 'A concise description.',
          categoryId: null,
          categoryTitle: null,
          captionAvailable: null,
          definition: null,
          projection: null,
          catalogCheckedAt: null,
          historyCount: 2,
          queueRelationships: [],
          metadataMessage: null,
        },
      })
    if (path === '/api/library/video-channels/channel-one')
      return route.fulfill({
        json: {
          ...channel,
          description: 'A concise description.',
          customUrl: null,
          catalogCheckedAt: null,
          country: null,
          metadataMessage: null,
        },
      })
    return route.fulfill({
      status: 404,
      json: { error: { message: 'Synthetic resource unavailable' } },
    })
  })
}

test.beforeEach(async ({ page }) => {
  await mocks(page)
})

for (const [route, resource, label] of [
  ['/library/music/tracks?item=track-one', '/api/library/music/tracks/track-one', 'Music'],
  [
    '/library/podcasts/archive?item=podcast-one',
    '/api/library/podcasts/episodes/podcast-one',
    'Podcast',
  ],
  ['/library/videos/archive?item=video-one', '/api/library/videos/video-one', 'Video'],
  [
    '/library/videos/channels?channelItem=channel-one',
    '/api/library/video-channels/channel-one',
    'Channel',
  ],
]) {
  test(`${label} tabs retain real panel associations during loading and errors`, async ({
    page,
  }) => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    await page.route(`**${resource}`, async (request) => {
      await gate
      await request.fulfill({
        status: 500,
        json: { error: { message: 'Synthetic detail failure' } },
      })
    })
    await page.goto(route)
    const inspector = page.locator('aside.media-inspector')
    const tabs = inspector.getByRole('tab')
    const associations = () =>
      tabs.evaluateAll((triggers) =>
        triggers.every((trigger) => {
          const panel = document.getElementById(trigger.getAttribute('aria-controls') ?? '')
          return panel?.getAttribute('aria-labelledby') === trigger.id
        }),
      )
    try {
      await expect(
        inspector.getByText('Loading…', { exact: true }).filter({ visible: true }),
      ).toBeVisible()
      expect(await associations()).toBe(true)
      await tabs.first().focus()
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('Enter')
      await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')
      await expect(inspector.locator('[role="tabpanel"]:visible')).toHaveCount(1)
    } finally {
      release()
    }
    await expect(
      inspector.getByText('Request failed (500).').filter({ visible: true }),
    ).toBeVisible({ timeout: 15_000 })
    expect(await associations()).toBe(true)
    await expect(inspector.locator('[role="tabpanel"]:visible')).toHaveCount(1)
  })
}

for (const dark of [false, true]) {
  for (const [media, view, id, title] of [
    ['books', 'archive', 'book-one', book.title],
    ['articles', 'archive', 'article-one', article.title],
    ['music', 'tracks', 'track-one', track.title],
    ['podcasts', 'archive', 'podcast-one', podcast.title],
    ['videos', 'archive', 'video-one', video.title],
    ['videos', 'channels', 'channel-one', channel.title],
  ]) {
    test(`bounded ${media}/${view} inspector and shared type in ${dark ? 'dark' : 'light'}`, async ({
      page,
    }) => {
      await page.addInitScript(
        (dark) => localStorage.setItem('media-tracker:dark', String(dark)),
        dark,
      )
      await page.goto(
        `/library/${media}/${view}?${view === 'channels' ? 'channelItem' : 'item'}=${id}`,
      )
      const inspector = page.locator('aside.book-inspector, aside.media-inspector')
      await expect(inspector.getByRole('heading', { name: title, exact: true })).toBeVisible()
      for (const width of [1280, 1024, 390]) {
        await page.setViewportSize({ width, height: 768 })
        await expect
          .poll(() =>
            inspector.evaluate((el) => {
              const header = el.querySelector<HTMLElement>('.inspector-topbar')!,
                tabs = header.querySelector<HTMLElement>('[role=tablist]')!
              const close = header.querySelector<HTMLElement>(
                'button[aria-label="Close inspector"]',
              )!
              const title = el.querySelector<HTMLElement>('h2')!,
                section = el.querySelector<HTMLElement>('h3')!
              const r = header.getBoundingClientRect(),
                t = tabs.getBoundingClientRect(),
                c = close.getBoundingClientRect()
              return (
                r.height === 54 &&
                t.height <= 54 &&
                Math.abs(c.top + c.height / 2 - (r.top + r.height / 2)) <= 1 &&
                Math.abs(t.bottom - r.bottom) <= 1 &&
                getComputedStyle(title).fontSize === '22px' &&
                getComputedStyle(section).fontSize === '11px' &&
                (!el.querySelector('dt') ||
                  getComputedStyle(el.querySelector('dt')!).fontSize === '12px') &&
                el.scrollWidth <= el.clientWidth + 1
              )
            }),
          )
          .toBe(true)
      }
      const headerTop = (await inspector.locator('.inspector-topbar').boundingBox())!.y
      await inspector.locator('.inspector-scroll:visible').evaluate((el) => {
        el.scrollTop = el.scrollHeight
      })
      expect((await inspector.locator('.inspector-topbar').boundingBox())!.y).toBe(headerTop)
      const firstTab = inspector.getByRole('tab').first()
      await firstTab.press('ArrowRight')
      await inspector.getByRole('tab').nth(1).press('Enter')
      await expect(inspector.getByRole('tab').nth(1)).toHaveAttribute('aria-selected', 'true')
    })
  }
}

test('Book column headings match visible cells in both collections and inspector panes', async ({
  page,
}) => {
  for (const view of ['archive', 'queue']) {
    await page.goto(`/library/books/${view}`)
    const row = page.locator('.book-row').first()
    await expect(row).toBeVisible()
    for (const width of [1280, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 768 })
      await expect
        .poll(() =>
          page.evaluate(() => {
            const head = document.querySelector('.book-list-head')!,
              row = document.querySelector('.book-row')!
            const visible = (el: Element) => el.getBoundingClientRect().width > 0
            return (
              [
                ['.book-head-year', '.book-row-year'],
                ['.book-head-context', '.book-row-context'],
                ['.book-head-rating', '.rating-stars'],
              ].every(([h, c]) => {
                const heading = head.querySelector(h)!,
                  cell = row.querySelector(c)!
                return (
                  visible(heading) === visible(cell) &&
                  (!visible(cell) ||
                    Math.abs(heading.getBoundingClientRect().x - cell.getBoundingClientRect().x) <
                      1)
                )
              }) && row.scrollWidth <= row.clientWidth + 1
            )
          }),
        )
        .toBe(true)
    }
    await page.setViewportSize({ width: 1024, height: 768 })
    await row.click()
    await expect(page.locator('.books-page')).toHaveAttribute('data-inspector-open', 'true')
    await expect.poll(() => row.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  }
})

test('selected Music section stays visible on direct mobile navigation and resize', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 768 })
  await page.goto('/library/music/artists')
  const active = page.getByRole('tab', { name: /^Artists / })
  await expect(active).toHaveAttribute('aria-selected', 'true')
  const visible = () =>
    active.evaluate((el) => {
      const r = el.getBoundingClientRect(),
        v = el.closest('.workspace-header-tabs')!.getBoundingClientRect()
      return r.left >= v.left - 1 && r.right <= v.right + 1
    })
  await expect.poll(visible).toBe(true)
  await page.setViewportSize({ width: 1280, height: 768 })
  await page.setViewportSize({ width: 390, height: 768 })
  await expect.poll(visible).toBe(true)
})

test('Article provenance retains IDs on demand, avoids duplicate actions and explains empty history', async ({
  page,
}) => {
  await page.goto('/library/articles/archive?item=article-one')
  const inspector = page.locator('.article-inspector')
  const toggle = inspector.getByRole('button', { name: 'Reader source details' })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(inspector.getByText('Reader ID: article-one', { exact: true })).toBeHidden()
  await toggle.press('Enter')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(inspector.getByText('Reader ID: article-one', { exact: true })).toBeVisible()
  await expect(inspector.getByRole('link', { name: 'Open in Reader', exact: true })).toHaveCount(1)
  const actions = inspector.locator('.article-source-links a')
  for (const action of await actions.all())
    expect(
      await action.evaluate((el) => {
        const r = el.getBoundingClientRect(),
          icon = el.querySelector('svg')!.getBoundingClientRect()
        return Math.abs(r.y + r.height / 2 - icon.y - icon.height / 2) < 1 && r.height < 24
      }),
    ).toBe(true)
  await inspector.getByRole('tab', { name: 'History', exact: true }).click()
  await expect(inspector.getByText('No archive history.', { exact: true })).toBeVisible()
})

test('common toolbar order and filter field scales agree across media', async ({ page }) => {
  for (const media of ['books', 'movies', 'articles', 'podcasts', 'music', 'videos']) {
    await page.goto(`/library/${media}/${media === 'music' ? 'tracks' : 'archive'}`)
    await expect(page.getByRole('combobox', { name: `Sort ${media}`, exact: true })).toBeVisible()
    expect(
      await page.locator('.books-toolbar').evaluate((el) => {
        const filters = el.querySelector('.toolbar-button')!,
          sort = el.querySelector('.books-sort')!
        return !!(filters.compareDocumentPosition(sort) & Node.DOCUMENT_POSITION_FOLLOWING)
      }),
    ).toBe(true)
    await page.getByRole('button', { name: 'Filters', exact: true }).click()
    const panel = page.locator('.filter-panel')
    await expect(panel).toBeVisible()
    expect(
      await panel
        .locator('[data-slot="select-trigger"], [data-slot="input"], [data-slot="field-label"]')
        .evaluateAll((els) =>
          els
            .filter(
              (e) => e.getBoundingClientRect().width > 1 && getComputedStyle(e).fontSize !== '12px',
            )
            .map((e) => ({
              tag: e.tagName,
              text: e.textContent,
              font: getComputedStyle(e).fontSize,
            })),
        ),
      media,
    ).toEqual([])
  }
})

test('Album grid wraps long identity text and keeps the concise playback summary readable', async ({
  page,
}) => {
  const title = 'An Album With A Long Name That Should Remain Readable In The Grid'
  await page.route('**/api/library/music?*', (r) =>
    r.fulfill({
      json: musicResponse([
        { ...track, kind: 'album', title, subtitle: 'An Artist With A Long Name', trackCount: 12 },
      ]),
    }),
  )
  await page.goto('/library/music/albums?layout=grid')
  const card = page.getByRole('button', { name: new RegExp(title) })
  await expect(card).toBeVisible()
  for (const width of [1280, 1024, 390]) {
    await page.setViewportSize({ width, height: 768 })
    expect(
      await card
        .locator('.spotify-result-copy strong, .music-grid-summary')
        .evaluateAll((els) =>
          els.every(
            (e) =>
              e.scrollWidth <= e.clientWidth + 1 && getComputedStyle(e).whiteSpace === 'normal',
          ),
        ),
    ).toBe(true)
  }
  await expect(card.locator('.music-grid-summary')).toContainText('4 observations · 10 min')
})
