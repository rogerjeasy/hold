import { inspectedReturn } from './support/claim'
import { expectFitsEveryWidth } from './support/responsive'
import { renterBrowser } from './support/rental'
import { TEST_CODE } from './support/sign-in'
import { expect, test } from './support/test'

// Extension 4 in the test environment: both advocates are the simulated stand-in, which says so on every screen.
test('two advocates settle a contested claim, both people confirm, and only the agreed amount is charged', async ({ page, browser }) => {
  test.setTimeout(300000)
  await inspectedReturn(page, browser, 'Porto Advocate Bikes')
  const claimPage = page.url()

  // The owner sets the shop advocate's limits once, in settings.
  await page.getByRole('navigation', { name: 'Shop pages' }).getByRole('link', { name: 'Settlement advocate' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settlement advocate')
  await expect(page.getByText('No shop advocate. Contested claims come to you, as now.')).toBeVisible()
  await page.getByLabel('Lowest share of a claim it may agree to, in percent').fill('50')
  await page.getByLabel('Largest claim it may take on, in EUR').fill('200')
  await page.getByRole('button', { name: 'Save the limits' }).click()
  await expect(page.getByText('Saved. They apply to the next contest.')).toBeVisible()
  await page.reload()
  await expect(page.getByText(/At least 50% of a claim, on claims up to €200.00/)).toBeVisible()
  await expectFitsEveryWidth(page)

  // Staff raise and approve the claim as in the spine.
  await page.goto(claimPage)
  await page.getByLabel('What did you find, and why does this price apply?').fill('Fresh scratch on the frame, inspected in person; the sample comparison was deferred.')
  await page.getByRole('button', { name: 'Prepare claim for review', exact: true }).click()
  await page.getByRole('button', { name: 'Approve and show renter link', exact: true }).click()
  const link = (await page.getByTestId('renter-link').textContent()) ?? ''

  // The renter hands the contest to an advocate with the most they will pay, after their emailed code.
  const renter = await renterBrowser(browser)
  await renter.goto(link)
  await renter.getByRole('button', { name: 'I have reviewed this claim' }).click()
  await expect(renter.getByRole('heading', { name: 'Let an advocate argue it for me' })).toBeVisible()
  await expectFitsEveryWidth(renter)
  await renter.getByRole('button', { name: 'Email me a verification code' }).click()
  await expect(renter.getByText('Verification code sent. It expires in ten minutes.')).toBeVisible()
  await renter.getByLabel('Verification code, for your advocate').fill(TEST_CODE)
  await renter.getByLabel('The most I will pay, in EUR').fill('30')
  await renter.getByRole('button', { name: 'Hand my contest to an advocate' }).click()
  // The claim is answered now: its page offers the advocate's page instead of the choices.
  await renter.getByRole('link', { name: 'See what the advocates said' }).click()
  await expect(renter.getByRole('heading', { level: 1 })).toHaveText('Your advocate')
  await expect(renter.getByText('Your highest total: €30.00. Only you see this.')).toBeVisible()
  await expect(renter.getByText(/Simulated advocates/)).toBeVisible()
  await expect(renter.getByText('The advocates agreed on €17.50. Nothing is charged until each person confirms.')).toBeVisible()
  await expectFitsEveryWidth(renter)

  // The renter's final tap, with a fresh code.
  await renter.getByRole('button', { name: 'Email me a verification code' }).click()
  await expect(renter.getByText('Verification code sent. It expires in ten minutes.')).toBeVisible()
  await renter.getByLabel('Verification code', { exact: true }).fill(TEST_CODE)
  await renter.getByRole('button', { name: 'Confirm and settle' }).click()
  await expect(renter.getByText('You confirmed. Waiting for the shop to confirm.')).toBeVisible()

  // The owner's final tap. Then the spine captures the agreed amount and releases the rest.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'What the advocates said' })).toBeVisible()
  await expectFitsEveryWidth(page)
  await page.getByRole('button', { name: 'Confirm and settle' }).click()
  await expect(page.getByText('Agreed on €17.50 and confirmed. The hold settles through PayPal.')).toBeVisible()
  await page.reload()
  await expect(page.getByText('Settlement confirmed', { exact: true })).toBeVisible()
  await expect(page.getByText('€17.50').first()).toBeVisible()
  await expectFitsEveryWidth(page)
  await renter.context().close()
})
