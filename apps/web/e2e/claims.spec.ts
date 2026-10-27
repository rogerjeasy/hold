import { expectFitsEveryWidth } from './support/responsive'
import { inspectedReturn } from './support/claim'
import { renterBrowser } from './support/rental'
import { TEST_CODE } from './support/sign-in'
import { expect, test } from './support/test'

test('a staff-approved claim is accepted by the verified renter and settled once', async ({ page, browser }) => {
  test.setTimeout(240000)
  await inspectedReturn(page, browser, 'Porto Claim Bikes')
  await expectFitsEveryWidth(page)
  await page.getByLabel('What did you find, and why does this price apply?').fill('Fresh scratch on the frame, inspected in person; the sample comparison was deferred.')
  await page.getByRole('button', { name: 'Prepare claim for review', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Awaiting staff approval' })).toBeVisible()
  await expectFitsEveryWidth(page)
  await page.getByRole('button', { name: 'Approve and show renter link', exact: true }).click()
  await expect(page.getByTestId('renter-link')).toBeVisible()
  const link = (await page.getByTestId('renter-link').textContent()) ?? ''
  const renter = await renterBrowser(browser)
  await renter.goto(link)
  await expect(renter.getByRole('heading', { level: 1 })).toHaveText('Your damage claim')
  await expectFitsEveryWidth(renter)
  await renter.getByRole('button', { name: 'I have reviewed this claim' }).click()
  await renter.getByRole('button', { name: 'Email me a verification code' }).click()
  await expect(renter.getByText('Verification code sent. It expires in ten minutes.')).toBeVisible()
  await renter.getByLabel('Verification code', { exact: true }).fill(TEST_CODE)
  await renter.getByRole('button', { name: 'Accept claim and settle', exact: true }).click()
  await expect(renter.getByText('PayPal confirmed settlement. This rental is closed.')).toBeVisible()
  await expectFitsEveryWidth(renter)
  await page.reload()
  await expect(page.getByText('Settlement confirmed', { exact: true })).toBeVisible()
  await expectFitsEveryWidth(page)
  await renter.context().close()
})

test('staff confirm an inspected clean return and PayPal releases the hold', async ({ page, browser }) => {
  test.setTimeout(240000)
  await inspectedReturn(page, browser, 'Porto Clean Return Bikes')
  await page.getByLabel('Inspection reason').fill('Inspected all returned items in person: no new damage.')
  await page.getByRole('button', { name: 'Confirm clean return and release hold', exact: true }).click()
  await expect(page.getByText('Settlement confirmed', { exact: true })).toBeVisible()
  await expectFitsEveryWidth(page)
})
