import type { Page } from '@playwright/test'
import { expectFitsEveryWidth } from './support/responsive'
import { bookAtTheCounter, renterBrowser } from './support/rental'
import { shopReadyToBook } from './support/shop'
import { expectInShop } from './support/sign-in'
import { expect, test } from './support/test'

// A renter chooses texts on their own phone (architecture.md section 12.3). A demo shop shows each text on the renter's
// page, labelled, instead of sending it.

async function startDemo(page: Page): Promise<void> {
  await page.goto('/sign-in')
  await page.getByRole('region', { name: 'Try the demo shop' }).getByRole('button', { name: 'Start a demo as Jonas, at the counter' }).click()
  await expectInShop(page, 'Ribeira Bikes')
}

test('a tourist chooses texts on their own phone, sees the text the demo did not send, and confirms the number with its code', async ({ page, browser }) => {
  test.setTimeout(180000)
  await startDemo(page)
  await bookAtTheCounter(page, 'City bike')
  await page.getByRole('button', { name: 'Show the link' }).click()
  const link = (await page.getByTestId('renter-link').textContent()) ?? ''
  const renter = await renterBrowser(browser)
  await renter.goto(link)

  const panel = renter.getByRole('region', { name: 'How we reach you' })
  await expect(panel).toContainText('By email')
  await panel.getByRole('button', { name: 'Text me instead' }).click()
  const phone = panel.getByLabel('Your mobile number, with its country code')
  await phone.fill('+41 79 123 45 67')
  await panel.getByRole('button', { name: 'Text me a code' }).click()
  const shown = panel.getByRole('figure', { name: 'Sandbox: this text was not sent. It is what the renter would receive.' })
  await expect(shown).toContainText('confirms this phone for texts about your rental')
  await expectFitsEveryWidth(renter)
  await shown.getByRole('button', { name: /^Use the code \d{8}$/ }).click()
  await panel.getByRole('button', { name: 'Confirm this phone' }).click()
  await expect(panel.getByRole('status')).toHaveText('Texts about this rental now go to +41 ••• •• 67.')
  await renter.reload()
  await expect(panel).toContainText('By text to +41 ••• •• 67')
  await expect(panel).toContainText('Confirmed')
  await expectFitsEveryWidth(renter)
  await renter.context().close()

  // Staff see the text on the rental, number masked, and send the next link the same way.
  await page.reload()
  await expect(page.getByRole('region', { name: 'Texts to the renter' })).toContainText('The code that confirms their phone')
  await expect(page.getByRole('button', { name: 'Text it to +41 ••• •• 67' })).toBeVisible()
  await expectFitsEveryWidth(page)
})

test('staff book a tourist with only a phone, and the link goes by text', async ({ page }) => {
  await shopReadyToBook(page, 'Text Bikes')
  await page.getByRole('navigation', { name: 'Shop pages' }).getByRole('link', { name: 'Rentals' }).click()
  await page.getByRole('link', { name: 'New rental' }).first().click()
  await page.getByRole('button', { name: 'One more City e-bike' }).click()
  await page.getByLabel('Name').fill('Priya Natarajan')
  await page.getByLabel('Mobile phone').fill('079 123 45 67')
  await page.getByRole('button', { name: 'Book', exact: true }).click()
  await expect(page.getByText('Write the number with its country code')).toBeVisible()
  await page.getByLabel('Mobile phone').fill('+41 79 123 45 67')
  await page.getByRole('button', { name: 'Book', exact: true }).click()
  await expect(page).toHaveURL(/\/shop\/rentals\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('region', { name: 'Texts to the renter' })).toContainText('The renter’s link')
  await expect(page.getByRole('button', { name: 'Text it to +41 ••• •• 67' })).toBeVisible()
})
