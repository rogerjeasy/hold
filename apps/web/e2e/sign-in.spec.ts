import { newEmail, signUpAs, TEST_CODE } from './support/sign-in'
import { expect, test } from './support/test'

test('sign-in names a mistyped address without sending it', async ({ page }) => {
  await page.goto('/sign-in')
  const email = page.getByRole('textbox', { name: 'Work email' })
  await email.fill('tomas')
  await page.getByRole('button', { name: 'Email me a code' }).click()
  await expect(email).toHaveAccessibleDescription('That does not look like an email address. Check it and try again.')
  await expect(email).toBeFocused()
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0)
})

test('a new owner signs up with the emailed code and lands on their shop', async ({ page }) => {
  const email = newEmail()
  await signUpAs(page, email)
  await expect(page).toHaveURL(/\/shop$/)
  await expect(page.getByText(`Signed in as ${email}.`)).toBeVisible()
})

test('an owner signs out, then signs back in with a new code', async ({ page }) => {
  const email = newEmail()
  await signUpAs(page, email)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/:\d+\/$/)
  await page.goto('/shop')
  await expect(page).toHaveURL(/\/sign-in$/)

  await page.getByRole('textbox', { name: 'Work email' }).fill(email)
  await page.getByRole('button', { name: 'Email me a code' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check your email.')
  await expect(page.getByText(`We sent a code to ${email}.`, { exact: false })).toBeVisible()
  await page.getByRole('textbox', { name: 'Code from the email' }).fill(TEST_CODE)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ribeira Bikes')
})

test('a wrong code is named, and the address can be changed', async ({ page }) => {
  await page.goto('/sign-in')
  await page.getByRole('textbox', { name: 'Work email' }).fill(newEmail())
  await page.getByRole('button', { name: 'Email me a code' }).click()
  const code = page.getByRole('textbox', { name: 'Code from the email' })
  await code.fill('11112222')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(code).toHaveAccessibleDescription('That code is not right. Check it and try again.')
  await page.getByRole('button', { name: 'Use a different email' }).click()
  await expect(page.getByRole('textbox', { name: 'Work email' })).toBeVisible()
})

test('sign-up works by keyboard alone', async ({ page }) => {
  await page.goto('/sign-up')
  await page.getByRole('textbox', { name: 'Your name' }).focus()
  await page.keyboard.type('Tomás')
  await page.keyboard.press('Tab')
  await page.keyboard.type('Ribeira Bikes')
  await page.keyboard.press('Tab')
  await page.keyboard.type(newEmail())
  await page.keyboard.press('Enter')
  await expect(page.getByRole('textbox', { name: 'Code from the email' })).toBeFocused()
  await page.keyboard.type(TEST_CODE)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ribeira Bikes')
})

test('the sign-in page reads in the visitor’s language', async ({ page }) => {
  await page.goto('/de/sign-in')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Melden Sie sich bei Ihrem Verleih an.')
  await page.getByRole('button', { name: 'Code per E-Mail senden' }).click()
  await expect(page.getByRole('textbox', { name: 'Geschäftliche E-Mail' })).toHaveAccessibleDescription('Geben Sie Ihre E-Mail-Adresse ein.')
})
