import { locales, localized, pages } from './support/pages'
import { expectNoClippedText, expectNoSidewaysScroll, expectNothingOutsideViewport, expectTouchTargets, viewports } from './support/responsive'
import { newEmail, signUpAs } from './support/sign-in'
import { test } from './support/test'

for (const locale of locales) {
  for (const { key, path } of pages) {
    for (const viewport of viewports) {
      test(`${locale} ${key} fits a ${viewport.name} wide screen`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        await page.goto(localized(path, locale))
        await expectNoSidewaysScroll(page)
        await expectNothingOutsideViewport(page)
        await expectNoClippedText(page)
        await expectTouchTargets(page)
      })
    }
  }
}

// The signed-in shop page, reached by signing up, with a long shop name and a long address to wrap.
for (const viewport of viewports) {
  test(`the shop page fits a ${viewport.name} wide screen`, async ({ page }) => {
    await signUpAs(page, `a-very-long-address-${newEmail()}`, 'Ribeira Bicicletas e Caiaques do Douro Litoral')
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await expectNoSidewaysScroll(page)
    await expectNothingOutsideViewport(page)
    await expectNoClippedText(page)
    await expectTouchTargets(page)
  })
}
