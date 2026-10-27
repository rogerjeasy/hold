import { expectFitsEveryWidth } from './support/responsive'
import { readyForHandover } from './support/rental'
import { expect, test } from './support/test'

test('staff photograph a return against the handover, review uncertainty and record a manual inspection', async ({ page, browser }) => {
  test.setTimeout(240_000)
  await readyForHandover(page, browser, 'Porto Return Bikes')
  await page.getByRole('region', { name: 'Handover' }).getByRole('button', { name: /^Photograph / }).click()
  await expect(page).toHaveURL(/\/handover\/[0-9a-f-]{36}$/)
  let views = page.getByRole('list', { name: 'Views' })
  await expect(views).toBeVisible()
  let needed = await views.getByText('Needed').count()
  expect(needed).toBeGreaterThan(0)
  for (let count = 1; count <= needed; count += 1) {
    await page.getByRole('button', { name: 'Use the sample photograph' }).click()
    await expect(views.getByText('Photographed')).toHaveCount(count, { timeout: 30_000 })
  }
  await page.getByRole('button', { name: 'Seal the photographs' }).click()
  await expect(page.getByText('The rental is out.')).toBeVisible()
  await page.getByRole('link', { name: 'Back to the rental' }).last().click()
  await page.getByRole('button', { name: /^Start return for / }).click()
  await expect(page).toHaveURL(/\/return\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('img', { name: /^Handover guide:/ })).toBeVisible({ timeout: 30_000 })
  await expectFitsEveryWidth(page)
  views = page.getByRole('list', { name: 'Views' })
  needed = await views.getByText('Needed').count()
  expect(needed).toBeGreaterThan(0)
  await expect(page.getByRole('button', { name: 'Seal return photographs' })).toBeDisabled()
  for (let count = 1; count <= needed; count += 1) {
    await page.getByRole('button', { name: count === 1 ? 'Use the sample with damage' : 'Use the sample photograph' }).click()
    await expect(views.getByText('Photographed')).toHaveCount(count, { timeout: 30_000 })
  }
  await page.getByRole('button', { name: 'Seal return photographs' }).click()
  await expect(page.getByText(/These return photographs are sealed/)).toBeVisible()
  await page.getByRole('link', { name: 'Review comparison' }).click()
  await expect(page.getByRole('heading', { name: 'Needs a person', exact: true })).toBeVisible({ timeout: 30_000 })
  // Samples are compared like any photograph, and the record and screen disclose the simulation. The test environment
  // has no model, so the comparison waits for a person.
  await expect(page.getByText('Simulated comparison', { exact: true })).toBeVisible()
  await expect(page.getByText(/A return photograph matches earlier evidence/)).toHaveCount(0)
  await expectFitsEveryWidth(page)
  await page.getByLabel('Your inspection outcome').selectOption('clean')
  await page.getByLabel('Your inspection notes').fill('Inspected the frame in person: no new damage. A sample photograph cannot establish the return condition.')
  await page.getByRole('button', { name: 'Record inspection', exact: true }).click()
  await expect(page.getByText('Your inspection has been recorded.')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Staff inspection record' })).toContainText('Inspected the frame in person')
  await expectFitsEveryWidth(page)
  await page.getByRole('link', { name: 'Back to the rental', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Hold at pickup' })).toContainText('€300.00')
})
