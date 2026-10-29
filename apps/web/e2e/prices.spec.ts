import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expectFitsEveryWidth } from './support/responsive'
import { ownerWithPrices } from './support/shop'
import { expectInShop } from './support/sign-in'
import { expect, test } from './support/test'

// The price list editor (extensions.md section 12.5): the next version as a draft on AG Grid, pasted from a
// spreadsheet, every cell checked, every change undoable, read as a renter would in their language, compared with any
// version, and published as version N plus one.

const grid = (page: Page) => page.getByRole('region', { name: 'Prices in this draft' })
const dataRows = (page: Page) => grid(page).getByRole('row').filter({ has: page.getByRole('gridcell') })
const preview = (page: Page) => page.getByRole('region', { name: 'What a renter reads' })

async function openPrices(page: Page) {
  await page.getByRole('navigation', { name: 'Shop pages' }).getByRole('link', { name: 'Prices' }).click()
  await expect(page.getByRole('heading', { name: 'Draft of version 2' })).toBeVisible()
}

async function editCell(page: Page, row: string, column: string, value: string) {
  const cell = dataRows(page).filter({ hasText: row }).locator(`[col-id="${column}"]`)
  await cell.dblclick()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type(value)
  await page.keyboard.press('Enter')
}

test('an owner edits, pastes, undoes and publishes the next version, seeing what a renter will read and what changed', async ({ page }) => {
  test.setTimeout(120_000)
  await ownerWithPrices(page)
  await openPrices(page)
  await expect(dataRows(page)).toHaveCount(1)

  await editCell(page, 'Deep scratch on the frame', 'amount', '40')
  await expect(dataRows(page).first()).toContainText('€40.00')
  await expect(page.getByRole('region', { name: 'What changed' })).toContainText('Deep scratch on the frame · from €35.00 to €40.00')

  await page.getByRole('button', { name: 'Paste from a spreadsheet' }).click()
  await page.getByRole('textbox', { name: 'Paste your price list here' }).fill('What\tKind\tPrice\nLost lock\tLoss\t45\nBent wheel\tDamage\tninety')
  await page.getByRole('button', { name: 'Add these prices' }).click()
  await expect(page.getByText('2 prices added, the header line left out.')).toBeVisible()
  await expect(dataRows(page)).toHaveCount(3)
  await expect(page.getByTestId('draft-status')).toHaveText('1 cell to fix before publishing.')
  await expect(dataRows(page).filter({ hasText: 'Bent wheel' })).toContainText('Not an amount in EUR')
  await expect(page.getByRole('button', { name: 'Publish this price list' })).toBeDisabled()

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(dataRows(page)).toHaveCount(1)
  await page.getByRole('button', { name: 'Redo' }).click()
  await expect(dataRows(page)).toHaveCount(3)
  await editCell(page, 'Bent wheel', 'amount', '90')
  await expect(page.getByTestId('draft-status')).toHaveText('Ready to publish.')

  await preview(page).getByRole('combobox', { name: 'Renter’s language' }).selectOption('de')
  await expect(preview(page).getByText('Bent wheel')).toBeVisible()
  await expect(preview(page).getByText('90,00 €')).toBeVisible()
  await expectFitsEveryWidth(page)

  await page.getByRole('button', { name: 'Publish this price list' }).click()
  await expect(page.getByText('Price list published.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Draft of version 3' })).toBeVisible()
  const versions = page.getByRole('region', { name: 'Versions' }).getByRole('listitem')
  await expect(versions).toHaveCount(2)
  await expect(versions.first()).toContainText('Version 2')
  await expect(versions.first()).toContainText('In force')
  await expect(versions.first()).toContainText('3 prices')
})

test('on a phone, each price of the draft is a card', async ({ page }) => {
  test.setTimeout(120_000)
  await ownerWithPrices(page)
  await openPrices(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(grid(page)).toBeHidden()
  const amount = page.getByRole('textbox', { name: 'Amount, in EUR' })
  await amount.fill('3 5')
  await amount.blur()
  await expect(page.getByText('Not an amount in EUR').locator('visible=true')).toBeVisible()
  await expectFitsEveryWidth(page)
})

for (const theme of ['light', 'dark'] as const) {
  test(`the price list editor passes the accessibility checks in the ${theme} theme`, async ({ page }) => {
    test.setTimeout(120_000)
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await ownerWithPrices(page)
    await openPrices(page)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`)).toEqual([])
  })
}

test('counter staff read every version and the open rentals agreed to it, and cannot publish', async ({ page }) => {
  await page.goto('/sign-in')
  await page.getByRole('region', { name: 'Try the demo shop' }).getByRole('button', { name: 'Start a demo as Jonas, at the counter' }).click()
  await expectInShop(page, 'Ribeira Bikes')
  await page.getByRole('navigation', { name: 'Shop pages' }).getByRole('link', { name: 'Prices' }).click()
  await expect(page.getByText('Only the owner or a manager can publish prices.')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Versions' }).getByRole('listitem').first()).toContainText('9 open rentals agreed to it')
  await expect(page.getByRole('button', { name: 'Publish this price list' })).toHaveCount(0)
})
