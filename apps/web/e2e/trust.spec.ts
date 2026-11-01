import { expectFitsEveryWidth } from './support/responsive'
import { bookAtTheCounter, payFee, renterBrowser } from './support/rental'
import { shopReadyToBook } from './support/shop'
import { expect, test } from './support/test'

// The test environment's mailer is not read here: every emailed code is this one (server/services.ts).
const EMAILED_CODE = '24681357'

test('the owner replays a trust ladder over past rentals and publishes it, and the page fits every width', async ({ page }) => {
  await shopReadyToBook(page)
  await page.getByRole('navigation', { name: 'Shop pages' }).getByRole('link', { name: 'Trust ladder' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Trust ladder')
  await expect(page.getByText('No trust ladder is published. Every renter is held for the ordinary amount.')).toBeVisible()
  await expect(page.getByText(/Hold does not keep saved PayPal methods yet/)).toBeVisible()

  await page.getByRole('button', { name: 'Replay over past rentals' }).click()
  await expect(page.getByText('Replayed over 0 past rentals')).toBeVisible()
  await page.getByRole('radio', { name: "This shop's and other Hold shops', when the renter consents" }).check()
  await page.getByRole('button', { name: 'Publish this trust ladder' }).click()
  await expect(page.getByText('Trust ladder published.')).toBeVisible()
  await page.reload()
  await expect(page.getByText(/Version 1 is published/)).toBeVisible()
  await expect(page.getByText('3 clean returns: 75% of the hold, for items of any value')).toBeVisible()
  await expectFitsEveryWidth(page)
})

test('a renter answers the consent question with their emailed code, shows their Clean Record, and anyone checks it', async ({ page, browser }) => {
  await shopReadyToBook(page)
  await bookAtTheCounter(page)
  await page.getByRole('button', { name: 'Show the link' }).click()
  const link = (await page.getByTestId('renter-link').textContent()) ?? ''
  const renter = await renterBrowser(browser)
  await payFee(renter, link)

  await renter.goto(link)
  await expect(renter.getByText('Use my record of clean returns to lower future holds at Hold shops.')).toBeVisible()
  await renter.getByRole('link', { name: 'Your Clean Record' }).click()
  await expect(renter.getByRole('heading', { level: 1 })).toHaveText('Your Clean Record')
  await expectFitsEveryWidth(renter)

  const consent = renter.getByRole('region', { name: 'Other Hold shops' })
  await consent.getByRole('button', { name: 'Yes, use it' }).click()
  await expect(consent.getByLabel('Your code')).toBeFocused()
  await consent.getByRole('button', { name: 'Send me a code' }).click()
  await expect(consent.getByText('Code sent. It works for ten minutes.')).toBeVisible()
  await consent.getByLabel('Your code').fill('11111111')
  await consent.getByRole('button', { name: 'Yes, use it' }).click()
  await expect(consent.getByRole('alert').filter({ hasText: 'That code is not right. Check the email and try again.' })).toBeVisible()
  await consent.getByLabel('Your code').fill(EMAILED_CODE)
  await consent.getByRole('button', { name: 'Yes, use it' }).click()
  await expect(consent.getByText('Other Hold shops may use your record to lower your hold.')).toBeVisible()

  await renter.reload()
  await expect(renter.getByRole('img', { name: 'Scan to check this Clean Record' })).toBeVisible()
  const credential = (await renter.getByTestId('credential').textContent()) ?? ''
  await renter.context().close()

  const checker = await renterBrowser(browser)
  await checker.goto(`/verify#${credential}`)
  await expect(checker.getByText(/Signed by Hold\. Valid until/)).toBeVisible()
  await expect(checker.getByRole('region', { name: 'Rentals in the last 24 months' })).toBeVisible()
  await expectFitsEveryWidth(checker)
  await checker.getByLabel('Credential').fill(`${credential.slice(0, -4)}AAAA`)
  await checker.getByRole('button', { name: 'Check' }).click()
  await expect(checker.getByRole('alert').filter({ hasText: 'This credential was changed after Hold signed it.' })).toBeVisible()
  await checker.context().close()
})

test('the public key that checks credentials is published at a well-known address', async ({ request }) => {
  const response = await request.get('/.well-known/jwks.json')
  expect(response.ok()).toBe(true)
  const { keys } = (await response.json()) as { keys: { kty: string; crv: string; alg: string; kid: string; d?: string }[] }
  expect(keys).toHaveLength(1)
  expect(keys[0]).toMatchObject({ kty: 'EC', crv: 'P-256', alg: 'ES256' })
  expect(keys[0]?.d).toBeUndefined()
})
