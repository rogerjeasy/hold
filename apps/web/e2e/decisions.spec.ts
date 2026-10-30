import AxeBuilder from '@axe-core/playwright'
import type { Browser, Page } from '@playwright/test'
import { expectFitsEveryWidth } from './support/responsive'
import { APPROVE_THEN_DISPUTE, bookAtTheCounter, payFee, renterBrowser } from './support/rental'
import { shopReadyToBook } from './support/shop'
import { expectInShop } from './support/sign-in'
import { expect, test } from './support/test'

// The decision board (extensions.md section 12.5), as an owner and a counter staff member use it on AG Grid Enterprise:
// what waits on a person, grouped by kind with the most urgent group first, each decision opening in place into its
// evidence and actions, and a list of cards on a phone.

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
// AG Grid draws a group's heading and an opened decision's evidence as rows across the whole grid; a decision's own
// row has columns.
const groups = (page: Page) => grid(page).locator('.ag-full-width-row.ag-row-group')
const dataRows = (page: Page) => grid(page).locator('.ag-row:not(.ag-full-width-row)')
const evidence = (page: Page, heading: string) => grid(page).getByRole('region', { name: heading })

test('an owner works through the morning by keyboard: grouped by kind, the late return first, then the claim opened in place', async ({ page }) => {
  await startDemo(page, 'Tomás, the owner')
  await openBoard(page)
  await expect(page.getByTestId('decisions-brief')).toHaveText(/^7 decisions wait, 7 of them yours\./)
  await expect(dataRows(page)).toHaveCount(7)
  // The contested claim falls due at the date the shop promised the renter (architecture.md section 6.16), so claims come before the agent's proposals.
  await expect(groups(page)).toHaveText([/^Holds and returns\s*3 decisions · €335\.00 in all$/, /^Claims\s*2 decisions · €80\.00 in all$/, /^From the agent\s*2 decisions · €300\.00 in all$/])
  await expect(dataRows(page).first()).toContainText('Lea Fischer is late')
  await expect(dataRows(page).first()).toContainText('Overdue')

  await dataRows(page).first().locator('[col-id="due"]').click()
  await expect(evidence(page, 'Lea Fischer is late')).toBeVisible()
  const claim = dataRows(page).filter({ hasText: 'Approve a claim' })
  for (let press = 0; press < 12 && (await claim.locator('.ag-cell-focus').count()) === 0; press += 1) await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  const opened = evidence(page, 'Approve a claim of €35.00')
  await expect(opened.getByRole('heading', { name: 'Approve a claim of €35.00' })).toBeFocused()
  // The grid sizes the opened row to its evidence, never a sliver.
  await expect.poll(async () => (await opened.boundingBox())?.height ?? 0).toBeGreaterThan(400)
  await expect(opened.getByRole('img', { name: 'At return: Scratch on the frame, through the paint' })).toBeVisible()
  await expect(opened.getByTestId('split-release')).toHaveText('€215.00')
  await expect(claim.getByRole('button', { name: 'Close the evidence of Approve a claim' })).toHaveAttribute('aria-expanded', 'true')
  await opened.getByRole('link', { name: 'Review and approve on the claim page' }).click()
  await expect(page).toHaveURL(/\/shop\/rentals\/[0-9a-f-]{36}\/claim$/)
})

test('a demo owner decides the contested claim, and finds the agent’s sample proposals, which move nothing', async ({ page }) => {
  await startDemo(page, 'Tomás, the owner')
  await openBoard(page)
  await expect(dataRows(page).filter({ hasText: 'Decide a contested claim' })).toContainText('You decide.')
  await page.getByRole('button', { name: 'From the agent 2' }).click()
  // One kind shown, so nothing is grouped.
  await expect(groups(page)).toHaveCount(0)
  const dispute = dataRows(page).filter({ hasText: 'Send this answer to PayPal on the dispute' })
  await expect(dispute).toContainText('Sample')
  await dispute.getByRole('button', { name: 'Open the evidence of Send this answer to PayPal on the dispute' }).click()
  const opened = evidence(page, 'Send this answer to PayPal on the dispute')
  await expect(opened.getByText('A PayPal dispute is waiting for a response.')).toBeVisible()
  await expect(opened.getByText(/^The renter returned the bike with a scratch/)).toBeVisible()
  await opened.getByRole('button', { name: 'Postpone until tomorrow' }).click()
  await expect(page.getByRole('button', { name: 'From the agent 1' })).toBeVisible()
})

test('what a renter dropped off overnight waits on the board, and opens on its photographs and the two choices', async ({ page }) => {
  await startDemo(page, 'Jonas, at the counter')
  await openBoard(page)
  const row = dataRows(page).filter({ hasText: 'Check what Chloé Martin dropped off' })
  await expect(row).toContainText('You decide.')
  await row.getByRole('button', { name: 'Open the evidence of Check what Chloé Martin dropped off' }).click()
  const opened = evidence(page, 'Check what Chloé Martin dropped off')
  await expect(opened.getByText(/, on time$/)).toBeVisible()
  await expect(opened.getByText('1 finding')).toBeVisible()
  await expect(opened.getByRole('img', { name: 'Where they left it' })).toBeVisible()
  await expect(opened.getByRole('button', { name: 'It’s here, review the return' })).toBeVisible()
  await expect(opened.getByRole('button', { name: 'It’s not here' })).toBeVisible()
  await expectFitsEveryWidth(page)
})

test('a contested claim opens on where the two sides differ, and the owner has the summary written', async ({ page }) => {
  await startDemo(page, 'Tomás, the owner')
  await openBoard(page)
  const row = dataRows(page).filter({ hasText: 'Decide a contested claim' })
  await row.getByRole('button', { name: 'Open the evidence of Decide a contested claim' }).click()
  const summary = evidence(page, 'Decide a contested claim of €45.00').getByRole('region', { name: 'Where the two sides differ' })
  await expect(summary.getByText('No summary has been written yet.', { exact: false })).toBeVisible()
  await expect(summary.getByRole('blockquote')).toHaveText('The lock was in the bag when I handed it back.')
  await summary.getByRole('button', { name: 'Write the summary' }).click()
  // Written by the stand-in in the test environment, which says so.
  await expect(summary.getByText('Simulated summary')).toBeVisible()
  await expect(summary.getByText('Disputed: 1 of 1 line')).toBeVisible()
  await expect(summary.getByText('Added by Jonas, with a written reason.')).toBeVisible()
  await expectFitsEveryWidth(page)
})

test('the right-click menu goes to a decision’s rental, and never offers to move money', async ({ page }) => {
  await startDemo(page, 'Tomás, the owner')
  await openBoard(page)
  await dataRows(page).filter({ hasText: 'Approve a claim' }).locator('[col-id="due"]').click({ button: 'right' })
  const menu = page.locator('.ag-menu')
  await expect(menu.getByRole('menuitem')).toHaveText(['Open the decision', 'Open the claim page', 'Open the rental'])
  await menu.getByRole('menuitem', { name: 'Open the rental' }).click()
  await expect(page).toHaveURL(/\/shop\/rentals\/[0-9a-f-]{36}$/)
})

test('the board sorts by amount within each group, filters by group and finds a renter, the same rows in the grid as on a phone', async ({ page }) => {
  await startDemo(page, 'Tomás, the owner')
  await openBoard(page)
  await grid(page).getByRole('columnheader', { name: 'Amount' }).click()
  await expect(dataRows(page)).toHaveText([/Repair Hybrid bike 4/, /Check what Chloé Martin dropped off/, /Lea Fischer is late/, /Approve a claim/, /Decide a contested claim/, /Send this answer to PayPal/, /Ask the renter for a new hold/])

  await page.getByRole('button', { name: 'Claims 2' }).click()
  await expect(dataRows(page)).toHaveCount(2)
  await page.getByRole('button', { name: 'All 7' }).click()
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
  // The repair to do is the counter's work, so it is theirs as well (architecture.md section 9.6).
  await page.getByRole('checkbox', { name: 'Only mine' }).check()
  await expect(dataRows(page)).toHaveCount(4)
  await page.getByRole('checkbox', { name: 'Only mine' }).uncheck()
  const contested = dataRows(page).filter({ hasText: 'Decide a contested claim' })
  await expect(contested).toContainText('An owner or manager decides.')
})

for (const theme of ['light', 'dark'] as const) {
  test(`the board passes the accessibility checks in the ${theme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await startDemo(page, 'Tomás, the owner')
    await openBoard(page)
    await expect(dataRows(page)).toHaveCount(7)
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
  await proposal.locator('[col-id="due"]').click()
  const opened = evidence(page, 'Send this answer to PayPal on the dispute')
  await expect(opened.getByText('PayPal could not be checked')).toBeVisible()
  await expectFitsEveryWidth(page)
  await opened.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(opened.getByText('There is no draft to send. Reject it, or write to the renter yourself.')).toBeVisible()
  await opened.getByRole('button', { name: 'Postpone until tomorrow' }).click()
  // It was the only decision, so the board says nothing waits; it is back tomorrow.
  await expect(page.getByTestId('decisions-brief')).toHaveText('Nothing waits on a person.')
})
