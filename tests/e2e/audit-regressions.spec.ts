import { expect, test, type Route } from '@playwright/test'
import { installDefaultApiMocks } from './default-api-mocks'
import {
  book,
  booksResponse,
  musicResponse,
  podcastsResponse,
  video,
  videosResponse,
} from './ui-fixtures'

const videoDetail = {
  ...video,
  description: 'Synthetic video details.',
  categoryId: null,
  categoryTitle: null,
  captionAvailable: null,
  definition: null,
  projection: null,
  catalogCheckedAt: null,
  historyCount: 2,
  queueRelationships: [],
  metadataMessage: null,
}
const channel = {
  ...video,
  id: 'channel-one',
  kind: 'channel' as const,
  title: 'A Distant Channel',
}
const channelDetail = {
  ...channel,
  description: 'Synthetic channel details.',
  customUrl: null,
  catalogCheckedAt: null,
  country: null,
  metadataMessage: null,
}

test.beforeEach(async ({ page }) => {
  await installDefaultApiMocks(page)
  await page.route('**/api/library/videos{,/summary}?*', (route) => {
    const view = new URL(route.request().url()).searchParams.get('section')
    return route.fulfill({ json: videosResponse(view === 'channels' ? [channel] : [video]) })
  })
  await page.route('**/api/library/videos/video-one', (route) =>
    route.fulfill({ json: videoDetail }),
  )
  await page.route('**/api/library/video-channels/channel-one', (route) =>
    route.fulfill({ json: channelDetail }),
  )
})

for (const method of ['getItem', 'setItem'] as const) {
  test(`browses and changes preferences when localStorage ${method} throws`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.addInitScript((method) => {
      Storage.prototype[method] = () => {
        throw new DOMException('Synthetic blocked storage', 'SecurityError')
      }
    }, method)
    await page.goto('/library/books/archive')
    await expect(page.locator('[data-collection-item]').first()).toBeVisible()
    await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Expand sidebar', exact: true })).toBeVisible()
    const appearance = page.getByRole('button', { name: /Use (light|dark) appearance/ })
    const before = await appearance.getAttribute('aria-label')
    await appearance.click()
    await expect(appearance).not.toHaveAttribute('aria-label', before!)
    await page.getByRole('link', { name: 'Videos', exact: true }).click()
    await expect(page.locator('[data-collection-item="video-one"]')).toBeVisible()
    expect(errors).toEqual([])
  })
}

for (const { view, resource, inspector, selection } of [
  {
    view: 'archive',
    resource: '/api/library/videos/video-one',
    inspector: 'Video inspector',
    selection: 'item=video-one',
  },
  {
    view: 'channels',
    resource: '/api/library/video-channels/channel-one',
    inspector: 'Channel inspector',
    selection: 'channelItem=channel-one',
  },
]) {
  test(`${inspector} focuses while loading, dismisses with Escape, and returns focus`, async ({
    page,
  }) => {
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 800 })
      let release!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const delay = async (route: Route) => {
        await gate
        await route.fallback()
      }
      await page.route(`**${resource}`, delay)
      await page.goto(`/library/videos/${view}`)
      const opener = page.locator('[data-collection-item]').first()
      await opener.click()
      const panel = page.getByRole('complementary', { name: inspector, exact: true })
      const close = panel.getByRole('button', { name: 'Close inspector', exact: true })
      try {
        await expect(close).toBeFocused()
        await expect(
          panel.getByText('Loading…', { exact: true }).filter({ visible: true }),
        ).toBeVisible()
      } finally {
        release()
      }
      await expect(panel.getByText(/Synthetic .* details\./)).toBeVisible()
      if (width === 390) {
        const first = panel.getByRole('tab', { name: 'Details', exact: true })
        await first.focus()
        await first.press('Shift+Tab')
        await expect
          .poll(() => panel.evaluate((element) => element.contains(document.activeElement)))
          .toBe(true)
        await page.keyboard.press('Tab')
        await expect(first).toBeFocused()
      }
      await close.press('Escape')
      await expect(panel).toHaveCount(0)
      await expect(opener).toBeFocused()
      await page.unroute(`**${resource}`, delay)
      // Direct links have no opener; dismissal returns to the collection heading.
      await page.goto(`/library/videos/${view}?${selection}`)
      await expect(close).toBeFocused()
      await close.click()
      await expect(panel).toHaveCount(0)
      await expect(page.getByRole('heading', { name: 'Videos', exact: true })).toBeFocused()
    }
  })

  test(`${inspector} retains keyboard dismissal when the detail request fails`, async ({
    page,
  }) => {
    await page.route(`**${resource}`, (route) =>
      route.fulfill({ status: 500, json: { error: { message: 'Synthetic failure' } } }),
    )
    await page.goto(`/library/videos/${view}?${selection}`)
    const panel = page.getByRole('complementary', { name: inspector, exact: true })
    const close = panel.getByRole('button', { name: 'Close inspector', exact: true })
    await expect(close).toBeFocused()
    await expect(panel.getByText('Request failed (500).').filter({ visible: true })).toBeVisible({
      timeout: 15000,
    })
    await close.press('Escape')
    await expect(panel).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Videos', exact: true })).toBeFocused()
  })
}

test('Video watch history exposes loading, failure, retry, and empty results', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let failed = true
  await page.route('**/api/library/videos/video-one/history?*', async (route) => {
    await gate
    return route.fulfill(
      failed
        ? { status: 500, json: { error: { message: 'Synthetic history failure' } } }
        : { json: { data: [], nextCursor: null, totalCount: 0 } },
    )
  })
  await page.goto('/library/videos/archive?item=video-one')
  await page.getByRole('tab', { name: 'Watch history', exact: true }).click()
  try {
    await expect(page.getByText('Loading watch history…')).toBeVisible()
  } finally {
    release()
  }
  await expect(page.getByText('Watch history could not be loaded.')).toBeVisible({ timeout: 15000 })
  await expect(page.getByText('No supported watches.', { exact: true })).toHaveCount(0)
  failed = false
  await page
    .getByRole('button', { name: 'Try again', exact: true })
    .filter({ visible: true })
    .click()
  await expect(page.getByText('No supported watches.', { exact: true })).toBeVisible()
})

test('Channel previews distinguish request failure from no videos and retry in place', async ({
  page,
}) => {
  let failed = true
  await page.route('**/api/library/video-channels/channel-one/videos?*', (route) =>
    route.fulfill(
      failed
        ? { status: 500, json: { error: { message: 'Synthetic preview failure' } } }
        : { json: { data: [], nextCursor: null, totalCount: 0 } },
    ),
  )
  await page.goto('/library/videos/archive?item=video-one')
  await page.getByRole('tab', { name: 'Channel', exact: true }).click()
  await expect(page.getByText('Recently watched videos could not be loaded.')).toBeVisible({
    timeout: 15000,
  })
  await expect(page.getByText('None in this channel.', { exact: true })).toHaveCount(0)
  failed = false
  await page
    .getByRole('button', { name: 'Try again', exact: true })
    .filter({ visible: true })
    .first()
    .click()
  await expect(page.getByText('None in this channel.', { exact: true })).toHaveCount(1)
  await page
    .getByRole('button', { name: 'Try again', exact: true })
    .filter({ visible: true })
    .click()
  await expect(page.getByText('None in this channel.', { exact: true })).toHaveCount(2)
})

test('Video history retains loaded occurrences and retries only the failed next page', async ({
  page,
}) => {
  const cursors: (string | null)[] = []
  let failed = true
  const occurrence = {
    id: 'watch-one',
    occurredAt: '2026-09-12T10:00:00.000Z',
    connectionLabel: 'First account',
    historicalTitle: null,
    historicalChannelTitle: null,
    product: 'youtube',
    sourceUrl: null,
  }
  await page.route('**/api/library/videos/video-one/history?*', (route) => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor')
    cursors.push(cursor)
    if (cursor && failed)
      return route.fulfill({
        status: 500,
        json: { error: { message: 'Synthetic next-page failure' } },
      })
    return route.fulfill({
      json: {
        data: [
          cursor
            ? { ...occurrence, id: 'watch-two', connectionLabel: 'Second account' }
            : occurrence,
        ],
        nextCursor: cursor ? null : 'next-watch',
        totalCount: 2,
      },
    })
  })
  await page.goto('/library/videos/archive?item=video-one')
  await page.getByRole('tab', { name: 'Watch history', exact: true }).click()
  await expect(page.getByText('First account', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Load more history', exact: true }).click()
  await expect(page.getByText('Watch history could not be loaded.')).toBeVisible({ timeout: 15000 })
  await expect(page.getByText('First account', { exact: true })).toBeVisible()
  failed = false
  await page
    .getByRole('button', { name: 'Try again', exact: true })
    .filter({ visible: true })
    .click()
  await expect(page.getByText('Second account', { exact: true })).toBeVisible()
  await expect(page.getByText('First account', { exact: true })).toHaveCount(1)
  expect(cursors.filter((cursor) => cursor === null)).toHaveLength(1)
  expect(
    cursors.filter((cursor) => cursor !== null).every((cursor) => cursor === 'next-watch'),
  ).toBe(true)
})

test('Channel Library tabs have independent panels, lazy requests, and retained membership data', async ({
  page,
}) => {
  const requests: string[] = []
  await page.route('**/api/library/video-channels/channel-one/videos?*', (route) => {
    const membership = new URL(route.request().url()).searchParams.get('section')!
    requests.push(membership)
    return route.fulfill({
      json: {
        data: [{ ...video, title: `${membership} result` }],
        nextCursor: null,
        totalCount: 1,
      },
    })
  })
  await page.goto('/library/videos/channels?channelItem=channel-one')
  const inspector = page.getByRole('complementary', { name: 'Channel inspector', exact: true })
  await expect(inspector.getByText('Synthetic channel details.')).toBeVisible()
  expect(requests).toEqual([])
  await inspector.getByRole('tab', { name: 'Library', exact: true }).click()
  await expect(inspector.getByText('archive result', { exact: true })).toBeVisible()
  for (const name of ['Archive', 'Queue']) {
    const trigger = inspector.getByRole('tab', { name, exact: true })
    const panel = page.locator(`[id="${await trigger.getAttribute('aria-controls')}"]`)
    await expect(panel).toHaveAttribute('role', 'tabpanel')
    await expect(panel).toHaveAttribute('aria-labelledby', await trigger.getAttribute('id'))
  }
  expect(requests).toEqual(['archive'])
  await inspector.getByRole('tab', { name: 'Queue', exact: true }).click()
  await expect(inspector.getByText('queue result', { exact: true })).toBeVisible()
  await expect(inspector.getByText('archive result', { exact: true })).toBeHidden()
  await inspector.getByRole('tab', { name: 'Archive', exact: true }).click()
  await expect(inspector.getByText('archive result', { exact: true })).toBeVisible()
  expect(requests).toEqual(['archive', 'queue'])
})

for (const { media, section, response, title } of [
  { media: 'music', section: 'tracks', response: musicResponse, title: 'No matching tracks' },
  {
    media: 'podcasts',
    section: 'archive',
    response: podcastsResponse,
    title: 'No matching episodes',
  },
  { media: 'videos', section: 'archive', response: videosResponse, title: 'No matching videos' },
  { media: 'videos', section: 'channels', response: videosResponse, title: 'No matching channels' },
]) {
  test(`${media}/${section} filtered emptiness clears search without claiming imports are missing`, async ({
    page,
  }) => {
    await page.route(`**/api/library/${media}{,/summary}?*`, (route) => {
      const filtered = new URL(route.request().url()).searchParams.has('q')
      return route.fulfill({ json: filtered ? { ...response([]), totalCount: 10 } : response() })
    })
    await page.goto(`/library/${media}/${section}?q=unmatched&sort=title`)
    const empty = page.locator('[data-ui~=collection-empty-state]')
    await expect(empty.getByRole('heading', { name: title, exact: true })).toBeVisible()
    await expect(empty.getByRole('link', { name: 'Open Connections' })).toHaveCount(0)
    await empty.getByRole('button', { name: 'Clear search and filters', exact: true }).click()
    await expect(page).not.toHaveURL(/[?&]q=/)
    await expect(page.locator('[data-collection-item]').first()).toBeVisible()
  })
}

for (const success of [true, false]) {
  test(`a ${success ? 'completed' : 'failed'} resumed import cannot restore a stale prefetch`, async ({
    page,
  }) => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let requests = 0
    let resumed = false
    await page.route('**/api/connections', (route) =>
      route.fulfill({
        json: {
          data: [
            {
              source: 'youtube',
              id: 'synthetic-youtube',
              label: 'Synthetic account',
              status: 'connected',
              coverage: 'partial',
              lastSuccessfulSyncAt: null,
              lastAttemptedSyncAt: null,
              lastExportAt: null,
              incompleteImports: [
                { importId: 'pending-import', status: 'failed', nextOffset: 1, totalRecords: 2 },
              ],
            },
          ],
        },
      }),
    )
    await page.route('**/api/library/books?*', async (route) => {
      const query = new URL(route.request().url()).searchParams
      if (query.get('section') !== 'archive') return route.fulfill({ json: booksResponse() })
      requests++
      if (requests === 1) {
        await gate
        return route.fulfill({ json: booksResponse([{ ...book, title: 'Stale pre-import book' }]) })
      }
      return route.fulfill({ json: booksResponse([{ ...book, title: 'Fresh imported book' }]) })
    })
    await page.route('**/api/connections/youtube/import/pending-import/continue?*', (route) => {
      resumed = true
      return route.fulfill(
        success
          ? {
              json: {
                syncRunId: 'synthetic-run',
                importId: 'pending-import',
                alreadyImported: false,
                completed: true,
                nextOffset: null,
                totalRecords: 2,
                activityCards: 2,
                videos: 1,
                archiveEntries: 1,
                sourceRecords: 1,
                unresolvedRecords: 0,
                ignoredRecords: 0,
                watchLaterRecords: 0,
                queueEntries: 0,
                subscriptionRecords: 0,
                channels: 0,
                components: [],
              },
            }
          : { status: 500, json: { error: { message: 'Synthetic import failure' } } },
      )
    })
    await page.goto('/connections')
    try {
      await expect.poll(() => requests).toBe(1)
      const resume = page.getByRole('button', { name: 'Resume import', exact: true })
      await resume.click()
      await expect.poll(() => resumed).toBe(true)
      await expect(resume).toBeEnabled()
    } finally {
      release()
    }
    await page.getByRole('link', { name: 'Books', exact: true }).click()
    await expect(page.locator('[data-collection-item]').first()).toContainText(
      'Fresh imported book',
    )
    await expect(page.getByText('Stale pre-import book')).toHaveCount(0)
    expect(requests).toBeGreaterThan(1)
  })
}
