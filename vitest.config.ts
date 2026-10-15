import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'workspace', include: ['*.test.ts'] } },
      // The database tests run a real PostgreSQL in WebAssembly, whose first queries are slow on a busy machine.
      { test: { name: 'packages', include: ['packages/*/src/**/*.test.ts'], testTimeout: 30_000, hookTimeout: 120_000 } },
      // Building the CDK app takes a few seconds, more than Vitest allows a test by default.
      { test: { name: 'infra', include: ['infra/lib/**/*.test.ts'], testTimeout: 60_000, hookTimeout: 60_000 } },
      { test: { name: 'worker', include: ['apps/worker/src/**/*.test.ts'] } },
      'apps/web/vitest.config.ts',
    ],
  },
})
