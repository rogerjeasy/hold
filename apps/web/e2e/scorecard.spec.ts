import { newEmail, signUpAs } from './support/sign-in'
import { expect, test } from './support/test'

// Until a run over the evaluation set is accepted, Hold claims no accuracy, for the owner and in public alike.
test('the owner reaches the scorecard from the shop menu, and it claims nothing before a run is accepted', async ({ page }) => {
  await signUpAs(page, newEmail())
  await page.getByRole('navigation', { name: 'Shop pages' }).getByRole('link', { name: 'Reliability' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('How reliable is the comparison')
  await expect(page.getByText('Not measured yet')).toBeVisible()
  await expect(page.getByText('No finding has been decided in your shop yet.')).toBeVisible()
})

test('anyone can read the scorecard without signing in, linked from every page\'s footer', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('contentinfo').getByRole('link', { name: 'Reliability' }).click()
  await expect(page).toHaveURL(/\/reliability$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('How reliable is the comparison')
  await expect(page.getByText('Not measured yet')).toBeVisible()
})
