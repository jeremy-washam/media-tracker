import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['apps/**/*.test.{ts,tsx}', 'packages/**/*.test.{ts,tsx}'],
    // Bound fixture/database concurrency on shared development and CI hosts.
    maxWorkers: 2,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html', 'lcov'],
      include: [
        'apps/api/src/**/*.ts',
        'apps/cli/src/**/*.ts',
        'apps/web/src/**/*.{ts,tsx}',
        'packages/*/src/**/*.ts',
        'packages/connectors/*/src/**/*.ts',
      ],
      exclude: [
        '**/*.test.*',
        '**/*.d.ts',
        '**/test-support/**',
        '**/testing/**',
        'packages/test-fixtures/**',
        '**/probe*.ts',
        'apps/web/src/design/**',
        'apps/web/src/header-preview/**',
        'apps/web/src/specimen/**',
        'apps/web/src/library-review/**',
        'apps/web/src/components/ui/**',
        'apps/web/src/routeTree.gen.ts',
        'apps/web/src/main.tsx',
      ],
    },
  },
})
