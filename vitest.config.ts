import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['apps/**/*.test.ts', 'packages/**/*.test.ts'],
    // Bound fixture/database concurrency on shared development and CI hosts.
    maxWorkers: 4,
  },
})
