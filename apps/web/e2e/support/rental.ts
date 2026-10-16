import type { Browser, Page } from '@playwright/test'
import { shopReadyToBook } from './shop'
import { expect } from './test'

// A rental through the counter, as staff and a renter on their own phone do it: booked, its fee paid, and its hold
// placed. Shared by the rental and handover tests.

// The renter opens their link in a browser of their own: no shop session, as on their phone.
export async function renterBrowser(browser: Browser): Promise<Page> {
  return (await browser.newContext()).newPage()
}

export async function bookAtTheCounter(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Shop pages' }).getByRole('link', { name: 'Rentals' }).click()
  await page.getByRole('link', { name: 'New rental' }).first().click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('New rental')
  await page.getByRole('button', { name: 'One more City e-bike' }).click()
  await page.getByLabel('Name').fill('Priya Natarajan')
  await page.getByLabel('Email').fill('priya@renter.example')
  await page.getByRole('button', { name: 'Book', exact: true }).click()
  await expect(page).toHaveURL(/\/shop\/rentals\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Priya Natarajan')
}

// From the renter's link through the simulated PayPal and back, to a booked rental.
export async function payFee(renter: Page, link: string): Promise<void> {
  await renter.goto(link)
  await expect(renter.getByRole('region', { name: 'Two amounts, kept apart' })).toContainText('This is not a charge')
  await renter.getByRole('button', { name: /^Pay .* with PayPal$/ }).click()
  await expect(renter.getByText('Test environment. No money moves.', { exact: false })).toBeVisible()
  await renter.getByRole('button', { name: 'Approve' }).click()
  await expect(renter.getByText('Payment confirmed. Your rental is booked.')).toBeVisible()
  await renter.getByRole('link', { name: 'See your rental' }).click()
  await expect(renter.getByText('Booked. Your fee is paid.')).toBeVisible()
}

// A rental ready for handover: booked at the counter, fee paid and hold approved by the renter. Ends on its page.
export async function readyForHandover(page: Page, browser: Browser, shopName: string): Promise<void> {
  await shopReadyToBook(page, shopName)
  await bookAtTheCounter(page)
  await page.getByRole('button', { name: 'Show the link' }).click()
  const link = (await page.getByTestId('renter-link').textContent()) ?? ''
  const renter = await renterBrowser(browser)
  await payFee(renter, link)
  await page.reload()
  const hold = page.getByRole('region', { name: 'Hold at pickup' })
  await hold.getByRole('button', { name: 'Ask for the hold' }).click()
  const holdLink = (await hold.getByTestId('renter-link').textContent()) ?? ''
  await renter.goto(holdLink)
  await renter.getByRole('button', { name: /^Approve .* with PayPal$/ }).click()
  await renter.getByRole('button', { name: 'Approve' }).click()
  await expect(renter.getByText('Hold placed. Nothing was charged.')).toBeVisible()
  await renter.context().close()
  await expect(hold.getByText('Ready for handover.')).toBeVisible({ timeout: 15_000 })
}
