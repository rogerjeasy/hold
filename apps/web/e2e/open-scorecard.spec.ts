import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expectFitsEveryWidth } from './support/responsive'
import { newEmail, signUpAs } from './support/sign-in'
import { expect, test } from './support/test'

// The open scorecard (extensions.md section 5.5), read without signing in, on a server that recorded a made-up
// accepted run (HOLD_EVAL_FIXTURE): every pair of the run on AG Grid, the chosen pair beside it, how confidence held
// up, what each pair should have ended in against what it did, and run against run.

const grid = (page: Page) => page.getByRole('region', { name: 'Pairs of the gate half' })
const dataRows = (page: Page) => grid(page).getByRole('row').filter({ has: page.getByRole('gridcell') })
const panel = (page: Page) => page.getByRole('region', { name: 'Chosen pair' })

test('a renter checks the comparison pair by pair: filters to damage, moves by keyboard, and sees the truth outlined beside what was found', async ({ page }) => {
  await page.goto('/reliability')
  await expect(page.getByRole('heading', { name: 'Every pair, case by case' })).toBeVisible()
  await expect(dataRows(page)).toHaveCount(11)
  await page.getByRole('button', { name: 'Damage 2 of 3 right' }).click()
  await expect(dataRows(page)).toHaveCount(3)
  await dataRows(page).first().getByRole('gridcell').first().click()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(panel(page).getByRole('heading', { name: 'Pair damage-02' })).toBeFocused()
  await expect(panel(page).getByRole('img', { name: 'Return photograph of pair damage-02' })).toBeVisible()
  await expect(panel(page).locator('[data-tone="truth"]')).toHaveCount(1)
  await expect(panel(page).getByText('New damage at 93% confidence')).toBeVisible()
  await expect(panel(page).getByText('Should have ended: Findings. Ended: Findings.')).toBeVisible()

  await grid(page).getByRole('columnheader', { name: 'Result' }).click()
  await expect(dataRows(page).first()).toContainText('Sent to a person')
})

test('the calibration, the matrix and run against run are counted from the same pairs', async ({ page }) => {
  await page.goto('/reliability')
  const calibration = page.getByRole('table', { name: 'Does confidence hold up?' })
  await expect(calibration.getByRole('row', { name: /^high/ })).toContainText('2 of 3')
  await expect(calibration.getByRole('row', { name: /^medium/ })).toContainText('0 of 1')
  const matrix = page.getByRole('table', { name: 'Should have ended, against ended' })
  await expect(matrix.getByRole('row', { name: /^Findings/ }).getByRole('cell').first()).toHaveText('0 pairs')
  const runs = page.getByRole('region', { name: 'Run against run' }).getByRole('listitem')
  await expect(runs).toHaveCount(2)
  await expect(runs.first()).toContainText('No line: the limits are set after the first run.')
  await expect(runs.last()).toContainText('Limit 20%')
  await expect(runs.last()).not.toContainText('Crossed the line')
  await expectFitsEveryWidth(page)
})

test('on a phone the pairs are a list, and choosing one opens its photographs', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/reliability')
  await expect(grid(page)).toBeHidden()
  await page.getByRole('list', { name: 'Pairs' }).getByRole('button', { name: /reused-01/ }).click()
  await expect(panel(page).getByRole('heading', { name: 'Pair reused-01' })).toBeFocused()
  await expect(panel(page).getByText('Never lined up: the check for a reused photograph stopped it first.')).toBeVisible()
})

for (const theme of ['light', 'dark'] as const) {
  test(`the open scorecard passes the accessibility checks in the ${theme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.goto('/reliability')
    await expect(dataRows(page)).toHaveCount(11)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`)).toEqual([])
  })
}

test('the owner reaches every pair from the shop’s own scorecard', async ({ page }) => {
  await signUpAs(page, newEmail())
  await page.getByRole('navigation', { name: 'Shop pages' }).getByRole('link', { name: 'Reliability' }).click()
  await page.getByRole('link', { name: 'Every pair, case by case' }).click()
  await expect(page).toHaveURL(/\/reliability$/)
  await expect(page.getByRole('heading', { name: 'Every pair, case by case' })).toBeVisible()
})
