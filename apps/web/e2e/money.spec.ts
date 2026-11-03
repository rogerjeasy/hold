import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expectFitsEveryWidth } from './support/responsive'
import { expectInShop } from './support/sign-in'
import { expect, test } from './support/test'

// The money ledger (extensions.md section 12.5) on AG Grid Enterprise, as the demo shop's owner, counter staff and an
// accountant read it: every line of the money log grouped by rental or by month with the grid's own totals, each
// rental checked against its hold, its approved claim and PayPal, each line opening into what confirmed it.

async function startDemo(page: Page, as: 'Tomás, the owner' | 'Jonas, at the counter'): Promise<void> {
  await page.goto('/sign-in')
  await page.getByRole('region', { name: 'Try the demo shop' }).getByRole('button', { name: `Start a demo as ${as}` }).click()
  await expectInShop(page, 'Ribeira Bikes')
  await page.getByRole('navigation', { name: 'Shop pages' }).getByRole('link', { name: 'Money' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Money')
}

const grid = (page: Page) => page.getByRole('region', { name: 'Money log' })
const groups = (page: Page) => grid(page).locator('.ag-full-width-row.ag-row-group')
const dataRows = (page: Page) => grid(page).locator('.ag-row:not(.ag-full-width-row)')
const month = () => new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'Europe/Lisbon' }).format(new Date())

test('an owner sees where the shop’s money is, rental by rental, each agreeing with its hold, its claim and PayPal', async ({ page }) => {
  await startDemo(page, 'Tomás, the owner')
  await expect(page.getByTestId('money-held')).toHaveText('€3,550.00')
  await expect(page.getByTestId('money-to-shop')).toHaveText('€613.00')
  await expect(page.getByTestId('money-back')).toHaveText('€515.00')
  await expect(groups(page)).toHaveCount(13)
  await expect(dataRows(page)).toHaveCount(28)
  const daniel = groups(page).filter({ hasText: 'Daniel Ortiz' })
  await expect(daniel).toContainText('To the shop €60.00')
  await expect(daniel).toContainText('Back to the renter €215.00')
  await expect(daniel).toContainText('Held now €0.00')
  await expect(daniel).toContainText('Agrees with its hold, its claim and PayPal')

  const capture = dataRows(page).filter({ hasText: 'Taken from the hold' })
  await capture.getByRole('button', { name: 'Open Taken from the hold, €35.00' }).click()
  const opened = grid(page).getByRole('region', { name: 'Taken from the hold, €35.00' })
  await expect(opened.getByText(/^Read back from PayPal and written/)).toBeVisible()
  await expect(opened.getByText(/^SIMULATED-[0-9a-f-]{36}-captured$/)).toBeVisible()
  await expect(opened.getByRole('list', { name: 'Audit trail' })).toContainText('hold.captured')
})

test('by month, the grid adds up what went to the shop and back to renters, and a filter shows where the money is now', async ({ page }) => {
  await startDemo(page, 'Tomás, the owner')
  await page.getByRole('button', { name: 'By month' }).click()
  await expect(groups(page)).toHaveCount(1)
  await expect(groups(page).first()).toContainText(month())
  await expect(groups(page).first()).toContainText('To the shop €613.00')
  await expect(groups(page).first()).toContainText('Back to renters €515.00')

  await page.getByRole('button', { name: 'Held now 10' }).click()
  await expect(dataRows(page)).toHaveCount(20)
  await page.getByRole('button', { name: 'Back with the renter 1' }).click()
  await expect(dataRows(page)).toHaveCount(3)
  await expect(dataRows(page).first()).toContainText('Julia Novak')
  await page.getByRole('button', { name: 'Needs a look 0' }).click()
  await expect(page.getByText('No rental needs a look: every one agrees with its hold, its claim and PayPal.')).toBeVisible()
})

test('the money log downloads for the accountant’s spreadsheet', async ({ page }) => {
  await startDemo(page, 'Tomás, the owner')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download for a spreadsheet' }).click()
  expect((await download).suggestedFilename()).toBe('hold-money-log.xlsx')
})

test('counter staff read the money log too, and on a phone each rental is a card', async ({ page }) => {
  await startDemo(page, 'Jonas, at the counter')
  await expect(groups(page)).toHaveCount(13)
  await expectFitsEveryWidth(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(grid(page)).toBeHidden()
  const cards = page.getByRole('list', { name: 'Rentals and their money' }).getByRole('article')
  await expect(cards).toHaveCount(13)
  const daniel = cards.filter({ hasText: 'Daniel Ortiz' })
  await expect(daniel).toContainText('Agrees with its hold, its claim and PayPal')
  await expect(daniel.getByRole('listitem')).toHaveCount(4)
  await expectFitsEveryWidth(page)
})

for (const theme of ['light', 'dark'] as const) {
  test(`the money log passes the accessibility checks in the ${theme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await startDemo(page, 'Tomás, the owner')
    await expect(dataRows(page)).toHaveCount(28)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`)).toEqual([])
  })
}
