import { expectFitsEveryWidth } from './support/responsive'
import { bookAtTheCounter, feePaidAndHoldPlaced, payFee, renterBrowser } from './support/rental'
import { shopReadyToBook } from './support/shop'
import { expectInShop } from './support/sign-in'
import { expect, test } from './support/test'

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
  await expect(renter.getByRole('button', { name: 'Approve', exact: true })).toBeVisible()
  // The renter approves and closes the page: PayPal's redirect back to Hold is never followed.
  const orderId = renter.url().split('/').at(-1) ?? ''
  const approved = await renter.request.post(`/simulated-paypal/${orderId}/approve`, { maxRedirects: 0 })
  expect(approved.status()).toBe(303)
  await renter.context().close()

  await page.reload()
  await expect(page.getByRole('region', { name: 'Progress' }).getByText('Done')).toHaveCount(2)
})

test('at pickup, staff ask for the hold, the renter approves it on their own phone, and the rental is ready', async ({ page, browser }) => {
  await shopReadyToBook(page, 'Lisbon Pickup Bikes')
  await bookAtTheCounter(page)
  await page.getByRole('button', { name: 'Show the link' }).click()
  const link = (await page.getByTestId('renter-link').textContent()) ?? ''
  const renter = await renterBrowser(browser)
  await payFee(renter, link)

  await page.reload()
  const hold = page.getByRole('region', { name: 'Hold at pickup' })
  await hold.getByRole('button', { name: 'Ask for the hold' }).click()
  await expect(hold.getByRole('img', { name: "Scan with the renter's phone to approve the hold" })).toBeVisible()
  await expect(hold.getByRole('status')).toContainText('Waiting for the renter to approve')
  // On a phone at the counter, what staff act on comes before the terms.
  await page.setViewportSize({ width: 390, height: 844 })
  // Both read at once, against the page rather than the window, so a scroll between two reads cannot swap them.
  const terms = page.getByRole('region', { name: 'Terms' })
  const holdTop = await hold.evaluate((element) => element.getBoundingClientRect().top + window.scrollY)
  const termsTop = await terms.evaluate((element) => element.getBoundingClientRect().top + window.scrollY)
  expect(holdTop).toBeLessThan(termsTop)
  await expectFitsEveryWidth(page)
  const holdLink = (await hold.getByTestId('renter-link').textContent()) ?? ''
  expect(holdLink).toMatch(/\/r\/[A-Za-z0-9_-]{65}\/pay$/)

  await renter.goto(holdLink)
  await expect(renter.getByRole('heading', { level: 1 })).toHaveText('Approve your hold')
  await expect(renter.getByText('It is not a charge', { exact: false })).toBeVisible()
  await expectFitsEveryWidth(renter)
  await renter.getByRole('button', { name: /^Approve .* with PayPal$/ }).click()
  await renter.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(renter.getByText('Hold placed. Nothing was charged.')).toBeVisible()
  await expectFitsEveryWidth(renter)
  await renter.getByRole('link', { name: 'See your rental' }).click()
  await expect(renter.getByText('Your hold is placed. You can collect your items.')).toBeVisible()
  await renter.context().close()

  // The staff page looks again by itself while it waits at the counter.
  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(hold.getByText('Ready for handover.')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('region', { name: 'Progress' }).getByText('Done')).toHaveCount(3)
  await expectFitsEveryWidth(page)
})

// The PayPal record (architecture.md section 11.9): each call with PayPal's ids, its status and the PayPal-Request-Id,
// read back before it shows. The ids are long and unbroken, so the page must still fit every width.
test('the rental page shows each PayPal call with its ids and PayPal-Request-Id, and fits every width', async ({ page, browser }) => {
  await shopReadyToBook(page, 'Ribeira Bicicletas e Caiaques do Douro Litoral')
  await bookAtTheCounter(page)
  await feePaidAndHoldPlaced(page, browser)
  const record = page.getByRole('region', { name: 'PayPal record' })
  await expect(record.getByRole('listitem')).toHaveCount(2)
  await expect(record.getByRole('listitem').first()).toContainText('Fee captured')
  await expect(record.getByRole('listitem').nth(1)).toContainText('Hold placed')
  await expect(record.getByRole('listitem').nth(1)).toContainText('CREATED')
  await expect(record.getByText('PayPal-Request-Id', { exact: true })).toHaveCount(2)
  await expectFitsEveryWidth(page)
})

// On a slow server the first tap on "New rental" seemed to do nothing, and a judge tapped again (audit finding JW-L10):
// the page answers at once with its outline, while the booking form is read.
test('the first tap on New rental answers at once, even while the server is slow', async ({ page }) => {
  await page.goto('/sign-in')
  await page.getByRole('region', { name: 'Try the demo shop' }).getByRole('button', { name: 'Start a demo as Jonas, at the counter' }).click()
  await expectInShop(page, 'Ribeira Bikes')
  await page.getByRole('navigation', { name: 'Shop pages' }).getByRole('link', { name: 'Rentals' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rentals')
  await page.route('**/shop/rentals/new**', async (route) => {
    if (route.request().headers()['rsc'] !== undefined) await new Promise((resolve) => setTimeout(resolve, 5000))
    await route.continue()
  })
  await page.getByRole('link', { name: 'New rental' }).locator('visible=true').first().click()
  await expect(page.getByRole('status').filter({ hasText: 'Loading the page…' })).toBeVisible({ timeout: 2000 })
  await expect(page).toHaveURL(/\/shop\/rentals\/new/)
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Rentals')
})
