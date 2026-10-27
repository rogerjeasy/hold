import { addVirtualAuthenticator } from './support/passkey'
import { expectInShop } from './support/sign-in'
import { expect, test } from './support/test'

// The demo shop judges use (architecture.md section 20.3). The test environment builds it when the server starts,
// as the reset script builds it deployed.

test('a judge signs in as the demo owner with one tap, and finds the shop already busy', async ({ page }) => {
  await page.goto('/sign-in')
  await page.getByRole('region', { name: 'Try the demo shop' }).getByRole('button', { name: 'Sign in as Tomás, the owner' }).click()
  await expectInShop(page, 'Ribeira Bikes')
  await expect(page.getByRole('button', { name: 'Account of Tomás' })).toContainText('tomas.demo@hold.example')
  await expect(page.getByText('Priya Natarajan').first()).toBeVisible()
})

test('a judge signs in as the demo counter staff with one tap', async ({ page }) => {
  await page.goto('/sign-in')
  await page.getByRole('button', { name: 'Sign in as Jonas, at the counter' }).click()
  await expectInShop(page, 'Ribeira Bikes')
  await expect(page.getByRole('button', { name: 'Account of Jonas' })).toBeVisible()
})

test('each judge adds a passkey of their own to the shared demo owner, then confirms with it', async ({ browser }) => {
  for (const judge of ['first', 'second']) {
    const context = await browser.newContext()
    const page = await context.newPage()
    await addVirtualAuthenticator(page)
    await page.goto('/sign-in')
    await page.getByRole('button', { name: 'Sign in as Tomás, the owner' }).click()
    await expectInShop(page, 'Ribeira Bikes')
    await page.goto('/shop/prices')
    // The first judge finds no passkey on the account. The second finds the first judge's, which is on another device.
    await page.getByRole('link', { name: judge === 'first' ? 'Add a passkey' : 'No passkey on this device? Add one' }).click()
    await expect(page).toHaveURL(/\/shop\/security$/)
    await page.getByRole('button', { name: 'Add a passkey on this device' }).click()
    await expect(page.getByRole('listitem').filter({ hasText: judge === 'first' ? 'Passkey 1' : 'Passkey 2' })).toBeVisible()
    await page.goto('/shop/prices')
    await page.getByRole('button', { name: 'Confirm with my passkey' }).click()
    await expect(page.getByRole('button', { name: 'Publish this price list' })).toBeVisible()
    await context.close()
  }
})
