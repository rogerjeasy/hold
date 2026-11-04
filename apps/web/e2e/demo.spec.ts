import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { acceptClaim, handedOverAndReturned } from './support/claim'
import { addVirtualAuthenticator } from './support/passkey'
import { expectFitsEveryWidth } from './support/responsive'
import { bookAtTheCounter, feePaidAndHoldPlaced, renterBrowser } from './support/rental'
import { expectInShop, startDemo } from './support/sign-in'
import { expect, test } from './support/test'

// Each judge's demo is their own (architecture.md section 20.3): one tap opens a new Ribeira Bikes with new accounts,
// and nobody else's demo is reachable from it.

// The address of one sample rental in the shop the page is signed in to.
async function aRental(page: Page): Promise<string> {
  await page.goto('/shop/rentals')
  await page.getByRole('link', { name: /Priya Natarajan/ }).first().click()
  await expect(page).toHaveURL(/\/shop\/rentals\/[0-9a-f-]{36}$/)
  return page.url()
}

async function signOut(page: Page, person: 'Tomás' | 'Jonas'): Promise<void> {
  await page.getByRole('button', { name: `Account of ${person}` }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/:\d+\/$/)
}

test('a judge starts a demo of their own with one tap, and finds the shop already busy', async ({ page }) => {
  await startDemo(page, 'Tomás, the owner')
  await expect(page.getByRole('button', { name: 'Account of Tomás' })).toContainText(/tomas\.[a-z0-9]+@demo\.hold\.example/)
  await expect(page.getByText('Priya Natarajan').first()).toBeVisible()
})

test('a judge starts a demo at the counter, as Jonas', async ({ page }) => {
  await startDemo(page, 'Jonas, at the counter')
  await expect(page.getByRole('button', { name: 'Account of Jonas' })).toContainText(/jonas\.[a-z0-9]+@demo\.hold\.example/)
})

test('the browser that started a demo comes back to it as Jonas, in the same shop; another judge’s demo cannot reach it', async ({ page, browser, browserErrors }) => {
  await startDemo(page, 'Tomás, the owner')
  const rental = await aRental(page)
  await signOut(page, 'Tomás')

  await page.goto('/sign-in')
  await page.getByRole('region', { name: 'Try the demo shop' }).getByRole('button', { name: 'Continue as Jonas, at the counter' }).click()
  await expectInShop(page, 'Ribeira Bikes')
  await expect(page.getByRole('button', { name: 'Account of Jonas' })).toBeVisible()
  expect((await page.goto(rental))?.status()).toBe(200)

  const other = await (await browser.newContext()).newPage()
  await startDemo(other, 'Tomás, the owner')
  expect(await aRental(other)).not.toBe(rental)
  expect((await other.goto(rental))?.status()).toBe(404)
  await other.context().close()
  // A browser that started no demo has none to continue: it is offered a new one only.
  const stranger = await (await browser.newContext()).newPage()
  await stranger.goto('/sign-in')
  await expect(stranger.getByRole('button', { name: /^Continue as/ })).toHaveCount(0)
  await stranger.context().close()
  // The 404 the second judge's browser logs is the point of this test. The fixture watches the first page only.
  browserErrors.length = 0
})

test('starting a fresh demo opens a new shop with new accounts', async ({ page, browserErrors }) => {
  await startDemo(page, 'Tomás, the owner')
  const first = await aRental(page)
  const firstAccount = await page.getByRole('button', { name: 'Account of Tomás' }).textContent()

  await page.goto('/sign-in')
  await page.getByRole('button', { name: 'Start a fresh demo' }).click()
  await expectInShop(page, 'Ribeira Bikes')
  expect(await page.getByRole('button', { name: 'Account of Tomás' }).textContent()).not.toBe(firstAccount)
  expect((await page.goto(first))?.status()).toBe(404)
  // The 404 is the point: the first demo's rental is not this demo's.
  browserErrors.length = 0
})

// The README's judge path. Jonas's limit is below the shop's owner threshold, so nothing he does here asks for a
// passkey, and no authenticator is attached: a passkey prompt anywhere would stop the test.
test('as Jonas, a judge takes a damaged return to a PayPal capture without adding a passkey', async ({ page, browser }) => {
  test.setTimeout(240000)
  await startDemo(page, 'Jonas, at the counter')
  await bookAtTheCounter(page, 'City bike')
  await feePaidAndHoldPlaced(page, browser)
  await handedOverAndReturned(page, 'Use the sample with damage')
  await page.getByLabel('Agreed price').selectOption({ label: 'Scratch on the frame, through the paint · €35.00' })
  await page.getByLabel('What did you find, and why does this price apply?').fill('A chip in the paint on the down tube, new since the handover.')
  await page.getByRole('button', { name: 'Prepare claim for review', exact: true }).click()
  await page.getByRole('button', { name: 'Approve and show renter link', exact: true }).click()
  const link = (await page.getByTestId('renter-link').textContent()) ?? ''
  const renter = await renterBrowser(browser)
  await renter.goto(link)
  await acceptClaim(renter)
  await renter.context().close()
  await page.reload()
  await expect(page.getByText('Settlement confirmed', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Settlement amounts' })).toContainText('€35.00')
})

// architecture.md section 8.2: staff let a walk-in pay the fee and approve the hold in one PayPal approval.
test('as Jonas, a judge books a walk-in whose renter approves the fee and the hold at once', async ({ page, browser }) => {
  await startDemo(page, 'Jonas, at the counter')
  await page.getByRole('navigation', { name: 'Shop pages' }).getByRole('link', { name: 'Rentals' }).click()
  await page.getByRole('link', { name: 'New rental' }).first().click()
  await page.getByRole('button', { name: 'One more City bike' }).click()
  await page.getByLabel('Name').fill('Walk-in Renter')
  await page.getByRole('checkbox', { name: /Walk-in: fee and hold in one PayPal approval/ }).check()
  await expectFitsEveryWidth(page)
  await page.getByRole('button', { name: 'Book', exact: true }).click()
  await expect(page).toHaveURL(/\/shop\/rentals\/[0-9a-f-]{36}$/)
  await expect(page.getByText(/A walk-in: the renter approves the fee and the hold together/)).toBeVisible()
  await page.getByRole('button', { name: 'Show the link' }).click()
  const link = (await page.getByTestId('renter-link').textContent()) ?? ''
  const renter = await renterBrowser(browser)
  await renter.goto(link)
  await expect(renter.getByRole('button', { name: /^Pay .* and approve the .* hold with PayPal$/ })).toBeVisible()
  await expectFitsEveryWidth(renter)
  await renter.getByRole('button', { name: /^Pay .* and approve the .* hold with PayPal$/ }).click()
  await renter.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(renter.getByText('Hold placed. Only your fee is charged.')).toBeVisible()
  await renter.context().close()
  await page.reload()
  await expect(page.getByRole('region', { name: 'Hold at pickup' }).getByText('Ready for handover.')).toBeVisible({ timeout: 15_000 })
})

test('on a wide screen the calendar draws each rental as a bar, and a bar opens its rental', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await startDemo(page, 'Tomás, the owner')
  await page.getByRole('navigation', { name: 'Shop pages' }).getByRole('link', { name: 'Calendar' }).click()
  const bar = page.locator('.b-sch-event').first()
  await expect(bar).toBeVisible()
  await bar.click()
  await expect(page).toHaveURL(/\/shop\/rentals\/[0-9a-f-]{36}$/)
})

for (const theme of ['light', 'dark'] as const) {
  test(`the calendar passes the accessibility checks in the ${theme} theme, its bars and headers included`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.emulateMedia({ colorScheme: theme })
    await startDemo(page, 'Tomás, the owner')
    await page.goto('/shop/calendar')
    await expect(page.locator('.b-sch-event').first()).toBeVisible()
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`)).toEqual([])
  })
}

test('a judge adds a passkey to their own demo, then confirms with it', async ({ page }) => {
  await addVirtualAuthenticator(page)
  await startDemo(page, 'Tomás, the owner')
  await page.goto('/shop/prices')
  await page.getByRole('link', { name: 'Add a passkey' }).click()
  await expect(page).toHaveURL(/\/shop\/security$/)
  await page.getByRole('button', { name: 'Add a passkey on this device' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Passkey 1' })).toBeVisible()
  await page.goto('/shop/prices')
  await page.getByRole('button', { name: 'Confirm with my passkey' }).click()
  await expect(page.getByRole('button', { name: 'Publish this price list' })).toBeVisible()
})
