import type { Browser, Page } from '@playwright/test'
import { expectFitsEveryWidth } from './support/responsive'
import { shopReadyToBook } from './support/shop'
import { expect, test } from './support/test'

// The renter opens their link in a browser of their own: no shop session, as on their phone.
async function renterBrowser(browser: Browser): Promise<Page> {
  return (await browser.newContext()).newPage()
}

async function bookAtTheCounter(page: Page): Promise<void> {
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
async function payFee(renter: Page, link: string): Promise<void> {
  await renter.goto(link)
  await expect(renter.getByRole('region', { name: 'Two amounts, kept apart' })).toContainText('This is not a charge')
  await renter.getByRole('button', { name: /^Pay .* with PayPal$/ }).click()
  await expect(renter.getByText('Test environment. No money moves.', { exact: false })).toBeVisible()
  await renter.getByRole('button', { name: 'Approve' }).click()
  await expect(renter.getByText('Payment confirmed. Your rental is booked.')).toBeVisible()
  await renter.getByRole('link', { name: 'See your rental' }).click()
  await expect(renter.getByText('Booked. Your fee is paid.')).toBeVisible()
}

test('staff book at the counter, the renter pays the fee from the link, and the rental is booked', async ({ page, browser }) => {
  await shopReadyToBook(page)
  await bookAtTheCounter(page)
  await expect(page.getByText('Waiting for the fee').first()).toBeVisible()

  await page.getByRole('button', { name: 'Show the link' }).click()
  await expect(page.getByText("Scan with the renter's phone")).toBeVisible()
  const link = (await page.getByTestId('renter-link').textContent()) ?? ''
  expect(link).toMatch(/\/r\/[A-Za-z0-9_-]{65}$/)

  const renter = await renterBrowser(browser)
  await payFee(renter, link)
  await renter.context().close()

  await page.reload()
  await expect(page.getByRole('region', { name: 'Progress' }).getByText('Done')).toHaveCount(2)
  await expect(page.getByText('Fee paid').first()).toBeVisible()
})

test('a renter books on the shop’s own page with nobody signed in, and pays', async ({ page, browser }) => {
  await shopReadyToBook(page, 'Douro Kayak Hire')
  await page.getByRole('navigation', { name: 'Shop pages' }).getByRole('link', { name: 'Rentals' }).click()
  const shopPage = (await page.getByRole('link', { name: /\/s\/douro-kayak-hire/ }).textContent()) ?? ''

  const renter = await renterBrowser(browser)
  await renter.goto(shopPage)
  await expect(renter.getByRole('heading', { level: 1 })).toHaveText('Rent from Douro Kayak Hire')
  await renter.getByRole('button', { name: 'One more City e-bike' }).click()
  await renter.getByRole('button', { name: 'Book and pay the fee' }).click()
  await expect(renter).toHaveURL(/\/r\/[A-Za-z0-9_-]{65}$/)
  await payFee(renter, renter.url())
  await renter.context().close()

  await page.reload()
  await expect(page.getByRole('listitem', { name: 'Fake Renter' })).toContainText("Booked on the shop's page")
})

test('a changed link shows nothing of the rental', async ({ browser }) => {
  const renter = await renterBrowser(browser)
  await renter.goto('/r/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
  await expect(renter.getByRole('heading', { level: 1 })).toHaveText('This link cannot be used')
  await renter.context().close()
})

test('the booking pages fit every width', async ({ page, browser }) => {
  await shopReadyToBook(page, 'Ribeira Bicicletas e Caiaques do Douro Litoral')
  await page.getByRole('navigation', { name: 'Shop pages' }).getByRole('link', { name: 'Rentals' }).click()
  await page.getByRole('link', { name: 'New rental' }).first().click()
  await page.getByRole('button', { name: 'One more City e-bike' }).click()
  await expectFitsEveryWidth(page)

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.getByLabel('Name').fill('Maria da Conceição Albuquerque-Vasconcelos')
  await page.getByLabel('Email').fill('maria.da.conceicao.albuquerque-vasconcelos@a-very-long-domain.example')
  await page.getByRole('button', { name: 'Book', exact: true }).click()
  await expect(page).toHaveURL(/\/shop\/rentals\/[0-9a-f-]{36}$/)
  await page.getByRole('button', { name: 'Show the link' }).click()
  await expect(page.getByRole('img', { name: "Scan with the renter's phone" })).toBeVisible()
  await expectFitsEveryWidth(page)
  const link = (await page.getByTestId('renter-link').textContent()) ?? ''

  await page.getByRole('link', { name: 'All rentals' }).click()
  await expectFitsEveryWidth(page)
  const shopPage = (await page.getByRole('link', { name: /\/s\// }).textContent()) ?? ''

  const renter = await renterBrowser(browser)
  await renter.goto(link)
  await expectFitsEveryWidth(renter)
  await renter.goto(shopPage)
  await renter.getByRole('button', { name: 'One more City e-bike' }).click()
  await expectFitsEveryWidth(renter)
  await renter.context().close()
})

test('a renter who approves the fee in PayPal and never comes back is still booked, from PayPal’s event', async ({ page, browser }) => {
  await shopReadyToBook(page, 'Porto Bike Hire')
  await bookAtTheCounter(page)
  await page.getByRole('button', { name: 'Show the link' }).click()
  const link = (await page.getByTestId('renter-link').textContent()) ?? ''

  const renter = await renterBrowser(browser)
  await renter.goto(link)
  await renter.getByRole('button', { name: /^Pay .* with PayPal$/ }).click()
  await expect(renter.getByRole('button', { name: 'Approve' })).toBeVisible()
  // The renter approves and closes the page: PayPal's redirect back to Hold is never followed.
  const orderId = renter.url().split('/').at(-1) ?? ''
  const approved = await renter.request.post(`/simulated-paypal/${orderId}/approve`, { maxRedirects: 0 })
  expect(approved.status()).toBe(303)
  await renter.context().close()

  await page.reload()
  await expect(page.getByRole('region', { name: 'Progress' }).getByText('Done')).toHaveCount(2)
})
