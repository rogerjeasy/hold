import type { Browser, Page } from '@playwright/test'
import { shopReadyToBook } from './shop'
import { expect } from './test'

// A rental through the counter, as staff and a renter on their own phone do it: booked, its fee paid, and its hold
// placed. Shared by the rental and handover tests.

// The renter opens their link in a browser of their own: no shop session, as on their phone.
export async function renterBrowser(browser: Browser): Promise<Page> {
  return (await browser.newContext()).newPage()
}

export async function bookAtTheCounter(page: Page, itemType = 'City e-bike'): Promise<void> {
  await page.getByRole('navigation', { name: 'Shop pages' }).getByRole('link', { name: 'Rentals' }).click()
  await page.getByRole('link', { name: 'New rental' }).first().click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('New rental')
  await page.getByRole('button', { name: `One more ${itemType}` }).click()
  await page.getByLabel('Name').fill('Priya Natarajan')
  await page.getByLabel('Email').fill('priya@renter.example')
  await page.getByRole('button', { name: 'Book', exact: true }).click()
  await expect(page).toHaveURL(/\/shop\/rentals\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Priya Natarajan')
}

// The simulated PayPal's second button: the renter pays, then disputes the payment with PayPal.
export const APPROVE_THEN_DISPUTE = 'Approve, then dispute this payment'

// From the renter's link through the simulated PayPal and back, to a booked rental.
export async function payFee(renter: Page, link: string, approval = 'Approve'): Promise<void> {
  await renter.goto(link)
  await expect(renter.getByRole('region', { name: 'Two amounts, kept apart' })).toContainText('This is not a charge')
  await renter.getByRole('button', { name: /^Pay .* with PayPal$/ }).click()
  await expect(renter.getByText('Test environment. No money moves.', { exact: false })).toBeVisible()
  await renter.getByRole('button', { name: approval, exact: true }).click()
  await expect(renter.getByText('Payment confirmed. Your rental is booked.')).toBeVisible()
  await renter.getByRole('link', { name: 'See your rental' }).click()
  await expect(renter.getByText('Booked. Your fee is paid.')).toBeVisible()
}

// A rental ready for handover: booked at the counter, fee paid and hold approved by the renter. Ends on its page.
export async function readyForHandover(page: Page, browser: Browser, shopName: string): Promise<void> {
  await shopReadyToBook(page, shopName)
  await bookAtTheCounter(page)
  await feePaidAndHoldPlaced(page, browser)
}

// From a booked rental's page: the renter pays the fee, then approves the hold. Ends on the rental's page.
export async function feePaidAndHoldPlaced(page: Page, browser: Browser): Promise<void> {
  await page.getByRole('button', { name: 'Show the link' }).click()
  const link = (await page.getByTestId('renter-link').textContent()) ?? ''
  const renter = await renterBrowser(browser)
  await payFee(renter, link)
  await placeHold(page, renter)
  await renter.context().close()
}

// From a rental's page whose fee is paid: staff ask for the hold and the renter approves it in PayPal. Ends on the
// rental's page, ready for handover.
export async function placeHold(page: Page, renter: Page): Promise<void> {
  await page.reload()
  const hold = page.getByRole('region', { name: 'Hold at pickup' })
  await hold.getByRole('button', { name: 'Ask for the hold' }).click()
  const holdLink = (await hold.getByTestId('renter-link').textContent()) ?? ''
  await renter.goto(holdLink)
  await renter.getByRole('button', { name: /^Approve .* with PayPal$/ }).click()
  await renter.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(renter.getByText('Hold placed. Nothing was charged.')).toBeVisible()
  await expect(hold.getByText('Ready for handover.')).toBeVisible({ timeout: 15_000 })
}

// A rental handed over with the sample photographs, so it is out with the renter. Gives its page and the renter's link.
export async function handedOver(page: Page, browser: Browser, shopName: string): Promise<{ readonly rental: string; readonly link: string }> {
  await readyForHandover(page, browser, shopName)
  const rental = page.url()
  await page.getByRole('region', { name: 'Handover' }).getByRole('button', { name: /^Photograph / }).click()
  await expect(page).toHaveURL(/\/handover\/[0-9a-f-]{36}$/)
  const views = page.getByRole('list', { name: 'Views' })
  await expect(views).toBeVisible()
  const needed = await views.getByText('Needed').count()
  for (let count = 1; count <= needed; count += 1) {
    await page.getByRole('button', { name: 'Use the sample photograph' }).click()
    await expect(views.getByText('Photographed')).toHaveCount(count, { timeout: 30_000 })
  }
  await page.getByRole('button', { name: 'Seal the photographs' }).click()
  await expect(page.getByText('The rental is out.')).toBeVisible()
  await page.goto(rental)
  await page.getByRole('button', { name: 'Show the link' }).click()
  return { rental, link: (await page.getByTestId('renter-link').textContent()) ?? '' }
}
