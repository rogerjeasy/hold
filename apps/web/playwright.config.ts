import { defineConfig, devices } from '@playwright/test'

// Another port lets two checkouts of the repository run their end-to-end tests at the same time.
const PORT = Number(process.env['HOLD_E2E_PORT'] ?? 3211)
const baseURL = `http://localhost:${String(PORT)}`
// A second server, from the same build, records a made-up accepted run for the open scorecard's tests to read
// (HOLD_EVAL_FIXTURE): every other test needs a server where no run has been accepted.
const FIXTURE_PORT = PORT + 1
const fixtureURL = `http://localhost:${String(FIXTURE_PORT)}`
const OPEN_SCORECARD = 'open-scorecard.spec.ts'

// CI runs the key set on every push, kept small so CI stays quick: signing in, and money from booking through the hold
// to a captured claim, without the width-by-width layout checks. The full suite, every page at every width, runs each
// night (.github/workflows/e2e-nightly.yml) and locally with `pnpm test:e2e` (AGENTS.md section 2).
const KEY_FLOWS = ['sign-in', 'rentals', 'claims']
const keyFlowsOnly = process.env['HOLD_E2E_SCOPE'] === 'key'

// The tests run against a production build, so they see what a visitor sees and no development overlay.
export default defineConfig({
  testDir: './e2e',
  ...(keyFlowsOnly ? { testMatch: KEY_FLOWS.map((flow) => `${flow}.spec.ts`), grepInvert: /wide screen|every width/ } : {}),
  fullyParallel: true,
  forbidOnly: process.env.CI !== undefined,
  reporter: [['list']],
  use: { baseURL, trace: 'retain-on-failure' },
  // The signed-in pages run on one PostgreSQL in WebAssembly, inside the one test server, which answers slowly while
  // many tests run at once. Two browsers at a time keep it responsive.
  workers: 2,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: OPEN_SCORECARD },
    ...(keyFlowsOnly ? [] : [{ name: 'open-scorecard', use: { ...devices['Desktop Chrome'], baseURL: fixtureURL }, testMatch: OPEN_SCORECARD }]),
  ],
  webServer: [
    {
      // One process, started directly, so Playwright can stop it when the run ends. The build runs first, in the test:e2e script.
      command: `node node_modules/next/dist/bin/next start --port ${String(PORT)}`,
      url: baseURL,
      // Always a fresh build: a server left over from an earlier run would hide the change under test.
      reuseExistingServer: false,
      timeout: 60_000,
      // The built app runs against in-process fakes: an identity service that sends the code in e2e/support/sign-in.ts,
      // and a database in memory. The key seals cookies for this run only.
      env: { HOLD_ENVIRONMENT: 'test', HOLD_COOKIE_KEY: Buffer.alloc(32, 7).toString('base64'), HOLD_PUBLIC_URL: baseURL },
    },
    ...(keyFlowsOnly ? [] : [{
      command: `node node_modules/next/dist/bin/next start --port ${String(FIXTURE_PORT)}`,
      url: fixtureURL,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { HOLD_ENVIRONMENT: 'test', HOLD_COOKIE_KEY: Buffer.alloc(32, 7).toString('base64'), HOLD_PUBLIC_URL: fixtureURL, HOLD_EVAL_FIXTURE: 'on' },
    }]),
  ],
})
