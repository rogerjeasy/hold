// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

// Every way into the server, found by looking rather than by a list someone keeps: each route handler and each export
// of a file that begins with 'use server' is built by one of the shared wrappers (AGENTS.md section 7), or is named
// below with why it is public and what checks the caller instead. A new route or server function that is neither
// fails here.

process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 9).toString('base64')

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: () => undefined, set: () => undefined, delete: () => undefined }),
  headers: () => Promise.resolve(new Headers()),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('next-intl/server', () => ({ getTranslations: () => Promise.resolve((key: string) => key) }))

const { isShopAction } = await import('./shop-access')
const { isRenterAction } = await import('./renter-access')
const { isShopPageAction } = await import('./shop-page-access')
const { isPublicAction } = await import('./public-action')
const { isMobileStaffRoute } = await import('./mobile-staff')
const { isMobileSessionRoute } = await import('./mobile-session')
const { isMobileRenterRoute } = await import('./mobile-renter-route')

vi.setConfig({ testTimeout: 60_000 })

const WRAPPERS = [isShopAction, isRenterAction, isShopPageAction, isPublicAction, isMobileStaffRoute, isMobileSessionRoute, isMobileRenterRoute]
const isWrapped = (value: unknown) => WRAPPERS.some((wrapper) => wrapper(value))

const HTTP_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
// Next.js reads these from a route file as settings; they are values, not ways in.
const ROUTE_SETTINGS = new Set(['dynamic', 'dynamicParams', 'revalidate', 'fetchCache', 'runtime', 'preferredRegion', 'maxDuration'])

const SIGN_IN =
  'signing in comes before any shop or session, so there is nothing for a wrapper to check; the sign-in flow validates the input with the browser’s own schema and rate limits each address and network on top of Cognito’s limits (features/auth/sign-in-flow.ts)'
const OWN_SESSION = 'acts only on the caller’s own session: it reads the Cognito tokens from the signed cookies and verifies them with the identity service before it does anything'
const SIMULATED_PAYPAL = 'the simulated PayPal’s page, in the test environment only: without the in-process fake PayPal (every deployed environment) it answers 404 and touches nothing'

// Each entry: `<file> <export>` and why it needs no wrapper. Keep it short and keep it true.
const PUBLIC_BY_DESIGN: Record<string, string> = {
  '/src/app/mcp/route.ts GET': 'the MCP server for renters’ assistants has no sign-in step by design (architecture.md 13.4); every tool call passes the gateway in packages/mcp, which checks the rental’s agent token and its scope and rate limits by network and token',
  '/src/app/mcp/route.ts POST': 'as GET: the packages/mcp gateway checks the agent token, scope and rate on every call, and the body is capped before it is read',
  '/src/app/mcp/route.ts DELETE': 'as GET: ends an MCP session through the same gateway',
  '/src/app/api/health/route.ts GET': 'App Runner’s health check: reads nothing from the request, changes nothing and reaches no service',
  '/src/app/.well-known/jwks.json/route.ts GET': 'a public read by design: the public key Clean Record credentials are signed with, so anyone can check one; reads nothing from the request',
  '/src/app/api/simulated-storage/[...path]/route.ts GET': 'the stand-in for S3 in the test environment only, answering 404 everywhere else; serves display copies, never an original',
  '/src/app/api/simulated-storage/[...path]/route.ts PUT': 'the stand-in for S3 in the test environment only, answering 404 everywhere else; refuses an upload without its signed fingerprint, as S3 would',
  '/src/app/api/webhooks/paypal/[accountId]/route.ts POST': 'PayPal’s webhook: verified by PayPal’s signature for that account before the body is used, then read back from PayPal; rate limited and the body capped',
  '/src/app/api/webhooks/paypal/demo/route.ts POST': 'PayPal’s webhook for the demo’s shared sandbox app: verified by PayPal’s signature before the body is used, then read back from PayPal; rate limited and the body capped',
  '/src/app/api/mobile/v1/paypal-return/[kind]/route.ts GET': 'where PayPal sends a renter back to the phone app: reads and writes nothing, takes no token, redirects only to the app’s own address, and is rate limited',
  '/src/app/[locale]/(link)/simulated-paypal/[orderId]/approve/route.ts POST': SIMULATED_PAYPAL,
  '/src/app/[locale]/(link)/simulated-paypal/[orderId]/review/route.ts POST': SIMULATED_PAYPAL,
  '/src/features/auth/actions.ts requestSignIn': SIGN_IN,
  '/src/features/auth/actions.ts requestSignUp': SIGN_IN,
  '/src/features/auth/actions.ts requestInvitationCode': `${SIGN_IN}; the invitation token itself is checked against the database`,
  '/src/features/auth/actions.ts signInWithDemoAccount': 'starts or continues a demo of the browser’s own: the account is one of a fixed set, starting one is rate limited by network, and the session it gives counts as weaker than a passkey, so money steps still ask for one',
  '/src/features/auth/actions.ts submitCode': `${SIGN_IN}; the code is checked by Cognito against the attempt held in a signed cookie`,
  '/src/features/auth/actions.ts sendNewCode': `${SIGN_IN}; resends only for the attempt held in a signed cookie`,
  '/src/features/auth/actions.ts startOver': 'clears the browser’s own sign-in attempt and redirects; reaches no data',
  '/src/features/auth/actions.ts startPasskeySignIn': `${SIGN_IN}; gives the same answer for every address`,
  '/src/features/auth/actions.ts finishPasskeySignIn': `${SIGN_IN}; Cognito checks the device’s signed answer`,
  '/src/features/auth/actions.ts startPasskeyRegistration': `${OWN_SESSION}; a second passkey needs a session a passkey proved`,
  '/src/features/auth/actions.ts finishPasskeyRegistration': `${OWN_SESSION}; checked again here, since the two halves are separate requests`,
  '/src/features/auth/actions.ts signOut': 'ends the caller’s own session at Cognito and clears its cookies; reaches no shop data',
  '/src/features/shop/choose-shop.ts switchShop': `${OWN_SESSION}, and sets the shop cookie only to a shop where the person has a role; every later request checks that cookie again through the shop wrapper`,
}

const USE_SERVER = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*['"]use server['"]/

// A glob skips folders whose names begin with a dot, so .well-known is named on its own.
const routeFiles = import.meta.glob<Record<string, unknown>>(['/src/app/**/route.ts', '/src/app/.well-known/**/route.ts'])
const sources = import.meta.glob<string>(['/src/**/*.ts', '/src/**/*.tsx', '!/src/**/*.test.ts', '!/src/**/*.test.tsx'], { query: '?raw', import: 'default', eager: true })
const modules = import.meta.glob<Record<string, unknown>>(['/src/**/*.ts', '/src/**/*.tsx', '!/src/**/*.test.ts', '!/src/**/*.test.tsx', '!/src/app/**/route.ts'])
const serverFunctionFiles = Object.keys(sources).filter((file) => USE_SERVER.test(sources[file] ?? ''))

async function waysIn(): Promise<{ way: string; value: unknown }[]> {
  const found: { way: string; value: unknown }[] = []
  for (const [file, load] of Object.entries(routeFiles)) {
    for (const [name, value] of Object.entries(await load())) {
      if (ROUTE_SETTINGS.has(name)) continue
      found.push({ way: `${file} ${name}`, value })
    }
  }
  for (const file of serverFunctionFiles) {
    const load = modules[file]
    if (load === undefined) throw new Error(`${file} begins with 'use server' but could not be loaded`)
    for (const [name, value] of Object.entries(await load())) found.push({ way: `${file} ${name}`, value })
  }
  return found
}

describe('every way into the server', () => {
  it('finds the routes and server functions, the auth and shop-choosing ones among them', () => {
    expect(Object.keys(routeFiles).length).toBeGreaterThanOrEqual(23)
    expect(serverFunctionFiles).toEqual(expect.arrayContaining(['/src/features/auth/actions.ts', '/src/features/shop/choose-shop.ts', '/src/features/shop/actions.ts', '/src/features/hosted-assistant/actions.ts']))
  })

  it('is built by a shared wrapper, or is named with why it is public and what checks the caller instead', async () => {
    const unchecked = (await waysIn()).filter(({ way, value }) => !isWrapped(value) && PUBLIC_BY_DESIGN[way] === undefined).map(({ way }) => way)
    expect(unchecked).toEqual([])
  })

  it('names only routes that answer by HTTP method, and server functions that are functions', async () => {
    const odd = (await waysIn()).filter(({ way, value }) => typeof value !== 'function' || (way.includes('/route.ts ') && !HTTP_METHODS.has(way.split(' ')[1] ?? ''))).map(({ way }) => way)
    expect(odd).toEqual([])
  })

  it('keeps no public entry that no longer exists or is now wrapped, and gives each a reason', async () => {
    const unwrapped = new Set((await waysIn()).filter(({ value }) => !isWrapped(value)).map(({ way }) => way))
    expect(Object.keys(PUBLIC_BY_DESIGN).filter((way) => !unwrapped.has(way))).toEqual([])
    for (const reason of Object.values(PUBLIC_BY_DESIGN)) expect(reason.length).toBeGreaterThan(40)
  })
})
