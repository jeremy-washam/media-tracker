import { test, expect } from '@playwright/test'
import {
  createWorkerRuntime,
  type WorkerRuntime,
  runtimeBookTitle,
} from '../support/worker-runtime'
import { syntheticChatProvider } from '../support/chat-provider'
let runtime: WorkerRuntime
test.beforeAll(async () => {
  runtime = await createWorkerRuntime({ chat: true, chatProvider: syntheticChatProvider })
})
test.afterAll(async () => {
  await runtime?.dispose()
})
test.beforeEach(async ({ page }) => {
  await page.route('https://**/*', (route) => route.abort())
})
for (const dark of [false, true]) {
  test(`creates, reloads, renames, favorites and deletes a saved chat in ${dark ? 'dark' : 'light'} appearance`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.addInitScript(
      (dark) => localStorage.setItem('media-tracker:dark', String(dark)),
      dark,
    )
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(new URL('/chat', runtime.url).href)
    const sidebar = page.locator('[data-ui="app-frame"] > [data-ui="app-sidebar"]'),
      chatNav = sidebar.locator('[data-ui="chat-sidebar"]')
    await expect(chatNav).toBeVisible()
    expect(await chatNav.evaluate((node) => node.getBoundingClientRect().top)).toBeGreaterThan(
      (await sidebar
        .locator('[data-ui="global-navigation"]')
        .evaluate((node) => node.getBoundingClientRect().bottom)) - 1,
    )
    const input = page.getByRole('textbox', { name: 'Message Imladris' })
    await input.fill('First saved question')
    await input.press('Shift+Enter')
    await input.type('with another line')
    expect(await input.inputValue()).toContain('\n')
    await input.press('Enter')
    await expect(page).toHaveURL(/\/chat\/c_[a-f0-9]{32}$/)
    await expect(
      page.getByText('A streamed answer that stays saved.', { exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled()
    await page.reload()
    await expect(
      page.getByText('A streamed answer that stays saved.', { exact: true }),
    ).toBeVisible()
    const row = chatNav.locator('div[data-selected="true"]')
    await expect(row).toBeVisible()
    await row.hover()
    await row.getByRole('button', { name: /More actions/ }).click()
    await page.getByRole('menuitem', { name: 'Rename', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Rename chat' })
    await dialog
      .getByRole('textbox', { name: 'Chat title' })
      .fill(`Reviewed ${dark ? 'dark' : 'light'} chat`)
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(row.getByRole('link')).toHaveText(`Reviewed ${dark ? 'dark' : 'light'} chat`)
    await row.hover()
    await row.getByRole('button', { name: /^Favorite / }).click()
    await expect(
      chatNav.getByRole('link', { name: `Reviewed ${dark ? 'dark' : 'light'} chat`, exact: true }),
    ).toHaveCount(1)
    const favorites = chatNav.getByRole('button', { name: 'Favorites', exact: true })
    await favorites.click()
    await expect(
      chatNav.getByRole('link', { name: `Reviewed ${dark ? 'dark' : 'light'} chat`, exact: true }),
    ).toBeHidden()
    await page.reload()
    await expect(favorites).toHaveAttribute('aria-expanded', 'false')
    await favorites.click()
    await page.screenshot({
      path: `.private/chat-implementation/chat-${dark ? 'dark' : 'light'}.png`,
      fullPage: true,
    })
    const renamed = chatNav.locator('div[data-selected="true"]')
    await renamed.hover()
    await renamed.getByRole('button', { name: /More actions/ }).click()
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click()
    const deletion = page.getByRole('dialog', { name: 'Delete chat?' })
    await deletion.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page).toHaveURL(/\/chat$/)
    await expect(chatNav.getByRole('link', { name: /Reviewed/ })).toHaveCount(0)
    expect(errors).toEqual([])
  })
}
test('reads the real synthetic Library, renders actual summaries/tool counts, and opens the shared inspector with focus return', async ({
  page,
}) => {
  await page.goto(new URL('/chat', runtime.url).href)
  await page.getByRole('textbox', { name: 'Message Imladris' }).fill('Find a book in my library')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(page.getByText('Your library includes')).toBeVisible()
  await expect(page.getByRole('button', { name: '2 tool calls', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Thinking summary', exact: true }).click()
  await expect(page.getByText('Checking the saved library records.', { exact: true })).toBeVisible()
  const citation = page.getByRole('button', { name: runtimeBookTitle, exact: true }).first()
  await citation.click()
  const inspector = page.getByRole('complementary', { name: 'Book inspector' })
  await expect(inspector).toBeVisible()
  await inspector.getByRole('tab', { name: 'History', exact: true }).click()
  await expect(inspector.getByRole('tabpanel', { name: 'History', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(inspector).toBeHidden()
  await expect(citation).toBeFocused()
})
test('keeps a partial answer on Stop and after reloading, then supports another turn', async ({
  page,
}) => {
  await page.goto(new URL('/chat', runtime.url).href)
  await page.getByRole('textbox', { name: 'Message Imladris' }).fill('A slow response please')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Stop response', exact: true })).toBeVisible()
  await expect(page.getByText('A streamed answer that stays saved.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Stop response', exact: true }).click()
  await expect(page.getByText('Response stopped.', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('Response stopped.', { exact: true })).toBeVisible()
  await expect(page.getByText('A streamed answer that stays saved.', { exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: 'Message Imladris' }).fill('Continue normally')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(page.getByText('A streamed answer that stays saved.', { exact: true })).toHaveCount(
    2,
  )
})
test('renders public web citations and keeps narrow-screen navigation modal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(new URL('/chat', runtime.url).href)
  await page
    .getByRole('textbox', { name: 'Message Imladris' })
    .fill('Search the web for this public topic')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Public source', exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: '1 tool call', exact: true }).click()
  await expect(page.getByText('Searched the web', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Open navigation' }).click()
  const sheet = page.getByRole('dialog', { name: 'Navigation' })
  await expect(sheet).toBeVisible()
  await sheet.getByRole('button', { name: 'New Chat', exact: true }).click()
  await expect(sheet).toBeHidden()
  await expect(page).toHaveURL(/\/chat$/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: '.private/chat-implementation/chat-narrow.png', fullPage: true })
})

test('recovers a lost send acknowledgement after reload using the original operation key', async ({
  page,
}) => {
  const bodies: unknown[] = [],
    before = runtime.outboundRequests.filter((url) => url.includes('api.openai.com')).length
  await page.route('**/api/chat/conversations', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    bodies.push(route.request().postDataJSON())
    const response = await route.fetch()
    if (bodies.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await page.goto(new URL('/chat', runtime.url).href)
  await page.getByRole('textbox', { name: 'Message Imladris' }).fill('Recover my saved question')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Check send', exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Check send', exact: true }).click()
  await expect(page).toHaveURL(/\/chat\/c_[a-f0-9]{32}$/)
  await expect(page.getByText('A streamed answer that stays saved.', { exact: true })).toBeVisible()
  expect(bodies).toHaveLength(2)
  expect(bodies[1]).toEqual(bodies[0])
  await expect(page.getByRole('article', { name: 'Your message' })).toHaveCount(1)
  expect(
    runtime.outboundRequests.filter((url) => url.includes('api.openai.com')).length - before,
  ).toBeLessThanOrEqual(2)
})

test('reloads an active response without cancelling it or submitting replacement inference', async ({
  page,
}) => {
  const before = runtime.outboundRequests.filter((url) => url.includes('api.openai.com')).length
  await page.goto(new URL('/chat', runtime.url).href)
  await page
    .getByRole('textbox', { name: 'Message Imladris' })
    .fill('A slow response that survives reload')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(page.getByText('A streamed answer that stays saved.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Stop response', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('A streamed answer that stays saved.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeVisible()
  await expect(page.getByRole('article', { name: 'Your message' })).toHaveCount(1)
  expect(
    runtime.outboundRequests.filter((url) => url.includes('api.openai.com')).length - before,
  ).toBeLessThanOrEqual(2)
})

test('loads favorites beyond the first fifty with no favorite-count limit', async ({ page }) => {
  const fixtures = Array.from({ length: 75 }, (_, index) => ({
    id: `c_${(index + 1).toString(16).padStart(32, '0')}`,
    title: `Favorite fixture ${String(index + 1).padStart(3, '0')}`,
    titleOrigin: 'manual',
    favorite: true,
    metadataRevision: 1,
    publicationRevision: 1,
    transcriptRevision: 1,
    headId: null,
    activeRunId: null,
    createdAt: '2026-10-30T00:00:00Z',
    lastActivityAt: '2026-10-30T00:00:00Z',
    deletedAt: null,
  }))
  await runtime.database.batch(
    fixtures.map((meta) =>
      runtime.database
        .prepare(
          'INSERT INTO chat_conversation_index(id,title,favorite,activity_at,publication_revision,deleted_at,body) VALUES(?,?,1,?,1,NULL,?)',
        )
        .bind(meta.id, meta.title, meta.lastActivityAt, JSON.stringify(meta)),
    ),
  )
  try {
    await page.goto(new URL('/chat', runtime.url).href)
    const sidebar = page.locator(
      '[data-ui="app-frame"] > [data-ui="app-sidebar"] [data-ui="chat-sidebar"]',
    )
    await expect(sidebar.getByRole('link', { name: /Favorite fixture/ })).toHaveCount(50)
    await sidebar.getByRole('button', { name: 'Load more', exact: true }).click()
    await expect(sidebar.getByRole('link', { name: /Favorite fixture/ })).toHaveCount(75)
    await expect(sidebar.getByRole('button', { name: 'Load more', exact: true })).toBeHidden()
  } finally {
    await runtime.database.batch(
      fixtures.map((meta) =>
        runtime.database.prepare('DELETE FROM chat_conversation_index WHERE id=?').bind(meta.id),
      ),
    )
  }
})
