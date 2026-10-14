import { expect, test, type Page } from '@playwright/test'
import { installDefaultApiMocks } from './default-api-mocks'

const connections = ['readwise', 'hardcover', 'letterboxd', 'spotify', 'youtube'].map(
  (source, index) => ({
    source,
    id: `synthetic-${source}`,
    label:
      source === 'youtube'
        ? 'A very long account label that should wrap on a narrow screen without hiding any actions'
        : source,
    status: ['connected', 'disconnected', 'degraded', 'reauthorization_required', 'connected'][
      index
    ],
    coverage: index === 1 ? null : 'partial',
    lastSuccessfulSyncAt: index === 1 ? null : '2026-10-12T12:00:00.000Z',
    lastAttemptedSyncAt: '2026-10-13T12:00:00.000Z',
    lastExportAt: source === 'youtube' ? '2026-10-12T12:00:00.000Z' : null,
    incompleteImports:
      source === 'youtube'
        ? [{ importId: 'synthetic-import', status: 'failed', nextOffset: 12, totalRecords: 30 }]
        : [],
  }),
)

async function mocks(page: Page) {
  await installDefaultApiMocks(page)
  await page.route('**/api/connections', (route) => route.fulfill({ json: { data: connections } }))
  await page.route('**/api/sync-runs*', (route) =>
    route.fulfill({ json: { data: [], nextCursor: null } }),
  )
}

test.beforeEach(async ({ page }) => {
  await mocks(page)
})

for (const dark of [false, true]) {
  test(`compact Connections rows and status cues in ${dark ? 'dark' : 'light'}`, async ({
    page,
  }) => {
    await page.addInitScript(
      (dark) => localStorage.setItem('media-tracker:dark', String(dark)),
      dark,
    )
    await page.goto('/connections')
    const region = page.getByRole('region', { name: 'Connections', exact: true })
    await expect(region.getByRole('heading', { name: 'Connections', exact: true })).toHaveCount(0)
    await expect(region.getByText('Source coverage', { exact: true })).toHaveCount(0)
    await expect(region.locator('[data-source]')).toHaveCount(5)
    for (const [source, status] of [
      ['readwise', 'Connected'],
      ['hardcover', 'Disconnected'],
      ['letterboxd', 'Needs attention'],
      ['spotify', 'Sign-in required'],
    ]) {
      await expect(
        region.locator(`[data-source=${source}]`).getByText(status, { exact: true }),
      ).toBeVisible()
    }
    const green = region.locator('[data-source=readwise]').getByText('Connected', { exact: true })
    await expect(green).toHaveCSS('color', dark ? 'rgb(74, 222, 128)' : 'rgb(21, 128, 61)')
    const red = await region
      .locator('[data-source=hardcover]')
      .getByText('Disconnected', { exact: true })
      .evaluate((el) => getComputedStyle(el).color)
    expect(red).not.toBe(await green.evaluate((el) => getComputedStyle(el).color))
    await expect
      .poll(() =>
        region
          .locator('[data-source] img')
          .evaluateAll((images) =>
            images.every(
              (image) =>
                (image as HTMLImageElement).complete &&
                (image as HTMLImageElement).naturalWidth > 0,
            ),
          ),
      )
      .toBe(true)
    for (const width of [1280, 1024, 390, 320]) {
      await page.setViewportSize({ width, height: 844 })
      const geometry = await region.evaluate((el) => ({
        contained: el.scrollWidth <= el.clientWidth,
        controls: [...el.querySelectorAll('article[data-source] [data-slot="button"]')]
          .filter((control) => control.getClientRects().length)
          .map((control) => {
            const rect = control.getBoundingClientRect(),
              style = getComputedStyle(control)
            return {
              height: rect.height,
              font: style.fontSize,
              weight: style.fontWeight,
              cursor: style.cursor,
              left: rect.left,
              right: rect.right,
            }
          }),
      }))
      expect(geometry.contained).toBe(true)
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(844)
      for (const control of geometry.controls) {
        expect(control.height).toBe(28)
        expect(control.font).toBe('12.8px')
        expect(control.weight).toBe('500')
        expect(control.cursor).toBe('default')
        expect(control.left).toBeGreaterThanOrEqual(0)
        expect(control.right).toBeLessThanOrEqual(width)
      }
      const input = region.getByRole('textbox', { name: 'YouTube account label' })
      const upload = region.getByRole('button', { name: 'Import a new YouTube account' })
      expect((await input.boundingBox())!.height).toBe((await upload.boundingBox())!.height)
    }
    const reader = region.locator('[data-source=readwise]')
    const details = reader.getByRole('button', { name: 'Details', exact: true })
    await details.focus()
    await page.keyboard.press('Enter')
    await expect(details).toHaveAttribute('aria-expanded', 'true')
    await expect(reader.getByText(/Removed documents retain their evidence/)).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(details).toHaveAttribute('aria-expanded', 'false')
    await expect(details).toBeFocused()
    await expect(region.getByText('Import failed: 12 / 30 records committed.')).toBeVisible()
    await expect(region.getByRole('button', { name: 'Resume import' })).toBeVisible()
  })
}

test('existing YouTube import and Resume retain the account lineage', async ({ page }) => {
  let importUrl = '',
    resumeUrl = ''
  const response = {
    syncRunId: 'synthetic-run',
    importId: 'synthetic-import',
    alreadyImported: false,
    completed: true,
    nextOffset: null,
    totalRecords: 0,
    activityCards: 0,
    videos: 0,
    archiveEntries: 0,
    sourceRecords: 0,
    unresolvedRecords: 0,
    ignoredRecords: 0,
    watchLaterRecords: 0,
    queueEntries: 0,
    subscriptionRecords: 0,
    channels: 0,
    components: [],
  }
  await page.route('**/api/connections/youtube/import?*', (route) => {
    importUrl = route.request().url()
    return route.fulfill({ json: response })
  })
  await page.route('**/api/connections/youtube/import/synthetic-import/continue?*', (route) => {
    resumeUrl = route.request().url()
    return route.fulfill({ json: response })
  })
  await page.goto('/connections')
  const youtube = page.locator('[data-source=youtube]')
  await expect(youtube.getByRole('button', { name: 'Import Takeout' })).toBeEnabled()
  const chooserPromise = page.waitForEvent('filechooser')
  await youtube.getByRole('button', { name: 'Import Takeout' }).click()
  await (
    await chooserPromise
  ).setFiles({
    name: 'synthetic.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('synthetic fixture'),
  })
  await expect.poll(() => importUrl).toContain('connectionId=synthetic-youtube')
  await youtube.getByRole('button', { name: 'Resume import' }).click()
  await expect.poll(() => resumeUrl).toContain('connectionId=synthetic-youtube')
  await expect(youtube.getByRole('button', { name: 'Resume import' })).toBeEnabled()
})

test('new account upload requires a nonempty label and preserves chooser behavior', async ({
  page,
}) => {
  await page.goto('/connections')
  const upload = page.getByRole('button', { name: 'Import a new YouTube account' })
  await expect(upload).toBeDisabled()
  const input = page.getByRole('textbox', { name: 'YouTube account label' })
  await input.fill('  ')
  await expect(upload).toBeDisabled()
  await input.fill('Synthetic second account')
  await expect(upload).toBeEnabled()
  const chooserPromise = page.waitForEvent('filechooser')
  await upload.focus()
  await page.keyboard.press('Enter')
  expect((await chooserPromise).isMultiple()).toBe(false)
})
