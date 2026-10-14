import { expect, test } from './support/test'

test.use({ viewport: { width: 1280, height: 800 } })

async function chooseLanguage(page: import('@playwright/test').Page, label: string, name: string) {
  await page.getByRole('button', { name: label }).click()
  await page.getByRole('menuitem', { name }).click()
  // Wait for every request the switch sets off, so one that fails is caught by the browser-error check.
  await page.waitForLoadState('networkidle')
}

test('English is served at the bare address', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})

test('choosing German keeps the reader on the same page, in German', async ({ page }) => {
  await page.goto('/for-shops')
  await chooseLanguage(page, 'Language', 'Deutsch')
  await expect(page).toHaveURL('/de/for-shops')
  await expect(page.locator('html')).toHaveAttribute('lang', 'de')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Schützen Sie jeden Artikel, ohne denen etwas abzubuchen, die ihn zurückbringen.')
})

test('header links stay in the chosen language', async ({ page }) => {
  await page.goto('/es')
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Cómo funciona' }).click()
  await expect(page).toHaveURL('/es/how-it-works')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Un alquiler, cuatro momentos.')
})

test('choosing English again returns to the bare address', async ({ page }) => {
  await page.goto('/fr/ai')
  await chooseLanguage(page, 'Langue', 'English')
  await expect(page).toHaveURL('/ai')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})

test('amounts follow the reader language', async ({ page }) => {
  await page.goto('/de')
  await expect(page.getByText('300 € reserviert · 35 € abgebucht · 265 € freigegeben')).toBeVisible()
})

for (const [locale, title] of [
  ['es', 'Una fotografía lo resuelve.'],
  ['fr', 'Une photo règle tout.'],
  ['de', 'Ein Foto klärt es.'],
] as const) {
  test(`the home page is translated into ${locale}`, async ({ page }) => {
    await page.goto(`/${locale}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
    await expect(page).not.toHaveTitle(/the deposit that never leaves/)
  })
}
