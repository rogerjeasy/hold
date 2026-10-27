import { addVirtualAuthenticator } from './support/passkey'
import { expectNoClippedText, expectNoSidewaysScroll, expectNothingOutsideViewport, expectTouchTargets, viewports } from './support/responsive'
import { expectInShop, newEmail, signUpAs } from './support/sign-in'
import { expect, test } from './support/test'

test('an owner adds a passkey, confirms with it, then sets up prices, staff and PayPal', async ({ page }) => {
  await addVirtualAuthenticator(page)
  await signUpAs(page, newEmail())
  const menu = page.getByRole('navigation', { name: 'Shop pages' })

  // Changing the shop needs a passkey. An emailed code alone is not enough.
  await menu.getByRole('link', { name: 'Staff' }).click()
  await expect(page.getByText('Changing prices, staff or PayPal needs a passkey.', { exact: false })).toBeVisible()
  await page.getByRole('link', { name: 'Add a passkey' }).click()
  await page.getByRole('button', { name: 'Add a passkey on this device' }).click()
  // The list is the lasting proof. "Passkey added." shows only until the page refreshes and asks for the passkey
  // before adding another.
  await expect(page.getByRole('listitem').filter({ hasText: 'Passkey 1' })).toBeVisible()

  await menu.getByRole('link', { name: 'Prices' }).click()
  // The security page has a button of the same name, for adding another passkey. Wait until it has gone.
  await expect(page).toHaveURL(/\/shop\/prices$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Prices')
  await page.getByRole('button', { name: 'Confirm with my passkey' }).click()
  await expect(page).toHaveURL(/\/shop\/prices$/)
  await page.getByLabel('Currency').selectOption('CHF')
  await page.getByLabel('Price 1: what it is for').fill('Deep scratch on the frame')
  await page.getByLabel('Amount, in CHF').fill('35.50')
  await page.getByLabel('What counts as ordinary wear').fill('Light scuffs on the tyres are ordinary wear.')
  await page.getByRole('button', { name: 'Publish this price list' }).click()
  await expect(page.getByText('Price list published.')).toBeVisible()

  await menu.getByRole('link', { name: 'Staff' }).click()
  await page.getByLabel('Their work email').fill('counter@shop.example')
  await page.getByLabel('Largest claim they may approve, in CHF').fill('100')
  await page.getByRole('button', { name: 'Send the invitation' }).click()
  await expect(page.getByText('Invitation sent.')).toBeVisible()
  await expect(page.getByText('counter@shop.example')).toBeVisible()

  await menu.getByRole('link', { name: 'PayPal' }).click()
  await page.getByLabel('Client ID').fill('sandbox-client-id-for-the-test')
  await page.getByLabel('Secret').fill('sandbox-secret-for-the-test')
  await page.getByRole('button', { name: 'Check and connect' }).click()
  await expect(page.getByText('Connected. PayPal accepted the credentials.')).toBeVisible()

  await menu.getByRole('link', { name: 'Today' }).click()
  await expectInShop(page, 'Ribeira Bikes')
  await expect(page.getByRole('region', { name: 'Set up your shop' }).getByText('Done.')).toHaveCount(3)
})

test('the header says "Your shop" once signed in', async ({ page }) => {
  await signUpAs(page, newEmail())
  await page.goto('/')
  await expect(page.getByRole('banner').getByRole('link', { name: 'Your shop' })).toBeVisible()
})

test('a made-up invitation link says so plainly', async ({ page }) => {
  await page.goto('/invite/not-a-real-token')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('This invitation cannot be used.')
  await expect(page.getByText('There is no invitation at this address.')).toBeVisible()
})

for (const path of ['/shop', '/shop/queue', '/shop/security', '/shop/staff', '/shop/prices', '/shop/paypal', '/shop/scorecard'] as const) {
  for (const viewport of viewports) {
    test(`${path} fits a ${viewport.name} wide screen`, async ({ page }) => {
      await signUpAs(page, `long-address-for-wrapping-${newEmail()}`, 'Ribeira Bicicletas e Caiaques do Douro Litoral')
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto(path)
      await expectNoSidewaysScroll(page)
      await expectNothingOutsideViewport(page)
      await expectNoClippedText(page)
      await expectTouchTargets(page)
    })
  }
}

test('an owner fills an empty shop with sample rentals, each marked as a sample', async ({ page }) => {
  await addVirtualAuthenticator(page)
  await signUpAs(page, newEmail())
  await expect(page.getByText('Publish a price list first. The sample claims use its prices.')).toBeVisible()

  await page.goto('/shop/security')
  await page.getByRole('button', { name: 'Add a passkey on this device' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Passkey 1' })).toBeVisible()
  await page.goto('/shop/prices')
  await page.getByRole('button', { name: 'Confirm with my passkey' }).click()
  await page.getByLabel('Currency').selectOption('EUR')
  await page.getByLabel('Price 1: what it is for').fill('Deep scratch on the frame')
  await page.getByLabel('Amount, in EUR').fill('35')
  await page.getByLabel('What counts as ordinary wear').fill('Light scuffs on the tyres are ordinary wear.')
  await page.getByRole('button', { name: 'Publish this price list' }).click()
  await expect(page.getByText('Price list published.')).toBeVisible()

  await page.goto('/shop')
  await page.getByRole('button', { name: 'Add sample rentals' }).click()
  await expect(page.getByRole('note')).toContainText('This shop holds sample rentals.')
  await expect(page.getByRole('heading', { name: 'Claim of €35.00 for Priya Natarajan' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Today at the counter' }).getByRole('listitem')).toHaveCount(5)
  await expect(page.getByRole('button', { name: 'Add sample rentals' })).toHaveCount(0)

  // The full day, at every width.
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await expectNoSidewaysScroll(page)
    await expectNothingOutsideViewport(page)
    await expectNoClippedText(page)
    await expectTouchTargets(page)
  }
})
