import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/previews',
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5174', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm --filter @media-tracker/web exec vite --host 127.0.0.1 --port 5174',
    url: 'http://127.0.0.1:5174/header-preview.html',
    reuseExistingServer: true,
  },
})
