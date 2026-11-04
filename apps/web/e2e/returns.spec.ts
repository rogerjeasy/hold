import { expectFitsEveryWidth } from './support/responsive'
import { readyForHandover } from './support/rental'
import { expect, test } from './support/test'

// A camera that shows Chromium's test pattern, so the return shows the handover ghost over a live preview.
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } })

test('staff photograph a return against the handover, review what the comparison found and record a manual inspection', async ({ page, browser }) => {
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
  const ghost = page.getByRole('checkbox', { name: 'Show the handover photograph over the camera' })
  await expect(ghost).toBeChecked()
  await expect(page.getByRole('slider', { name: 'How strongly the handover photograph shows' })).toHaveValue('40')
  await expectFitsEveryWidth(page)
  await ghost.uncheck()
  await expect(page.getByRole('img', { name: /^Handover guide:/ })).toHaveCount(0)
  await ghost.check()
  await expect(page.getByRole('img', { name: /^Handover guide:/ })).toBeVisible()
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
  // Samples are compared like any photograph, and the record and screen disclose the simulation. The test environment's
  // model is the simulated stand-in: code finds the chip on the sample with damage, the stand-in words it as a finding
  // over that area, and the page says no model answered.
  await expect(page.getByRole('heading', { name: 'Findings', exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Simulated comparison', { exact: true })).toBeVisible()
  await expect(page.getByText('1 mark found', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Observations' })).toContainText(/Possible new damage.*Simulated: code found a change in this area/)
  await expect(page.getByText('Model: simulated. Prompt: inspection-3.')).toBeVisible()
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
