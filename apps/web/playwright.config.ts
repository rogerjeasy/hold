import { defineConfig, devices } from '@playwright/test'

const PORT = 3211
const baseURL = `http://localhost:${String(PORT)}`

// The tests run against a production build, so they see what a visitor sees and no development overlay.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: process.env.CI !== undefined,
  reporter: [['list']],
  use: { baseURL, trace: 'retain-on-failure' },
  // The signed-in pages run on one PostgreSQL in WebAssembly, inside the one test server, which answers slowly while
  // many tests run at once. Two browsers at a time keep it responsive.
  workers: 2,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // One process, started directly, so Playwright can stop it when the run ends. The build runs first, in the test:e2e script.
    command: `node node_modules/next/dist/bin/next start --port ${String(PORT)}`,
    url: baseURL,
    // Always a fresh build: a server left over from an earlier run would hide the change under test.
    reuseExistingServer: false,
    timeout: 60_000,
    // The built app runs against in-process fakes: an identity service that sends the code in e2e/support/sign-in.ts,
    // and a database in memory. The key seals cookies for this run only.
    env: { HOLD_ENVIRONMENT: 'test', HOLD_COOKIE_KEY: Buffer.alloc(32, 7).toString('base64') },
  },
})
