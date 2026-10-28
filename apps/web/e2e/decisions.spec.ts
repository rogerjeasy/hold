import AxeBuilder from '@axe-core/playwright'
import type { Browser, Page } from '@playwright/test'
import { expectFitsEveryWidth } from './support/responsive'
import { APPROVE_THEN_DISPUTE, bookAtTheCounter, payFee, renterBrowser } from './support/rental'
import { shopReadyToBook } from './support/shop'
import { expectInShop } from './support/sign-in'
import { expect, test } from './support/test'

// The decision board (extensions.md section 12.5), as an owner and a counter staff member use it on AG Grid: what
// waits on a person, in the order it falls due, with the chosen decision's evidence beside the grid, and a list of
// cards on a phone.

async function startDemo(page: Page, as: 'Tomás, the owner' | 'Jonas, at the counter'): Promise<void> {
  await page.goto('/sign-in')
  await page.getByRole('region', { name: 'Try the demo shop' }).getByRole('button', { name: `Start a demo as ${as}` }).click()
  await expectInShop(page, 'Ribeira Bikes')
}

async function openBoard(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Shop pages' }).getByRole('link', { name: 'Decisions' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Decisions')
}

const grid = (page: Page) => page.getByRole('region', { name: 'Decisions waiting on a person' })
const dataRows = (page: Page) => grid(page).getByRole('row').filter({ has: page.getByRole('gridcell') })
const panel = (page: Page) => page.getByRole('region', { name: 'Chosen decision' })

test('an owner works through the morning by keyboard: the late return first, then the claim with its evidence', async ({ page }) => {
  await startDemo(page, 'Tomás, the owner')
  await openBoard(page)
  await expect(page.getByTestId('decisions-brief')).toHaveText(/^5 decisions wait, 5 of them yours\./)
  await expect(dataRows(page)).toHaveCount(5)
  await expect(dataRows(page).first()).toContainText('Lea Fischer is late')
  await expect(dataRows(page).first()).toContainText('Overdue')
  // The first decision is open beside the grid before anything is chosen.
  await expect(panel(page).getByRole('heading', { name: 'Lea Fischer is late' })).toBeVisible()

  await dataRows(page).first().getByRole('gridcell').first().click()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  const heading = panel(page).getByRole('heading', { name: 'Approve a claim of €35.00' })
  await expect(heading).toBeFocused()
  await expect(panel(page).getByRole('img', { name: 'At return: Scratch on the frame, through the paint' })).toBeVisible()
  await expect(panel(page).getByTestId('split-release')).toHaveText('€215.00')
  await panel(page).getByRole('link', { name: 'Review and approve on the claim page' }).click()
  await expect(page).toHaveURL(/\/shop\/rentals\/[0-9a-f-]{36}\/claim$/)
})

test('a demo owner decides the contested claim, and finds the agent’s sample proposals, which move nothing', async ({ page }) => {
  await startDemo(page, 'Tomás, the owner')
  await openBoard(page)
  await expect(dataRows(page).filter({ hasText: 'Decide a contested claim' })).toContainText('You decide.')
  await page.getByRole('button', { name: 'From the agent 2' }).click()
  const dispute = dataRows(page).filter({ hasText: 'Send this answer to PayPal on the dispute' })
  await expect(dispute).toContainText('Sample')
  await dispute.getByRole('gridcell').first().click()
  await expect(panel(page).getByText('A PayPal dispute is waiting for a response.')).toBeVisible()
  await expect(panel(page).getByText(/^The renter returned the bike with a scratch/)).toBeVisible()
  await panel(page).getByRole('button', { name: 'Postpone until tomorrow' }).click()
  await expect(page.getByRole('button', { name: 'From the agent 1' })).toBeVisible()
})

test('the board sorts by amount, filters by group and finds a renter, the same rows in the grid as on a phone', async ({ page }) => {
  await startDemo(page, 'Tomás, the owner')
  await openBoard(page)
  await grid(page).getByRole('columnheader', { name: 'Amount' }).click()
  await expect(dataRows(page).first()).toContainText('Send this answer to PayPal on the dispute')
  await expect(dataRows(page).last()).toContainText('Lea Fischer is late')

  await page.getByRole('button', { name: 'Claims 2' }).click()
  await expect(dataRows(page)).toHaveCount(2)
  await page.getByRole('button', { name: 'All 5' }).click()
  await page.getByRole('searchbox', { name: 'Search decisions' }).fill('becker')
  await expect(dataRows(page)).toHaveCount(1)
  await expect(dataRows(page).first()).toContainText('Decide a contested claim')
  await expectFitsEveryWidth(page)

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(grid(page)).toBeHidden()
  const cards = page.getByRole('list', { name: 'Decisions' }).getByRole('article')
  await expect(cards).toHaveCount(1)
  await cards.first().getByRole('button', { name: 'Evidence and actions' }).click()
  await expect(cards.first().getByRole('blockquote')).toHaveText('The lock was in the bag when I handed it back.')
  await expectFitsEveryWidth(page)
})

test('counter staff see which decisions are theirs and which wait for the owner', async ({ page }) => {
  await startDemo(page, 'Jonas, at the counter')
  await openBoard(page)
  await page.getByRole('checkbox', { name: 'Only mine' }).check()
  await expect(dataRows(page)).toHaveCount(2)
  await page.getByRole('checkbox', { name: 'Only mine' }).uncheck()
  const contested = dataRows(page).filter({ hasText: 'Decide a contested claim' })
  await expect(contested).toContainText('An owner or manager decides.')
})

for (const theme of ['light', 'dark'] as const) {
  test(`the board passes the accessibility checks in the ${theme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await startDemo(page, 'Tomás, the owner')
    await openBoard(page)
    await expect(dataRows(page)).toHaveCount(5)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`)).toEqual([])
  })
}

// A rental whose renter paid and then disputed the payment, so the operations agent's dispute detector has a case.
async function disputedRental(page: Page, browser: Browser) {
  await bookAtTheCounter(page)
  await page.getByRole('button', { name: 'Show the link' }).click()
  const link = (await page.getByTestId('renter-link').textContent()) ?? ''
  const renter = await renterBrowser(browser)
  await payFee(renter, link, APPROVE_THEN_DISPUTE)
  await renter.context().close()
}

test('an owner decides the agent’s proposal on the board, and it leaves the board', async ({ page, browser }) => {
  test.setTimeout(240_000)
  await shopReadyToBook(page, 'Porto Board Bikes')
  await disputedRental(page, browser)
  await page.getByRole('navigation', { name: 'Shop pages' }).getByRole('link', { name: 'Morning queue' }).click()
  await page.getByRole('button', { name: 'Check now' }).click()
  await expect(page.getByText('Check started. New entries appear on this page when it finishes.')).toBeVisible()
  await openBoard(page)
  await page.getByRole('button', { name: 'From the agent 1' }).click()
  const proposal = dataRows(page).filter({ hasText: 'Send this answer to PayPal on the dispute' })
  await expect(proposal).toContainText('A PayPal dispute is waiting for a response.')
  await proposal.getByRole('gridcell').first().click()
  await expect(panel(page).getByText('PayPal could not be checked')).toBeVisible()
  await expectFitsEveryWidth(page)
  await panel(page).getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(panel(page).getByText('There is no draft to send. Reject it, or write to the renter yourself.')).toBeVisible()
  await panel(page).getByRole('button', { name: 'Postpone until tomorrow' }).click()
  // It was the only decision, so the board says nothing waits; it is back tomorrow.
  await expect(page.getByTestId('decisions-brief')).toHaveText('Nothing waits on a person.')
})
