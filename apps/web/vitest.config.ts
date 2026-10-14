import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./src/test/server-only.ts', import.meta.url)),
    },
  },
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    // The first render of a whole page compiles every section, which can pass five seconds on a cold cache.
    testTimeout: 15_000,
    // The sign-in flow tests start a real PostgreSQL in WebAssembly.
    hookTimeout: 120_000,
    // next-intl imports next/navigation without a file extension, which only resolves when Vite bundles it.
    server: { deps: { inline: ['next-intl'] } },
  },
})
