import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expectFitsEveryWidth } from './support/responsive'
import { expectInShop } from './support/sign-in'
import { expect, test } from './support/test'

// The fleet passport (extensions.md section 12.5) on AG Grid Enterprise's tree data: each item type with its items
// below it, what their rentals say about each, and which item is wearing fastest, read by plain code from its findings.

async function openItems(page: Page, as: 'Tomás, the owner' | 'Jonas, at the counter' = 'Tomás, the owner'): Promise<void> {
  await page.goto('/sign-in')
  await page.getByRole('region', { name: 'Try the demo shop' }).getByRole('button', { name: `Start a demo as ${as}` }).click()
  await expectInShop(page, 'Ribeira Bikes')
  await page.getByRole('navigation', { name: 'Shop pages' }).getByRole('link', { name: 'Items' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Items')
}

const fleet = (page: Page) => page.getByRole('region', { name: 'Fleet' })
const row = (page: Page, label: string) => fleet(page).locator('.ag-row').filter({ has: page.getByText(label, { exact: true }) })

test('an owner reads the fleet by type: what each item’s rentals cost and recovered, and which one is wearing fastest', async ({ page }) => {
  await openItems(page)
  const hybrid = row(page, 'Hybrid bike')
  await expect(hybrid).toContainText('4 items')
  await expect(hybrid.locator('[col-id="rentals"]')).toHaveText('4')
  await expect(hybrid.locator('[col-id="recovered"]')).toHaveText('€35.00 of €35.00')

  const third = row(page, 'Hybrid bike 3')
  await expect(third).toContainText('Wearing fastest')
  // Hybrid bike 4's one rental found the damage its renter was charged for: as much per rental as Hybrid bike 3.
  await expect(row(page, 'Hybrid bike 4')).toContainText('Wearing fastest')
  await expect(row(page, 'Hybrid bike 4').locator('[col-id="openRepairs"]')).toHaveText('1')
  await expect(third.locator('[col-id="marks"]')).toHaveText('1')
  await expect(third.locator('[col-id="findings"] canvas')).toBeVisible()
  await expect(row(page, 'Hybrid bike 4').locator('[col-id="recovered"]')).toHaveText('€35.00 of €35.00')
  await expect(row(page, 'Gravel bike 2').locator('[col-id="recovered"]')).toHaveText('€0.00 of €45.00')
  await expect(third.locator('[col-id="recovered"]')).toHaveText('—')

  await third.locator('[col-id="rentals"]').click()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hybrid bike 3')
})

test('the right-click menu opens an item’s passport, its status, or its type’s hold, for a type the shop may change', async ({ page }) => {
  await openItems(page)
  await row(page, 'City bike 1').locator('[col-id="rentals"]').click({ button: 'right' })
  const menu = page.locator('.ag-menu')
  await expect(menu.getByRole('menuitem', { name: 'Open the passport' })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: 'Send to repair or retire' })).toBeVisible()
  await menu.getByRole('menuitem', { name: 'Change the hold for City bike' }).click()
  await expect(page).toHaveURL(/\/shop\/items\/types\/[0-9a-f-]{36}#hold$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Edit City bike')

  await page.goBack()
  // A sample type belongs to the sample rentals, so nobody changes its hold.
  await row(page, 'Hybrid bike 3').locator('[col-id="rentals"]').click({ button: 'right' })
  await expect(page.locator('.ag-menu').getByRole('menuitem', { name: 'Open the passport' })).toBeVisible()
  await expect(page.locator('.ag-menu').getByRole('menuitem', { name: /Change the hold/ })).toHaveCount(0)
})

test('the fleet downloads for a spreadsheet, and counter staff read it without the owner’s actions', async ({ page }) => {
  await openItems(page, 'Jonas, at the counter')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download the fleet for a spreadsheet' }).click()
  expect((await download).suggestedFilename()).toBe('hold-fleet.xlsx')
  await row(page, 'City bike 1').locator('[col-id="rentals"]').click({ button: 'right' })
  await expect(page.locator('.ag-menu').getByRole('menuitem', { name: 'Open the passport' })).toBeVisible()
  await expect(page.locator('.ag-menu').getByRole('menuitem', { name: /Change the hold/ })).toHaveCount(0)
})

test('the fleet fits every width, and on a phone each type keeps its list of items', async ({ page }) => {
  await openItems(page)
  await expect(row(page, 'Hybrid bike 3')).toBeVisible()
  await expectFitsEveryWidth(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(fleet(page)).toBeHidden()
  await expect(page.getByRole('region', { name: 'Hybrid bike' }).getByRole('link', { name: 'Hybrid bike 3' })).toBeVisible()
})

// The longest word for where an item is, "En vérification", still fits its column.
test('the fleet in French fits every width', async ({ page }) => {
  await openItems(page)
  await page.goto('/fr/shop/items')
  await expect(page.getByRole('region', { name: 'Flotte' }).getByText('En vérification').first()).toBeVisible()
  await expectFitsEveryWidth(page)
})

for (const theme of ['light', 'dark'] as const) {
  test(`the fleet passes the accessibility checks in the ${theme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await openItems(page)
    await expect(row(page, 'Hybrid bike 3')).toBeVisible()
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`)).toEqual([])
  })
}
