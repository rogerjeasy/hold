import { expect, test } from './support/test'

const sliderName = 'Slide between the handover photograph and the return photograph'

test('both photographs load', async ({ page }) => {
  await page.goto('/')
  for (const alt of ['A blue bicycle frame photographed at handover', 'The same bicycle frame photographed at return']) {
    const image = page.getByAltText(alt)
    await expect(image).toBeVisible()
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0)
  }
})

test('the divider moves with the arrow keys', async ({ page }) => {
  await page.goto('/')
  const slider = page.getByRole('slider', { name: sliderName })
  await slider.focus()
  await expect(slider).toHaveValue('20')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(slider).toHaveValue('22')
})

test('a clean return shows that nothing was taken', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('€300 reserved · €35 taken · €265 released')).toBeVisible()
  await page.getByRole('button', { name: 'Clean return' }).click()
  await expect(page.getByText('€300 reserved · €0 taken · €300 released')).toBeVisible()
  await expect(page.getByText('No new marks')).toBeVisible()
})

test('both outlined marks sit on the return side when the page opens', async ({ page }) => {
  for (const width of [360, 820, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    const stage = page.getByTestId('evidence-stage')
    const stageBox = await stage.boundingBox()
    const divider = (stageBox?.x ?? 0) + (stageBox?.width ?? 0) * 0.2
    const marks = await stage.locator('svg rect').evaluateAll((rects) => rects.map((rect) => rect.getBoundingClientRect().left))
    expect(marks.length).toBeGreaterThanOrEqual(2)
    for (const left of marks) expect(left, `a mark is hidden behind the handover photograph at ${String(width)} wide`).toBeGreaterThan(divider)
  }
})

test('a phone can still scroll the page with a finger on the photograph', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const touchAction = await page.getByRole('slider', { name: sliderName }).evaluate((element) => getComputedStyle(element).touchAction)
  expect(touchAction).toBe('pan-y')
})
