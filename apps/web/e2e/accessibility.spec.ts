import AxeBuilder from '@axe-core/playwright'
import { locales, localized, pages } from './support/pages'
import { expect, test } from './support/test'

const themes = ['light', 'dark'] as const

for (const theme of themes) {
  for (const { key, path } of pages) {
    test(`${key} passes the accessibility checks in the ${theme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
      await page.goto(path)
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
      expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`)).toEqual([])
    })
  }
}

for (const locale of locales) {
  test(`the ${locale} home page passes the accessibility checks`, async ({ page }) => {
    await page.goto(localized('/', locale))
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(results.violations.map((violation) => violation.id)).toEqual([])
  })
}

test('the phone menu passes the accessibility checks while open', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Open menu' }).click()
  await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible()
  const results = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(results.violations.map((violation) => violation.id)).toEqual([])
})
