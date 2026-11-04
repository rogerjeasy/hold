import { expectFitsEveryWidth } from './support/responsive'
import { expectInShop } from './support/sign-in'
import { expect, test } from './support/test'

// A judge has Claude compare the demonstration's photographs on the sample return that waits for its comparison, with
// no PayPal login (architecture.md section 20.3). The test environment's model is the simulated stand-in, so once
// started the comparison shows the chip code found, worded by the stand-in, and says no model answered.
test('counter staff start the real comparison on the sample return, and the page says what came of it', async ({ page }) => {
  await page.goto('/sign-in')
  await page.getByRole('region', { name: 'Try the demo shop' }).getByRole('button', { name: 'Start a demo as Jonas, at the counter' }).click()
  await expectInShop(page, 'Ribeira Bikes')
  await page.getByRole('navigation', { name: 'Shop pages' }).getByRole('link', { name: 'Rentals' }).click()
  await page.getByRole('link', { name: /Marco Rossi/ }).first().click()
  await page.getByRole('link', { name: 'Review comparison' }).click()
  await expect(page.getByRole('heading', { name: 'Watch Claude compare these photographs' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Frame left' })).toBeVisible()
  await expectFitsEveryWidth(page)
  await page.getByRole('button', { name: 'Run the real comparison on this sample' }).click()
  await expect(page.getByRole('heading', { name: 'Findings', exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Simulated comparison', { exact: true })).toBeVisible()
  await expect(page.getByText('1 mark found', { exact: true })).toBeVisible()
  await expect(page.getByText('Model: simulated. Prompt: inspection-3.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Run the real comparison on this sample' })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Findings', exact: true })).toBeVisible()
  await expectFitsEveryWidth(page)
})
