import { expect, test } from './support/test'

const headerPages = [
  ['How it works', '/how-it-works', 'One rental, four moments.'],
  ['For shops', '/for-shops', 'Protect every item without charging the people who bring it back.'],
  ['For renters', '/for-renters', 'Keep your money while you rent.'],
  ['The AI', '/ai', 'The AI compares. A person decides.'],
  ['PayPal', '/paypal', 'Reserved is not charged. PayPal makes that real.'],
] as const

test.describe('on a laptop', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  for (const [name, path, title] of headerPages) {
    test(`the header link "${name}" opens its own page`, async ({ page }) => {
      await page.goto('/')
      await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name }).click()
      await expect(page).toHaveURL(path)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
      await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name })).toHaveAttribute('aria-current', 'page')
    })
  }

  test('the header button opens the demo page', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('banner').getByRole('link', { name: 'Open the demo shop' }).click()
    await expect(page).toHaveURL('/demo')
    await expect(page.getByRole('note')).toContainText('The demo shop is open.')
  })

  test('the header leads to sign-in, and sign-in to sign-up and back', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('banner').getByRole('link', { name: 'Sign in' }).click()
    await expect(page).toHaveURL('/sign-in')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in to your shop.')
    await page.getByRole('link', { name: 'Create a shop account' }).click()
    await expect(page).toHaveURL('/sign-up')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Open your shop on Hold.')
    await page.getByRole('main').getByRole('link', { name: 'Sign in' }).click()
    await expect(page).toHaveURL('/sign-in')
  })

  test('the footer leads to the privacy notice, and the notice to the terms of use', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('navigation', { name: 'Privacy and terms' }).getByRole('link', { name: 'Privacy notice' }).click()
    await expect(page).toHaveURL('/privacy')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy notice')
    await page.getByRole('main').getByRole('link', { name: 'Read the terms of use' }).click()
    await expect(page).toHaveURL('/terms')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Terms of use')
  })

  test('the logo leads home from any page', async ({ page }) => {
    await page.goto('/paypal')
    await page.getByRole('link', { name: 'Hold, home page' }).click()
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('One photograph settles it.')
  })

  test('the two doors lead shops and renters each to their own page', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: "For renters See the renter's view" }).first().click()
    await expect(page).toHaveURL('/for-renters')
    await page.goBack()
    await page.getByRole('link', { name: "For shops See the shop's view" }).first().click()
    await expect(page).toHaveURL('/for-shops')
  })

  test('a page opened from the foot of the home page starts at its own top', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })
    })
    await page.getByRole('link', { name: "For renters See the renter's view" }).last().click()
    await expect(page).toHaveURL('/for-renters')
    // Read at once, not after a wait: a page that glides up from the old position would still be far down.
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
    await expect(page.getByRole('heading', { level: 1 })).toBeInViewport()
  })

  test('no link on any page only jumps within the page, apart from the skip link', async ({ page }) => {
    for (const [, path] of headerPages) {
      await page.goto(path)
      const anchors = await page.locator('a[href*="#"]').evaluateAll((links) => links.map((link) => link.getAttribute('href')))
      expect(anchors).toEqual(['#main'])
    }
  })
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the menu lists the pages and closes after one is chosen', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden()
    await page.getByRole('button', { name: 'Open menu' }).click()
    const menu = page.getByRole('dialog', { name: 'Menu' })
    await expect(menu.getByRole('link')).toHaveCount(7)
    await menu.getByRole('link', { name: 'For shops' }).click()
    await expect(page).toHaveURL('/for-shops')
    await expect(menu).toBeHidden()
  })

  test('the menu closes with the Escape key and returns focus to its button', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Open menu' }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeFocused()
  })
})

test('an address with no page answers 404 in the site frame', async ({ page, browserErrors }) => {
  const response = await page.goto('/no-such-page')
  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('This page does not exist.')
  await expect(page.getByRole('link', { name: 'Back to the home page' })).toHaveAttribute('href', '/')
  // The browser logs the 404 response itself as a console error. That one is the point of this test.
  browserErrors.length = 0
})

test('the skip link moves keyboard users past the header', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/#main')
})
