import { readFile } from 'node:fs/promises'
import type { Locator, Page } from '@playwright/test'
import { z } from 'zod'
import { readyForHandover, renterBrowser } from './support/rental'
import { expectFitsEveryWidth } from './support/responsive'
import { expect, test } from './support/test'

async function saveRecord(page: Page, section: Locator, kind: 'PDF' | 'manifest'): Promise<Buffer> {
  await section.getByRole('button', { name: `Download ${kind}`, exact: true }).click()
  const save = section.getByRole('link', { name: `Save ${kind}`, exact: true })
  await expect(save).toHaveAttribute('referrerpolicy', 'no-referrer')
  await expect(save).toHaveAttribute('rel', 'noreferrer')
  const waiting = page.waitForEvent('download')
  await save.click()
  const download = await waiting
  expect(download.suggestedFilename()).toMatch(kind === 'PDF' ? /^rental-record-v[0-9]+\.pdf$/ : /^rental-manifest-v[0-9]+\.json$/)
  const path = await download.path()
  return readFile(path)
}

async function photographAndSeal(page: Page, kind: 'handover' | 'return') {
  const views = page.getByRole('list', { name: 'Views' })
  await expect(views).toBeVisible()
  const needed = await views.getByText('Needed').count()
  expect(needed).toBeGreaterThan(0)
  for (let count = 1; count <= needed; count += 1) {
    await page.getByRole('button', { name: 'Use the sample photograph' }).click()
    await expect(views.getByText('Photographed')).toHaveCount(count, { timeout: 30000 })
  }
  await page.getByRole('button', { name: kind === 'handover' ? 'Seal the photographs' : 'Seal return photographs', exact: true }).click()
  await expect(page.getByText(kind === 'handover' ? 'The rental is out.' : /These return photographs are sealed/)).toBeVisible()
  await page.getByRole('link', { name: 'Back to the rental', exact: true }).first().click()
}

const fingerprint = z.string().regex(/^[a-f0-9]{64}$/)
const manifestSchema = z.object({
  schemaVersion: z.literal(1), rentalId: z.uuid(),
  items: z.array(z.object({ sessions: z.array(z.object({ kind: z.string(), manifestFingerprint: fingerprint, photos: z.array(z.object({ originalSha256: fingerprint, displaySha256: fingerprint })) })) })),
})

test('staff and renter download a photographed settlement record, its manifest and an earlier version', async ({ page, browser }) => {
  test.setTimeout(300000)
  await readyForHandover(page, browser, 'Porto Evidence and Rental Bicycle Workshop')
  const rentalUrl = page.url()
  const linkPanel = page.getByRole('region', { name: "The renter's link" })
  await linkPanel.getByRole('button', { name: 'Show the link', exact: true }).click()
  const renterUrl = (await linkPanel.getByTestId('renter-link').textContent()) ?? ''
  expect(renterUrl).toMatch(/\/r\/[A-Za-z0-9_-]{65}$/)

  await page.getByRole('link', { name: 'Your rental record', exact: true }).click()
  await expect(page.getByText('No record has been prepared yet.')).toBeVisible()
  await page.getByRole('button', { name: 'Prepare current record', exact: true }).click()
  const firstVersion = page.getByRole('region', { name: 'Version 1', exact: true })
  await expect(firstVersion.getByText('Ready to download')).toBeVisible({ timeout: 30000 })
  const firstPackId = await firstVersion.locator('input[name="packId"]').first().inputValue()
  await expectFitsEveryWidth(page)

  await page.goto(rentalUrl)
  await page.getByRole('region', { name: 'Handover' }).getByRole('button', { name: /^Photograph / }).click()
  await photographAndSeal(page, 'handover')
  await page.getByRole('button', { name: /^Start return for / }).click()
  await photographAndSeal(page, 'return')
  await page.getByRole('link', { name: 'Claim and settlement', exact: true }).click()
  await page.getByLabel('Inspection reason').fill('Inspected every returned item in person: no new damage. The sample photographs are simulated evidence.')
  await page.getByRole('button', { name: 'Confirm clean return and release hold', exact: true }).click()
  await expect(page.getByText('Settlement confirmed', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Your rental record', exact: true }).click()
  const currentVersion = page.getByRole('region', { name: /^Version [0-9]+$/ }).first()
  await expect(currentVersion.getByText('Ready to download')).toBeVisible({ timeout: 30000 })
  const latestTitle = await currentVersion.getByRole('heading', { level: 2 }).innerText()
  expect(Number(latestTitle.match(/[0-9]+$/)?.[0] ?? '0')).toBeGreaterThan(1)
  const receipts = page.getByRole('region', { name: 'Receipt emails' })
  await expect(receipts.getByText('Hold released', { exact: true })).toBeVisible()
  await expect(receipts.getByText('Sent', { exact: true })).toHaveCount(1)
  await expectFitsEveryWidth(page)
  const staffPdf = await saveRecord(page, currentVersion, 'PDF')
  expect(staffPdf.subarray(0, 5).toString()).toBe('%PDF-')
  const staffManifest = await saveRecord(page, currentVersion, 'manifest')
  const manifest = manifestSchema.parse(JSON.parse(staffManifest.toString()))
  const sessions = manifest.items.flatMap((item) => item.sessions)
  expect(sessions.map((session) => session.kind).sort()).toEqual(['handover', 'return'])
  expect(sessions.flatMap((session) => session.photos).length).toBeGreaterThan(0)
  expect(staffManifest.toString()).not.toMatch(/evidenceKey|displayKey|token|\/evidence\//)
  await page.reload()
  await expect(receipts.getByText('Sent', { exact: true })).toHaveCount(1)

  const renter = await renterBrowser(browser)
  await renter.goto(renterUrl)
  await renter.getByRole('link', { name: 'Your rental record', exact: true }).click()
  await expect(renter.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer')
  await expect(renter.getByRole('navigation', { name: 'Shop pages' })).toHaveCount(0)
  const renterCurrent = renter.getByRole('region', { name: latestTitle, exact: true })
  await expect(renterCurrent.getByText('Ready to download')).toBeVisible()
  await expectFitsEveryWidth(renter)
  expect(await saveRecord(renter, renterCurrent, 'PDF')).toEqual(staffPdf)
  expect(await saveRecord(renter, renterCurrent, 'manifest')).toEqual(staffManifest)

  await page.goto(`${rentalUrl}/record?version=${firstPackId}`)
  await expect(page.getByRole('region', { name: 'Version 1', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: /^Version [0-9]+$/ })).toHaveCount(1)
  await expectFitsEveryWidth(page)
  const oldPdf = await saveRecord(page, page.getByRole('region', { name: 'Version 1', exact: true }), 'PDF')
  await renter.goto(`${renterUrl}/record?version=${firstPackId}`)
  await expect(renter.getByRole('region', { name: 'Version 1', exact: true })).toBeVisible()
  await expect(renter.getByRole('region', { name: /^Version [0-9]+$/ })).toHaveCount(1)
  await expectFitsEveryWidth(renter)
  expect(await saveRecord(renter, renter.getByRole('region', { name: 'Version 1', exact: true }), 'PDF')).toEqual(oldPdf)
  await renter.context().close()
})
