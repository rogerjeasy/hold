import type { Page } from '@playwright/test'
import { expectFitsEveryWidth } from './support/responsive'
import { expectInShop } from './support/sign-in'
import { expect, test } from './support/test'

// Repair closes the loop (architecture.md section 9.6): the demo shop's charged sample claim opened a repair for the
// damage paid for. Staff find it on the decision board, photograph the repaired view on the item's passport and close
// it with its cost; the mark leaves the passport and the cost is set against the claim.

async function startDemo(page: Page): Promise<void> {
  await page.goto('/sign-in')
  await page.getByRole('region', { name: 'Try the demo shop' }).getByRole('button', { name: 'Start a demo as Jonas, at the counter' }).click()
  await expectInShop(page, 'Ribeira Bikes')
}

test('staff photograph and close the repair a charge opened, and the passport shows it repaired', async ({ page }) => {
  test.setTimeout(180000)
  await startDemo(page)
  await page.getByRole('navigation', { name: 'Shop pages' }).getByRole('link', { name: 'Decisions' }).click()
  const grid = page.getByRole('region', { name: 'Decisions waiting on a person' })
  const row = grid.locator('.ag-row:not(.ag-full-width-row)').filter({ hasText: /^Repair / })
  await expect(row).toContainText('From Daniel Ortiz’s charged claim')
  await row.getByRole('button', { name: /^Open the evidence of Repair / }).click()
  await grid.getByRole('link', { name: 'Open the item’s passport' }).click()

  await expect(page.getByRole('heading', { name: 'Repair to do' })).toBeVisible()
  await expect(page.getByText('From Daniel Ortiz’s charged claim', { exact: false })).toBeVisible()
  await expectFitsEveryWidth(page)
  await page.getByRole('button', { name: 'Photograph the repair' }).click()
  await expect(page).toHaveURL(/\/shop\/items\/[0-9a-f-]{36}\/repairs\/[0-9a-f-]{36}$/)
  await expect(page.getByText('Where the mark was')).toBeVisible()
  await expectFitsEveryWidth(page)
  await page.getByRole('button', { name: 'Use the sample photograph' }).click()
  await expect(page.getByRole('button', { name: 'Close the repair' })).toBeEnabled({ timeout: 30000 })
  await page.getByLabel('What the repair cost, in EUR').fill('38.00')
  await page.getByLabel('Note (optional)').fill('Touched up and lacquered.')
  await page.getByRole('button', { name: 'Close the repair' }).click()
  await expect(page.getByText('Repair closed')).toBeVisible()
  await expect(page.getByText('€38.00')).toBeVisible()
  await expectFitsEveryWidth(page)

  await page.getByRole('link', { name: 'Back to the passport' }).click()
  await expect(page.getByRole('heading', { name: 'Repairs' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Repair to do' })).toHaveCount(0)
  await expect(page.getByText(/Repaired \w+ \d+/).first()).toBeVisible()
  await expectFitsEveryWidth(page)
})
