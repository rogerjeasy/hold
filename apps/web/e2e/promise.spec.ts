import { expectFitsEveryWidth } from './support/responsive'
import { inspectedReturn } from './support/claim'
import { renterBrowser } from './support/rental'
import { TEST_CODE } from './support/sign-in'
import { expect, test } from './support/test'

// The shop's promise to decide a contested claim (architecture.md section 6.16): the renter reads it before and after
// contesting, both sides write to each other on the claim, and every page fits every width.
test('the renter reads the shop’s promise, contests, and renter and shop write to each other on the claim', async ({ page, browser }) => {
  test.setTimeout(240000)
  await inspectedReturn(page, browser, 'Porto Promise Bikes')
  await page.getByLabel('What did you find, and why does this price apply?').fill('Fresh scratch on the frame, inspected in person.')
  await page.getByRole('button', { name: 'Prepare claim for review', exact: true }).click()
  await page.getByRole('button', { name: 'Approve and show renter link', exact: true }).click()
  await expect(page.getByTestId('renter-link')).toBeVisible()
  const link = (await page.getByTestId('renter-link').textContent()) ?? ''

  const renter = await renterBrowser(browser)
  await renter.goto(link)
  await renter.getByRole('button', { name: 'I have reviewed this claim' }).click()
  await expect(renter.getByText('If you contest')).toBeVisible()
  await expect(renter.getByText(/Porto Promise Bikes promises to decide within 3 days of your reply/)).toBeVisible()
  await expectFitsEveryWidth(renter)
  await renter.getByRole('button', { name: 'Email me a verification code' }).click()
  await expect(renter.getByText('Verification code sent. It expires in ten minutes.')).toBeVisible()
  await renter.getByLabel('Verification code', { exact: true }).fill(TEST_CODE)
  await renter.getByLabel('Your explanation (required to contest)').fill('The scratch was there when I picked the bike up.')
  await renter.getByRole('button', { name: 'Contest this claim', exact: true }).click()
  await expect(renter.getByText('The shop decides by')).toBeVisible()
  await renter.getByLabel('Write to the shop').fill('I have a photo from pickup that shows the scratch.')
  await renter.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(renter.getByText('Sent.')).toBeVisible()
  await expect(renter.getByText('I have a photo from pickup that shows the scratch.')).toBeVisible()
  await expectFitsEveryWidth(renter)

  await page.reload()
  await expect(page.getByText('You promised to decide by')).toBeVisible()
  await expect(page.getByText('I have a photo from pickup that shows the scratch.')).toBeVisible()
  await page.getByLabel(/^Write to /).fill('Thank you. We will look at it with the return photographs.')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByText('Sent.')).toBeVisible()
  await expectFitsEveryWidth(page)

  await renter.reload()
  await expect(renter.getByText('Thank you. We will look at it with the return photographs.')).toBeVisible()
  await renter.context().close()

  await page.getByRole('navigation', { name: 'Shop pages' }).getByRole('link', { name: 'Contested claims' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Contested claims')
  await expect(page.getByRole('heading', { level: 2, name: 'Our promise to renters' })).toBeVisible()
  await expect(page.getByLabel('Days to decide a contested claim (1 to 14)')).toHaveValue('3')
  await expectFitsEveryWidth(page)
})
