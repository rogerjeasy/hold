import type { Browser, Page } from '@playwright/test'
import { expectFitsEveryWidth } from './support/responsive'
import { APPROVE_THEN_DISPUTE, bookAtTheCounter, payFee, renterBrowser } from './support/rental'
import { shopReadyToBook } from './support/shop'
import { expect, test } from './support/test'

// The morning queue (extensions.md section 6), as an owner uses it. The renter pays the fee on the simulated PayPal and
// then disputes the payment, so the "dispute open" detector has a case. In the test environment the run has no model,
// so every entry carries its detector's fixed reason and no draft.

// A rental booked at the counter whose renter paid and then disputed the payment.
async function disputedRental(page: Page, browser: Browser) {
  await bookAtTheCounter(page)
  await page.getByRole('button', { name: 'Show the link' }).click()
  const link = (await page.getByTestId('renter-link').textContent()) ?? ''
  const renter = await renterBrowser(browser)
  await payFee(renter, link, APPROVE_THEN_DISPUTE)
  await renter.context().close()
}

async function checkNow(page: Page) {
  await page.getByRole('navigation', { name: 'Shop pages' }).getByRole('link', { name: 'Morning queue' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Morning queue')
  await page.getByRole('button', { name: 'Check now' }).click()
  await expect(page.getByText('Check started. New entries appear on this page when it finishes.')).toBeVisible()
}

const disputes = (page: Page) => page.getByRole('region', { name: 'PayPal disputes' }).getByRole('article', { name: 'Send this answer to PayPal on the dispute' })

test('a disputed payment is queued, rejected with a reason, and the confirmed rule keeps the next one off the queue (X1.9)', async ({ page, browser }) => {
  test.setTimeout(240_000)
  await shopReadyToBook(page, 'Porto Queue Bikes')
  await disputedRental(page, browser)
  await checkNow(page)
  const entry = disputes(page)
  await expect(entry).toHaveCount(1)
  await expect(page.getByTestId('queue-brief')).toHaveText('1 decision waits, and none expires today.')
  await expect(entry.getByText('A PayPal dispute is waiting for a response.')).toBeVisible()
  await expect(entry.getByText('Not investigated')).toBeVisible()
  await expect(entry.getByText('PayPal could not be checked')).toBeVisible()
  await expectFitsEveryWidth(page)

  // Approving is refused plainly: there is no draft answer to send, and nothing changes.
  await entry.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(entry.getByText('There is no draft to send. Reject it, or write to the renter yourself.')).toBeVisible()

  await entry.getByText('Reject with a reason').click()
  await entry.getByLabel('Why not?').fill('I answer disputes myself in PayPal.')
  await entry.getByRole('button', { name: 'Reject', exact: true }).click()
  await expect(disputes(page)).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Decided in the last day' }).getByText('Reason given: I answer disputes myself in PayPal.')).toBeVisible()
  const rules = page.getByRole('region', { name: 'Rules from your rejections' })
  await expect(rules.getByText('Do not propose answering a dispute.')).toBeVisible()
  await rules.getByRole('button', { name: 'Confirm this rule' }).click()
  await expect(rules.getByText('Confirmed', { exact: true })).toBeVisible()
  await expectFitsEveryWidth(page)

  // A second disputed payment: without the rule it would be queued too.
  await disputedRental(page, browser)
  await checkNow(page)
  await expect(page.getByTestId('queue-brief')).toHaveText('Nothing waits for a decision.')
  await expect(disputes(page)).toHaveCount(0)
})

test('an owner postpones an entry, which leaves the queue until tomorrow', async ({ page, browser }) => {
  test.setTimeout(180_000)
  await shopReadyToBook(page, 'Braga Queue Bikes')
  await disputedRental(page, browser)
  await checkNow(page)
  await disputes(page).getByRole('button', { name: 'Postpone until tomorrow' }).click()
  await expect(disputes(page)).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Decided in the last day' }).getByText('Postponed · Send this answer to PayPal on the dispute')).toBeVisible()
})
