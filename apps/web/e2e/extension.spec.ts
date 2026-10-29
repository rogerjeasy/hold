import { expectFitsEveryWidth } from './support/responsive'
import { handedOver, renterBrowser } from './support/rental'
import { expect, test } from './support/test'

// Keeping the item longer from the renter's phone (architecture.md section 6.14): priced by Hold, paid in PayPal, and
// through at once with nobody at the shop to ask. The hold is never touched.
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } })

test('a renter keeps the item two more days, pays in PayPal, and staff see the new end', async ({ page, browser }) => {
  test.setTimeout(240_000)
  const { rental, link } = await handedOver(page, browser, 'Porto Longer Bikes')
  const renter = await renterBrowser(browser)
  await renter.goto(link)
  await renter.getByRole('link', { name: 'Keep it longer' }).click()
  await expect(renter.getByRole('heading', { level: 1 })).toHaveText('Keep it longer')
  const dueBefore = (await renter.getByTestId('due-back').textContent()) ?? ''
  await expectFitsEveryWidth(renter)
  await renter.getByRole('button', { name: '+2 days' }).click()
  await renter.getByRole('button', { name: 'See the price' }).click()
  await expect(renter.getByRole('region', { name: 'Your price' })).toContainText('2 more days')
  await expect(renter.getByRole('region', { name: 'Your price' })).toContainText('hold stays exactly as it is')
  await expectFitsEveryWidth(renter)
  await renter.getByRole('button', { name: /^Pay .* with PayPal$/ }).click()
  await expect(renter.getByText('Test environment. No money moves.', { exact: false })).toBeVisible()
  await renter.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(renter.getByText('Paid. Your new return time is set.')).toBeVisible({ timeout: 30_000 })
  await expectFitsEveryWidth(renter)
  await renter.getByRole('link', { name: 'See your extensions' }).click()
  await expect(renter.getByRole('region', { name: 'Your extensions' })).toContainText('2 more days')
  await expect(renter.getByTestId('due-back')).not.toHaveText(dueBefore)
  await renter.context().close()

  await page.goto(rental)
  await expect(page.getByRole('region', { name: 'Extensions' })).toContainText('+2 days')
  await expect(page.getByRole('region', { name: 'Extensions' })).toContainText('by the renter on their link')
  await expectFitsEveryWidth(page)

  await page.getByRole('navigation', { name: 'Shop pages' }).getByRole('link', { name: 'Renter self-service' }).click()
  await expect(page.getByRole('region', { name: 'Extensions' })).toContainText('The most extra days a renter may add')
  await expectFitsEveryWidth(page)
})
