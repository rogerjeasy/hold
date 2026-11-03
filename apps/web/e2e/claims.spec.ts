import AxeBuilder from '@axe-core/playwright'
import { expectFitsEveryWidth } from './support/responsive'
import { acceptClaim, inspectedReturn } from './support/claim'
import { renterBrowser } from './support/rental'
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
  // The page that asks the renter for money carries the frame every renter page has, and tells them the claim waits
  // for their review rather than that it was approved against them.
  await expect(renter.getByRole('main')).toBeVisible()
  await expect(renter.getByRole('link', { name: 'Skip to content' })).toBeAttached()
  await expect(renter.getByRole('button', { name: 'Language' })).toBeVisible()
  await expect(renter.getByText('A claim for you to review')).toBeVisible()
  const audit = await new AxeBuilder({ page: renter }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze()
  expect(audit.violations.map((violation) => violation.id).filter((id) => ['landmark-one-main', 'region', 'skip-link', 'page-has-heading-one'].includes(id))).toEqual([])
  await expectFitsEveryWidth(renter)
  await acceptClaim(renter)
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
