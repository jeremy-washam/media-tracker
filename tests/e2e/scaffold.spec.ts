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
  await expect(page.getByRole('heading', { name: 'YouTube' })).toBeVisible()
})
