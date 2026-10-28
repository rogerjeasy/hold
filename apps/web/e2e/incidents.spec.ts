import type { Browser, Page } from '@playwright/test'
import { acceptClaim } from './support/claim'
import { expectFitsEveryWidth } from './support/responsive'
import { readyForHandover, renterBrowser } from './support/rental'
import { TEST_CODE } from './support/sign-in'
import { expect, test } from './support/test'

// The incident desk (extensions.md section 10), as a renter and staff use it: reported from the roadside, sorted, priced
// by staff, agreed with the one-time code, and at the return carried into the claim, lowered and settled once.

async function photographEveryView(page: Page, seal: string, sealed: RegExp | string) {
  const views = page.getByRole('list', { name: 'Views' })
  await expect(views).toBeVisible()
  const needed = await views.getByText('Needed').count()
  for (let count = 1; count <= needed; count += 1) {
    await page.getByRole('button', { name: 'Use the sample photograph' }).click()
    await expect(views.getByText('Photographed')).toHaveCount(count, { timeout: 30000 })
  }
  await page.getByRole('button', { name: seal, exact: true }).click()
  await expect(page.getByText(sealed)).toBeVisible()
}

// A rental handed over, with the renter holding a link from the rental page. Ends on the rental's page.
async function handedOver(page: Page, browser: Browser, shopName: string): Promise<{ readonly renter: Page; readonly link: string }> {
  await readyForHandover(page, browser, shopName)
  await page.getByRole('region', { name: 'Handover' }).getByRole('button', { name: /^Photograph / }).click()
  await photographEveryView(page, 'Seal the photographs', 'The rental is out.')
  await page.getByRole('link', { name: 'Back to the rental', exact: true }).first().click()
  const linkPanel = page.getByRole('region', { name: "The renter's link" })
  await linkPanel.getByRole('button', { name: 'Show the link' }).click()
  const link = (await linkPanel.getByTestId('renter-link').textContent()) ?? ''
  const renter = await renterBrowser(browser)
  await renter.goto(link)
  return { renter, link }
}

async function startReport(renter: Page, hint: string, description: string) {
  await renter.getByRole('link', { name: 'Something happened' }).click()
  await expect(renter.getByRole('heading', { level: 1 })).toHaveText('Something happened')
  await renter.getByRole('radio', { name: hint }).check()
  await renter.getByLabel('Describe what happened').fill(description)
  await renter.getByRole('button', { name: 'Continue' }).click()
  await expect(renter).toHaveURL(/\/incident\/[0-9a-f-]{36}$/)
}

test('a scratch reported during the rental is priced by staff, agreed with a code, and settled once at the return (X5.1 to X5.4, X5.7)', async ({ page, browser }) => {
  test.setTimeout(300000)
  const { renter } = await handedOver(page, browser, 'Porto Incident Bikes')
  await expectFitsEveryWidth(renter)
  await startReport(renter, 'A mark or damage, such as a scratch or a dent', 'A deep scratch on the frame from a bike rack.')
  await expectFitsEveryWidth(renter)
  await renter.getByRole('button', { name: 'Use the sample photograph' }).click()
  await expect(renter.getByRole('list', { name: 'Views' }).getByText('Photographed')).toHaveCount(1, { timeout: 30000 })
  await renter.getByRole('button', { name: 'Mark where it is' }).click()
  await renter.getByRole('button', { name: 'Send the report' }).click()
  await expect(renter.getByRole('heading', { name: 'Small damage' })).toBeVisible()
  await expect(renter.getByText('Sorted by a stand-in for the test environment, not by Claude.')).toBeVisible()
  await expectFitsEveryWidth(renter)

  // Staff are told, and confirm the price the stand-in only suggested.
  await page.getByRole('navigation', { name: 'Shop pages' }).getByRole('link', { name: 'Incidents' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Incidents')
  const report = page.getByRole('article').filter({ hasText: 'A deep scratch on the frame from a bike rack.' })
  await expect(report.getByLabel('Published price that applies')).toContainText('Deep scratch on the frame')
  await expectFitsEveryWidth(page)
  await report.getByRole('button', { name: 'Confirm this price for the renter' }).click()
  await expect(report.getByText('Price confirmed: Deep scratch on the frame, €35.00')).toBeVisible()

  // The renter agrees with the one-time code. Nothing is charged.
  await renter.reload()
  await expect(renter.getByRole('heading', { name: 'Small damage at a published price' })).toBeVisible()
  await renter.getByRole('button', { name: 'Email me a code' }).click()
  await expect(renter.getByText('Code sent. It expires in ten minutes.')).toBeVisible()
  await renter.getByLabel('One-time code').fill(TEST_CODE)
  await renter.getByRole('button', { name: 'Agree €35.00' }).click()
  await expect(renter.getByText('Agreed: €35.00')).toBeVisible()
  await expect(renter.getByText(/Nothing has been charged\./)).toBeVisible()
  await expectFitsEveryWidth(renter)
  await renter.context().close()

  // The return: the agreed line is carried into the claim draft; staff lower it, and cannot raise it.
  await report.getByRole('link', { name: 'Open the rental' }).click()
  await page.getByRole('button', { name: /^Start return for / }).click()
  await expect(page).toHaveURL(/\/return\/[0-9a-f-]{36}$/)
  await photographEveryView(page, 'Seal return photographs', /These return photographs are sealed/)
  await page.getByRole('link', { name: 'Back to the rental', exact: true }).first().click()
  await page.getByRole('link', { name: 'Claim and settlement', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: /Keep the line the renter agreed: Deep scratch on the frame/ })).toBeChecked()
  const amount = page.getByLabel('Amount to keep, at most €35.00')
  await amount.fill('40')
  await expect(page.getByText('A line the renter agreed can be lowered, never raised.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Prepare claim for review' })).toBeDisabled()
  await amount.fill('20')
  await expectFitsEveryWidth(page)
  await page.getByRole('button', { name: 'Prepare claim for review', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Awaiting staff approval' })).toBeVisible()
  await expect(page.getByText('Agreed by the renter during the rental, confirmed by staff at the return.')).toBeVisible()

  // One final capture of the confirmed line, the rest released.
  await page.getByRole('button', { name: 'Approve and show renter link', exact: true }).click()
  const claimLink = (await page.getByTestId('renter-link').textContent()) ?? ''
  const payer = await renterBrowser(browser)
  await payer.goto(claimLink)
  await acceptClaim(payer)
  await payer.context().close()
  await page.reload()
  await expect(page.getByText('Settlement confirmed', { exact: true })).toBeVisible()
  const summary = page.getByRole('region', { name: 'Settlement amounts' })
  await expect(summary).toContainText('€20.00')
  await expect(summary).toContainText('€280.00')
})

test('a report that could bear on safety shows only the fixed message and reaches staff (X5.5)', async ({ page, browser }) => {
  test.setTimeout(240000)
  const { renter } = await handedOver(page, browser, 'Porto Safety Bikes')
  await startReport(renter, 'A mark or damage, such as a scratch or a dent', 'My friend fell and hurt her wrist, and there is a scratch.')
  await renter.getByRole('button', { name: 'Send the report' }).click()
  await expect(renter.getByRole('heading', { name: 'Stop using the item' })).toBeVisible()
  await expect(renter.getByText('The shop has been told and will contact you.')).toBeVisible()
  await expect(renter.getByText(/€/)).toHaveCount(0)
  await expect(renter.getByRole('button', { name: 'Email me a code' })).toHaveCount(0)
  await expectFitsEveryWidth(renter)
  await renter.context().close()
  await page.getByRole('navigation', { name: 'Shop pages' }).getByRole('link', { name: 'Incidents' }).click()
  const report = page.getByRole('article').filter({ hasText: 'My friend fell and hurt her wrist' })
  await expect(report.getByText('Could bear on safety')).toBeVisible()
  await expect(report.getByRole('button', { name: 'Make it the shop’s matter' })).toBeVisible()
})
