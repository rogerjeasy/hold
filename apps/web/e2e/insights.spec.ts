import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expectFitsEveryWidth } from './support/responsive'
import { expectInShop } from './support/sign-in'
import { expect, test } from './support/test'

// The insights dashboard (extensions.md section 12.5) on AG Studio, as the demo shop's owner and counter staff open it:
// the money ledger's and the fleet's figures in Studio's widgets, and the insights agent, whose every model turn goes
// through Hold's server. In the test environment the agent answers from a script that says it is simulated.

async function openInsights(page: Page, as: 'Tomás, the owner' | 'Jonas, at the counter' = 'Tomás, the owner'): Promise<void> {
  await page.goto('/sign-in')
  await page.getByRole('region', { name: 'Try the demo shop' }).getByRole('button', { name: `Start a demo as ${as}` }).click()
  await expectInShop(page, 'Ribeira Bikes')
  await page.getByRole('navigation', { name: 'Shop pages' }).getByRole('link', { name: 'Insights' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Insights')
}

const dashboard = (page: Page) => page.getByRole('region', { name: 'Insights dashboard' })
// A widget's title, as Studio heads the widget on the canvas.
const widgetTitle = (page: Page, title: string) => dashboard(page).locator('.ag-studio-layout-widget-title').filter({ hasText: title })
// A headline figure, as Studio's value widget shows it.
const figure = (page: Page, value: string) => dashboard(page).locator('.ag-studio-value-widget-content').filter({ hasText: value })

test('an owner opens the dashboard on the shop’s own figures, the same the money page shows', async ({ page }) => {
  await openInsights(page)
  await expect(dashboard(page).getByText('Held on renters’ accounts now')).toBeVisible()
  await expect(figure(page, '€3,550.00')).toBeVisible()
  await expect(figure(page, '€613.00')).toBeVisible()
  await expect(figure(page, '€515.00')).toBeVisible()
  await expect(widgetTitle(page, 'Damage priced and recovered, by item type')).toBeVisible()
})

test('Hold’s own widgets show each live hold on its 29 days and the settlement waterfall, beside holds by trust rung', async ({ page }) => {
  await openInsights(page)
  await expect(widgetTitle(page, 'Holds by trust rung')).toBeVisible()
  await expect(widgetTitle(page, 'Each hold on its 29 days')).toBeVisible()
  await expect(dashboard(page).getByText(/^Day \d+ of 29 · (Assured|Valid|Ending) · €[\d,.]+ held$/).first()).toBeVisible()
  await expect(widgetTitle(page, 'Reserved, captured, released')).toBeVisible()
  await expect(dashboard(page).getByText('Captured and released stay within what was reserved.')).toBeVisible()
  await expect(dashboard(page).getByText('Still held')).toBeVisible()
})

test('the dashboard an owner leaves is kept for the next visit, and goes back to the first one on request', async ({ page }) => {
  await openInsights(page)
  const trust = dashboard(page).locator('.ag-studio-layout-widget').filter({ hasText: 'Holds by trust rung' }).first()
  await trust.click()
  // Studio 3.0.0 names this button by its untranslated key, so it is found by its icon.
  await trust.locator('button:has(.ag-studio-icon-delete)').click()
  await expect(widgetTitle(page, 'Holds by trust rung')).toHaveCount(0)
  await expect(page.getByText('Your dashboard is saved for your next visit.')).toBeVisible()
  await page.reload()
  await expect(figure(page, '€3,550.00')).toBeVisible()
  await expect(widgetTitle(page, 'Holds by trust rung')).toHaveCount(0)

  await page.getByRole('button', { name: 'Back to the first dashboard' }).click()
  await expect(widgetTitle(page, 'Holds by trust rung')).toBeVisible()
  await expect(page.getByText('Your dashboard is saved for your next visit.')).toBeVisible()
  await page.reload()
  await expect(widgetTitle(page, 'Holds by trust rung')).toBeVisible()
})

test('the owner asks the insights agent, whose turn goes through Hold’s server and comes back simulated here', async ({ page }) => {
  await openInsights(page)
  await expect(dashboard(page).getByRole('button', { name: 'Damage by type' })).toBeVisible()
  await dashboard(page).getByRole('textbox', { name: 'Message input' }).fill('Which item type cost the most in damage this year?')
  await dashboard(page).getByRole('button', { name: 'Send message' }).click()
  await expect(dashboard(page).getByText(/^Simulated answer: in this test environment no model is asked/)).toBeVisible()
})

test('counter staff are told only the owner or a manager opens it', async ({ page }) => {
  await openInsights(page, 'Jonas, at the counter')
  await expect(page.getByText('Only the owner or a manager opens the insights dashboard.')).toBeVisible()
  await expect(dashboard(page)).toHaveCount(0)
})

test('on a phone the owner reads the figures the dashboard opens with', async ({ page }) => {
  await openInsights(page)
  // Studio draws after the page; the widths are measured once it has.
  await expect(figure(page, '€3,550.00')).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByText('The dashboard needs a wider screen. These are the figures it opens with.')).toBeVisible()
  await expect(page.getByText('€3,550.00').locator('visible=true')).toBeVisible()
  await expectFitsEveryWidth(page)
})

for (const theme of ['light', 'dark'] as const) {
  test(`the insights page passes the accessibility checks in the ${theme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await openInsights(page)
    await expect(figure(page, '€3,550.00')).toBeVisible()
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`)).toEqual([])
  })
}
