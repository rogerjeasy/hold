import { expectFitsEveryWidth } from './support/responsive'
import { readyForHandover } from './support/rental'
import { expect, test } from './support/test'

test('at handover, staff photograph each view, box a mark and seal it, and the rental is out', async ({ page, browser }) => {
  test.setTimeout(180_000)
  await readyForHandover(page, browser, 'Porto Handover Bikes')
  await page.getByRole('region', { name: 'Handover' }).getByRole('button', { name: /^Photograph / }).click()
  await expect(page).toHaveURL(/\/handover\/[0-9a-f-]{36}$/)

  // The test browser has no camera, so each needed view is the sample photograph, checked and uploaded the same way.
  const views = page.getByRole('list', { name: 'Views' })
  // On a phone at the counter, the camera comes before the list of views.
  await page.setViewportSize({ width: 390, height: 844 })
  const cameraTop = (await page.getByRole('button', { name: 'Use the sample photograph' }).boundingBox())?.y ?? Infinity
  expect(cameraTop).toBeLessThan((await views.boundingBox())?.y ?? 0)
  await page.setViewportSize({ width: 1280, height: 800 })
  const needed = await views.getByText('Needed').count()
  expect(needed).toBeGreaterThan(0)
  for (let taken = 1; taken <= needed; taken += 1) {
    await page.getByRole('button', { name: 'Use the sample photograph' }).click()
    await expect(views.getByText('Photographed')).toHaveCount(taken, { timeout: 30_000 })
  }

  // A mark boxed on the first view, by keyboard.
  await views.getByRole('button').first().click()
  await page.getByRole('button', { name: 'Add a mark' }).click()
  await page.getByRole('slider', { name: "The new mark's box" }).press('ArrowRight')
  await page.getByLabel('What is the mark?').fill('Scuff on the down tube')
  await page.getByRole('button', { name: 'Save the mark' }).click()
  await expect(page.getByText('Scuff on the down tube')).toBeVisible()
  await expectFitsEveryWidth(page)

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.getByRole('button', { name: 'Seal the photographs' }).click()
  await expect(page.getByText('The rental is out.')).toBeVisible()
  await expect(page.getByRole('img', { name: "Scan with the renter's phone to see the condition report" })).toBeVisible()
  await expect(page.getByTestId('renter-link')).toHaveText(/\/r\/[A-Za-z0-9_-]{65}\/condition$/)
  const conditionLink = (await page.getByTestId('renter-link').textContent()) ?? ''

  // The renter, on their own phone, sees how it left and adds a photograph of something staff missed.
  const renter = await (await browser.newContext()).newPage()
  await renter.goto(conditionLink)
  await expect(renter.getByRole('heading', { level: 1 })).toHaveText('How your rental left')
  await expect(renter.getByText('Scuff on the down tube')).toBeVisible()
  const first = renter.getByRole('img', { name: /^City e-bike 1: / }).first()
  await expect(first).toBeVisible()
  // Each photograph is shown whole, at its own shape, so its marks sit where they were drawn.
  await expect.poll(() => first.evaluate((image: HTMLImageElement) => (image.parentElement?.style.aspectRatio ?? '') === `${String(image.naturalWidth)} / ${String(image.naturalHeight)}`)).toBe(true)
  await expectFitsEveryWidth(renter)
  await renter.getByRole('button', { name: 'Add a photograph of something missed' }).click()
  await renter.getByRole('button', { name: 'Use the sample photograph' }).click()
  await expect(renter.getByRole('button', { name: 'Send what I added' })).toBeEnabled({ timeout: 30_000 })
  await renter.getByRole('button', { name: 'Send what I added' }).click()
  await expect(renter.getByText('You added photographs of what was missed.', { exact: false })).toBeVisible()
  await expectFitsEveryWidth(renter)
  await renter.context().close()

  await page.getByRole('link', { name: 'Back to the rental' }).last().click()
  await expect(page.getByRole('region', { name: 'Handover' })).toContainText('Photographed and sealed')
  await expect(page.getByRole('region', { name: 'Progress' }).getByText('Done')).toHaveCount(4)
})
