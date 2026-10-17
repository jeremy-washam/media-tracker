import { expect, test, type Page } from '@playwright/test'
import {
  book,
  booksResponse,
  moviesResponse,
  movie,
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
const movieDetail = {
  ...movie,
  personal: { ...movie.personal, reviewedOccurrenceCount: 1 },
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
    letterboxdUrl: 'https://letterboxd.com/film/a-distant-movie/',
    tmdbUrl: null,
    imdbUrl: null,
    connectionLabel: 'Letterboxd',
    coverage: 'complete',
    lastCompleteExportAt: '2026-09-12T10:00:00.000Z',
    lastRssSuccessAt: '2026-09-20T10:00:00.000Z',
    metadataStatus: 'not_configured',
  },
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
        path === '/api/library/videos' && url.searchParams.get('section') === 'channels'
          ? [channel]
          : [video],
      ),
    }
    for (const [media, json] of Object.entries(collections)) {
      if (path === `/api/library/${media}` || path === `/api/library/${media}/summary`)
        return route.fulfill({ json })
    }
    if (path === '/api/library/movies/movie-one') return route.fulfill({ json: movieDetail })
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
    const inspector = page.locator('aside[data-ui~="media-inspector"]')
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
    ['movies', 'archive', 'movie-one', movie.displayTitle],
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
      const inspector = page.locator(
        'aside[data-ui~="book-inspector"], aside[data-ui~="media-inspector"]',
      )
      await expect(inspector.getByRole('heading', { name: title, exact: true })).toBeVisible()
      for (const width of [1280, 1024, 390]) {
        await page.setViewportSize({ width, height: 768 })
        await expect
          .poll(() =>
            inspector.evaluate((el) => {
              const header = el.querySelector<HTMLElement>('[data-ui~="inspector-header"]')!,
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
      const headerTop = (await inspector.locator('[data-ui~="inspector-header"]').boundingBox())!.y
      await inspector.locator('[data-ui~="inspector-scroll"]:visible').evaluate((el) => {
        el.scrollTop = el.scrollHeight
      })
      expect((await inspector.locator('[data-ui~="inspector-header"]').boundingBox())!.y).toBe(
        headerTop,
      )
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
    const row = page.locator('[data-ui~="book-row"]').first()
    await expect(row).toBeVisible()
    for (const width of [1280, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 768 })
      await expect
        .poll(() =>
          page.evaluate(() => {
            const head = document.querySelector('[data-ui~="collection-column-headings"]')!,
              row = document.querySelector('[data-ui~="book-row"]')!
            const visible = (el: Element) => el.getBoundingClientRect().width > 0
            return (
              [
                ['[data-ui~="book-head-year"]', '[data-ui~="book-row-year"]'],
                ['[data-ui~="book-head-context"]', '[data-ui~="book-row-context"]'],
                ['[data-ui~="book-head-rating"]', '[data-ui~="rating-stars"]'],
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
    await expect(page.locator('[data-ui~="library-workspace"]')).toHaveAttribute(
      'data-inspector-open',
      'true',
    )
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
        v = el.closest('[data-ui~="workspace-tabs"]')!.getBoundingClientRect()
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
  const inspector = page.locator('[data-ui~="article-inspector"]')
  const toggle = inspector.getByRole('button', { name: 'Reader source details' })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(inspector.getByText('Reader ID: article-one', { exact: true })).toBeHidden()
  await toggle.press('Enter')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(inspector.getByText('Reader ID: article-one', { exact: true })).toBeVisible()
  await expect(inspector.getByRole('link', { name: 'Open in Reader', exact: true })).toHaveCount(1)
  const actions = inspector.locator('[data-ui~="article-source-links"] a')
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
      await page.locator('[data-ui~="library-toolbar"]').evaluate((el) => {
        const filters = el.querySelector('[data-ui~="toolbar-button"]')!,
          sort = el.querySelector('[data-ui~="library-sort"]')!
        return !!(filters.compareDocumentPosition(sort) & Node.DOCUMENT_POSITION_FOLLOWING)
      }),
    ).toBe(true)
    await page.getByRole('button', { name: 'Filters', exact: true }).click()
    const panel = page.locator('[data-ui~="filter-panel"]')
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
        .locator('[data-ui~="media-item-copy"] strong, [data-ui~="music-grid-summary"]')
        .evaluateAll((els) =>
          els.every(
            (e) =>
              e.scrollWidth <= e.clientWidth + 1 && getComputedStyle(e).whiteSpace === 'normal',
          ),
        ),
    ).toBe(true)
  }
  await expect(card.locator('[data-ui~="music-grid-summary"]')).toContainText(
    '4 observations · 10 min',
  )
})

for (const [media, id] of [
  ['books', 'book-one'],
  ['movies', 'movie-one'],
  ['articles', 'article-one'],
]) {
  test(`focuses the close action while loading the ${media} inspector and returns to its opener`, async ({
    page,
  }) => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route(`**/api/library/${media}/${id}`, async (route) => {
      await pending
      await route.fallback()
    })
    await page.goto(`/library/${media}/archive`)
    const opener = page.locator('[data-collection-item]').first()
    await opener.click()
    const close = page.getByRole('button', { name: 'Close inspector', exact: true })
    try {
      await expect(close).toBeFocused()
    } finally {
      release()
    }
    await expect(page.getByRole('tab', { name: 'Details', exact: true })).toBeVisible()
    await expect(close).toBeFocused()
    await close.press('Escape')
    await expect(close).toHaveCount(0)
    await expect(opener).toBeFocused()
  })
}

for (const dark of [false, true]) {
  test(`retains compact control type and selected navigation hover in ${dark ? 'dark' : 'light'}`, async ({
    page,
  }) => {
    await page.addInitScript(
      (dark) => localStorage.setItem('media-tracker:dark', String(dark)),
      dark,
    )
    await page.goto('/library/books/archive')
    const nav = page.getByRole('link', { name: 'Books', exact: true })
    const before = await nav.evaluate((e) => getComputedStyle(e).backgroundColor)
    expect(before).not.toBe('rgba(0, 0, 0, 0)')
    await nav.hover()
    await expect.poll(() => nav.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(before)
    const toolbar = page.locator('[data-ui~="library-toolbar"]')
    for (const control of await toolbar
      .locator('[data-ui~="toolbar-button"], [data-slot="select-trigger"]')
      .all()) {
      expect(await control.evaluate((e) => getComputedStyle(e).fontSize)).toBe('11px')
    }
    expect(await toolbar.getByRole('textbox').evaluate((e) => getComputedStyle(e).fontSize)).toBe(
      '12px',
    )
    for (const action of ['Chat — not available yet', 'Recaps — not available yet']) {
      expect(
        (await page.getByRole('button', { name: action, exact: true }).boundingBox())!.height,
      ).toBe(38)
      await expect(
        page.getByRole('button', { name: action, exact: true }).locator('svg'),
      ).toHaveCSS('width', '17px')
    }
  })
}

// Empty collections must share the same primitive and geometry across every section.
for (const dark of [false, true]) {
  for (const [media, views, response] of [
    ['books', ['archive', 'queue'], booksResponse([])],
    ['movies', ['archive', 'queue'], moviesResponse([])],
    ['articles', ['archive', 'queue', 'feed'], articlesResponse([])],
    ['podcasts', ['archive', 'queue', 'following'], podcastsResponse([])],
    ['music', ['tracks', 'albums', 'artists'], musicResponse([])],
    ['videos', ['archive', 'queue', 'channels'], videosResponse([])],
  ] as const) {
    for (const view of views) {
      test(`shared empty state ${media}/${view} in ${dark ? 'dark' : 'light'}`, async ({
        page,
      }) => {
        await page.addInitScript(
          (dark) => localStorage.setItem('media-tracker:dark', String(dark)),
          dark,
        )
        await page.route(`**/api/library/${media}*`, (route) => {
          if (new URL(route.request().url()).pathname === `/api/library/${media}`)
            return route.fulfill({ json: response })
          return route.fallback()
        })
        await page.goto(`/library/${media}/${view}`)
        const state = page.locator('[data-ui~="collection-empty-state"]')
        const action = state.locator('a[data-slot="button"]')
        await expect(action).toHaveText('Open Connections')
        await expect(action).toHaveCSS('font-size', '14px')
        await expect(action).toHaveCSS('font-weight', '500')
        await expect(action).toHaveAttribute('href', '/connections')
        for (const width of [1280, 390]) {
          await page.setViewportSize({ width, height: 844 })
          await expect(action).toBeVisible()
          const geometry = await action.evaluate((element) => {
            const box = element.getBoundingClientRect()
            const range = document.createRange()
            range.selectNodeContents(element)
            const text = range.getBoundingClientRect()
            const state = element
              .closest('[data-ui~="collection-empty-state"]')!
              .getBoundingClientRect()
            return {
              height: box.height,
              textCenterOffset: Math.abs((text.top + text.bottom - box.top - box.bottom) / 2),
              centerOffset: Math.abs((box.left + box.right - state.left - state.right) / 2),
              cursor: getComputedStyle(element).cursor,
              color: getComputedStyle(element).color,
              headingColor: getComputedStyle(
                element.closest('[data-ui~="collection-empty-state"]')!.querySelector('h2')!,
              ).color,
              left: box.left,
              right: box.right,
            }
          })
          expect(geometry.height).toBe(32)
          expect(geometry.textCenterOffset).toBeLessThanOrEqual(2)
          expect(geometry.centerOffset).toBeLessThanOrEqual(1)
          expect(geometry.cursor).toBe('default')
          expect(geometry.color).toBe(geometry.headingColor)
          expect(geometry.left).toBeGreaterThanOrEqual(0)
          expect(geometry.right).toBeLessThanOrEqual(width)
        }
        await action.focus()
        await expect(action).toBeFocused()
        await page.keyboard.press('Enter')
        await expect(page).toHaveURL(/\/connections$/)
      })
    }
  }
}

for (const [media, response, label] of [
  ['books', booksResponse, 'Clear search and facets'],
  ['movies', moviesResponse, 'Clear search and filters'],
  ['articles', articlesResponse, 'Clear search and filters'],
] as const) {
  test(`shared ${media} empty state preserves filter clearing`, async ({ page }) => {
    await page.route(`**/api/library/${media}*`, (route) => {
      const url = new URL(route.request().url())
      if (url.pathname === `/api/library/${media}`)
        return route.fulfill({ json: url.searchParams.get('q') ? response([]) : response() })
      return route.fallback()
    })
    await page.goto(`/library/${media}/archive?q=missing&sort=title&direction=asc`)
    const state = page.locator('[data-ui~="collection-empty-state"]')
    await expect(state.getByRole('heading')).toHaveText(`No matching ${media}`)
    const action = state.getByRole('button', { name: label })
    await expect(action).toHaveCSS('cursor', 'default')
    await expect(action).toHaveCSS('height', '32px')
    await action.focus()
    await page.keyboard.press('Enter')
    await expect(state).toHaveCount(0)
    expect(new URL(page.url()).searchParams.has('q')).toBe(false)
    expect(new URL(page.url()).searchParams.get('sort')).toBe('title')
  })
}
