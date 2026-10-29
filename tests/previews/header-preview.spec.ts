import { expect, test } from '@playwright/test'

for (const theme of ['dark', 'light']) {
  test(`collection controls remain usable after scrolling in ${theme} appearance`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    const requests: string[] = []
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url())
    })
    await page.goto('/header-preview.html')
    if (theme === 'light') await page.getByRole('button', { name: 'Use light appearance' }).click()
    const search = page.getByRole('textbox', { name: 'Search books' })
    const top = (await search.boundingBox())!.y
    const results = page.locator('[data-ui="preview-results-scroll"]')
    await results.hover()
    await page.mouse.wheel(0, 650)
    await expect.poll(() => results.evaluate((element) => element.scrollTop)).toBeGreaterThan(300)
    expect((await search.boundingBox())!.y).toBe(top)
    await page.getByRole('button', { name: 'Filters', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Filter books' })
    await expect(dialog).toBeVisible()
    await page.getByText('Fiction', { exact: true }).click()
    await expect(page.getByRole('checkbox', { name: 'Fiction', exact: true })).toBeChecked()
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Filters, 1 active' })).toBeFocused()
    await expect(page.getByRole('button', { name: 'Remove Fiction filter' })).toBeInViewport()
    await page.getByRole('button', { name: 'Remove Fiction filter' }).click()
    await search.fill('Piranesi')
    await expect(page.getByRole('status')).toHaveText('1 of 16 books')
    await page.getByRole('button', { name: 'Clear search' }).click()
    await page.getByRole('combobox', { name: 'Header behavior' }).click()
    await page.getByRole('option', { name: 'Current · scrolls away' }).click()
    await results.hover()
    await page.mouse.wheel(0, 650)
    await expect.poll(() => results.evaluate((element) => element.scrollTop)).toBeGreaterThan(300)
    await expect(search).not.toBeInViewport()
    await expect(page.getByRole('tab', { name: 'Archive 16' })).toBeInViewport()
    expect(requests).toEqual([])
  })
}

test('inspector wrapping, popup bounds, and narrow keyboard navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/header-preview.html')
  const row = page.getByRole('button', { name: 'Open The Creative Act', exact: true })
  await row.click()
  await expect(page.getByRole('button', { name: 'Close inspector' })).toBeFocused()
  const controls = await page
    .locator(
      '[data-ui="preview-toolbar"] [data-slot="input-group"], [data-ui="preview-toolbar"] [data-slot="button"], [data-ui="preview-toolbar"] [data-slot="select-trigger"]',
    )
    .evaluateAll((elements) =>
      elements.map((element) => ({
        height: element.getBoundingClientRect().height,
        right: element.getBoundingClientRect().right,
      })),
    )
  for (const control of controls) {
    expect(control.height).toBe(32)
    expect(control.right).toBeLessThanOrEqual(920)
  }
  await page.keyboard.press('Escape')
  await expect(row).toBeFocused()
  await page.setViewportSize({ width: 400, height: 740 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(400)
  await page.getByRole('combobox', { name: 'Sort books' }).click()
  const popup = page.getByRole('listbox')
  await expect(popup).toBeVisible()
  const bounds = (await popup.boundingBox())!
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(400)
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: 'Archive 16' }).focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('tab', { name: 'Queue 8' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tabpanel', { name: 'Queue 8' })).toBeVisible()
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Header behavior' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused()
})
