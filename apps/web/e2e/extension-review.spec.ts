import type { Browser, Page } from '@playwright/test'
import { expectFitsEveryWidth } from './support/responsive'
import { handedOver, renterBrowser } from './support/rental'
import { expect, test } from './support/test'

// When PayPal does not simply settle the extra days (architecture.md section 6.14): it holds the capture for review, then
// completes or denies it, or it takes another amount than Hold's price. The simulated PayPal does each, and sends the
// shop the signed event PayPal would; Hold reads the payment back before it believes anything.
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } })

const REVIEW = 'Approve, then PayPal holds the payment for review'
const OTHER_AMOUNT = 'Approve, but PayPal takes another amount'

// A rental out with the renter, who asks for one more day and approves it in the simulated PayPal as told.
async function oneMoreDay(page: Page, browser: Browser, shopName: string, approval: string) {
  const { rental, link } = await handedOver(page, browser, shopName)
  const renter = await renterBrowser(browser)
  await renter.goto(link)
  await renter.getByRole('link', { name: 'Keep it longer' }).click()
  const dueBefore = (await renter.getByTestId('due-back').textContent()) ?? ''
  await renter.getByRole('button', { name: '+1 day' }).click()
  await renter.getByRole('button', { name: 'See the price' }).click()
  await renter.getByRole('button', { name: /^Pay .* with PayPal$/ }).click()
  await expect(renter.getByText('Test environment. No money moves.', { exact: false })).toBeVisible()
  const paypal = renter.url()
  await renter.getByRole('button', { name: approval, exact: true }).click()
  return { rental, renter, paypal, dueBefore }
}

const extensions = (page: Page) => page.getByRole('region', { name: 'Extensions' })

test('a payment PayPal holds for review keeps the new end, counts as nothing paid, and is paid once PayPal completes it', async ({ page, browser }) => {
  test.setTimeout(240_000)
  const { rental, renter, paypal, dueBefore } = await oneMoreDay(page, browser, 'Porto Review Bikes', REVIEW)
  await expect(renter.getByText(/^PayPal is reviewing your payment/)).toBeVisible({ timeout: 30_000 })
  await expectFitsEveryWidth(renter)
  await page.goto(rental)
  await expect(extensions(page)).toContainText('being taken by PayPal')

  await renter.goto(paypal)
  await expect(renter.getByRole('heading', { level: 1 })).toHaveText('PayPal is reviewing this payment')
  await renter.getByRole('button', { name: 'Complete the payment' }).click()
  await expect(renter.getByText('Paid. Your new return time is set.')).toBeVisible({ timeout: 30_000 })
  await renter.getByRole('link', { name: 'See your extensions' }).click()
  await expect(renter.getByRole('region', { name: 'Your extensions' })).toContainText('1 more day')
  await expect(renter.getByRole('region', { name: 'Your extensions' })).toContainText('paid')
  await expect(renter.getByTestId('due-back')).not.toHaveText(dueBefore)
  await renter.context().close()
  await page.reload()
  await expect(extensions(page)).toContainText('paid')
})

test('a payment PayPal denies after its review puts the old return time back', async ({ page, browser }) => {
  test.setTimeout(240_000)
  const { rental, renter, paypal, dueBefore } = await oneMoreDay(page, browser, 'Porto Denied Bikes', REVIEW)
  await expect(renter.getByText(/^PayPal is reviewing your payment/)).toBeVisible({ timeout: 30_000 })
  await renter.goto(paypal)
  await renter.getByRole('button', { name: 'Deny the payment' }).click()
  await expect(renter.getByText('PayPal declined the payment. Nothing was charged.')).toBeVisible({ timeout: 30_000 })
  await expect(renter.getByRole('link', { name: 'Choose the time again' })).toBeVisible()
  await expectFitsEveryWidth(renter)
  await renter.getByRole('link', { name: 'See your extensions' }).click()
  await expect(renter.getByRole('region', { name: 'Your extensions' })).toContainText('PayPal refused the payment, so your return time did not change.')
  await expect(renter.getByTestId('due-back')).toHaveText(dueBefore)
  await renter.context().close()
  await page.goto(rental)
  await expect(extensions(page)).toContainText('so the end did not change')
})

test('a capture of another amount than Hold’s price goes to the owner on the decision board, who marks it checked', async ({ page, browser }) => {
  test.setTimeout(240_000)
  const { renter } = await oneMoreDay(page, browser, 'Porto Amount Bikes', OTHER_AMOUNT)
  await renter.context().close()
  await page.getByRole('navigation', { name: 'Shop pages' }).getByRole('link', { name: 'Decisions' }).click()
  const grid = page.getByRole('region', { name: 'Decisions waiting on a person' })
  const row = grid.locator('.ag-row:not(.ag-full-width-row)').filter({ hasText: 'Check an extra-days payment' })
  await expect(row).toContainText('PayPal took €')
  await row.getByRole('button', { name: /^Open the evidence of Check an extra-days payment/ }).click()
  const opened = grid.getByRole('region', { name: /^Check an extra-days payment from / })
  await expect(opened.getByText(/^PayPal took another amount than Hold's price/)).toBeVisible()
  await expect(opened.getByText(/^FAKE-CAPTURE-/)).toBeVisible()
  await expectFitsEveryWidth(page)
  await opened.getByRole('button', { name: 'Mark as checked' }).click()
  await expect(row).toHaveCount(0)
})
