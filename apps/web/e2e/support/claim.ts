import type { Browser, Page } from '@playwright/test'
import { readyForHandover } from './rental'
import { TEST_CODE } from './sign-in'
import { expect } from './test'

// A rental handed over and returned with the sample photographs, ending on its claim page. Shared by the claim and
// negotiation tests.
export async function inspectedReturn(page: Page, browser: Browser, name: string): Promise<void> {
  await readyForHandover(page, browser, name)
  await handedOverAndReturned(page)
}

// From a rental ready for handover: its handover and its return photographed with the sample photographs, ending on its
// claim page. The return may use another sample, such as the one with damage.
export async function handedOverAndReturned(page: Page, returnSample = 'Use the sample photograph'): Promise<void> {
  await page.getByRole('region', { name: 'Handover' }).getByRole('button', { name: /^Photograph / }).click()
  await expect(page).toHaveURL(/\/handover\/[0-9a-f-]{36}$/)
  for (const kind of ['handover', 'return'] as const) {
    const views = page.getByRole('list', { name: 'Views' })
    await expect(views).toBeVisible()
    const needed = await views.getByText('Needed').count()
    expect(needed).toBeGreaterThan(0)
    for (let count = 1; count <= needed; count += 1) {
      await page.getByRole('button', { name: kind === 'handover' ? 'Use the sample photograph' : returnSample }).click()
      await expect(views.getByText('Photographed')).toHaveCount(count, { timeout: 30000 })
    }
    await page.getByRole('button', { name: kind === 'handover' ? 'Seal the photographs' : 'Seal return photographs', exact: true }).click()
    await expect(page.getByText(kind === 'handover' ? 'The rental is out.' : /These return photographs are sealed/)).toBeVisible()
    await page.getByRole('link', { name: 'Back to the rental', exact: true }).first().click()
    if (kind === 'handover') {
      await page.getByRole('button', { name: /^Start return for / }).click()
      await expect(page).toHaveURL(/\/return\/[0-9a-f-]{36}$/)
    }
  }
  await page.getByRole('link', { name: 'Claim and settlement', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Claim and settlement')
}

// On the renter's claim page: the renter accepts with their emailed code, and PayPal settles.
export async function acceptClaim(renter: Page): Promise<void> {
  await renter.getByRole('button', { name: 'I have reviewed this claim' }).click()
  await renter.getByRole('button', { name: 'Send me a verification code' }).click()
  await expect(renter.getByText('Verification code sent. It expires in ten minutes.')).toBeVisible()
  await renter.getByLabel('Verification code', { exact: true }).fill(TEST_CODE)
  await renter.getByRole('button', { name: 'Accept claim and settle', exact: true }).click()
  await expect(renter.getByText('PayPal confirmed settlement. This rental is closed.')).toBeVisible()
}
