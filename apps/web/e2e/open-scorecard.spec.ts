import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expectFitsEveryWidth } from './support/responsive'
import { newEmail, signUpAs } from './support/sign-in'
import { expect, test } from './support/test'

// The open scorecard (extensions.md section 5.5), read without signing in, on a server that recorded a made-up
// accepted run (HOLD_EVAL_FIXTURE): every pair of the run on AG Grid Enterprise, grouped by kind with each group's
// record, each pair opening in place into its photographs, filtered by any column and downloaded for a spreadsheet; then
// how confidence held up, what each pair should have ended in against what it did, and run against run.

const grid = (page: Page) => page.getByRole('region', { name: 'Pairs of the gate half' })
const groups = (page: Page) => grid(page).locator('.ag-full-width-row.ag-row-group')
const dataRows = (page: Page) => grid(page).locator('.ag-row:not(.ag-full-width-row)')
const pair = (page: Page, id: string) => grid(page).getByRole('region', { name: `Pair ${id}` })
const panel = (page: Page) => page.getByRole('region', { name: 'Chosen pair' })

test('a renter checks the comparison pair by pair: grouped with each record, filtered to damage, opened by keyboard with the truth outlined beside what was found', async ({ page }) => {
  await page.goto('/reliability')
  await expect(page.getByRole('heading', { name: 'Every pair, case by case' })).toBeVisible()
  await expect(dataRows(page)).toHaveCount(11)
  await expect(groups(page)).toHaveText([/^Clean, easy\s*2 of 2 right$/, /^Clean, hard\s*1 of 2 right$/, /^Ordinary wear\s*1 of 2 right$/, /^Damage\s*2 of 3 right$/, /^A known mark\s*1 of 1 right$/, /^Wrong item or reused\s*1 of 1 right$/])
  await page.getByRole('button', { name: 'Damage 2 of 3 right' }).click()
  await expect(groups(page)).toHaveCount(0)
  await expect(dataRows(page)).toHaveCount(3)
  await dataRows(page).first().locator('[col-id="expected"]').click()
  await expect(pair(page, 'damage-01')).toBeVisible()
  const second = dataRows(page).filter({ hasText: 'damage-02' })
  for (let press = 0; press < 6 && (await second.locator('.ag-cell-focus').count()) === 0; press += 1) await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  const opened = pair(page, 'damage-02')
  await expect(opened.getByRole('heading', { name: 'Pair damage-02' })).toBeFocused()
  await expect.poll(async () => (await opened.boundingBox())?.height ?? 0).toBeGreaterThan(300)
  await expect(opened.getByRole('img', { name: 'Return photograph of pair damage-02' })).toBeVisible()
  await expect(opened.locator('[data-tone="truth"]')).toHaveCount(1)
  await expect(opened.getByText('New damage at 93% confidence')).toBeVisible()
  await expect(opened.getByText('Should have ended: Findings. Ended: Findings.')).toBeVisible()

  await grid(page).getByRole('columnheader', { name: 'Result' }).click()
  await expect(dataRows(page).first()).toContainText('Sent to a person')
})

test('anyone narrows the pairs by a column’s values, and downloads them for a spreadsheet', async ({ page }) => {
  await page.goto('/reliability')
  await expect(dataRows(page)).toHaveCount(11)
  await grid(page).locator('.ag-header-cell[col-id="verdict"] .ag-header-cell-filter-button').click()
  const filter = page.locator('.ag-set-filter')
  await filter.getByText('(Select All)').click()
  await filter.getByText('Wrong', { exact: true }).click()
  await expect(dataRows(page)).toHaveCount(1)
  await expect(dataRows(page).first()).toContainText('clean-hard-02')
  await page.keyboard.press('Escape')

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download these pairs for a spreadsheet' }).click()
  expect((await download).suggestedFilename()).toBe('hold-gate-pairs.xlsx')
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
