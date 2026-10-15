import type { Page } from '@playwright/test'
import { addVirtualAuthenticator } from './passkey'
import { newEmail, signUpAs } from './sign-in'
import { expect } from './test'

// Setting a shop up through its real pages, for the tests that need one ready.

// An owner with a passkey and a published price list, on the items page.
export async function ownerWithPrices(page: Page, shopName?: string): Promise<void> {
  await addVirtualAuthenticator(page)
  await signUpAs(page, newEmail(), shopName)
  const menu = page.getByRole('navigation', { name: 'Shop pages' })
  await menu.getByRole('link', { name: 'Security' }).click()
  await page.getByRole('button', { name: 'Add a passkey on this device' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Passkey 1' })).toBeVisible()
  await menu.getByRole('link', { name: 'Prices' }).click()
  await expect(page).toHaveURL(/\/shop\/prices$/)
  await page.getByRole('button', { name: 'Confirm with my passkey' }).click()
  await page.getByLabel('Currency').selectOption('EUR')
  await page.getByLabel('Price 1: what it is for').fill('Deep scratch on the frame')
  await page.getByLabel('Amount, in EUR').fill('35')
  await page.getByLabel('What counts as ordinary wear').fill('Light scuffs on the tyres are ordinary wear.')
  await page.getByRole('button', { name: 'Publish this price list' }).click()
  await expect(page.getByText('Price list published.')).toBeVisible()
  await menu.getByRole('link', { name: 'Items' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Items')
}

export async function newType(page: Page, name: string): Promise<void> {
  await page.getByRole('link', { name: 'New item type' }).first().click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('New item type')
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Kind').selectOption('e_bike')
  await expect(page.getByRole('textbox', { name: 'View 6' })).toHaveValue('Battery')
  await page.getByLabel('Value to replace, in EUR').fill('2400')
  await page.getByLabel('Hold while it is out, in EUR').fill('300')
  await page.getByLabel('Fee per day, in EUR').fill('45')
  await page.getByRole('button', { name: 'Add to the kit' }).click()
  await page.getByRole('textbox', { name: 'Kit item 1' }).fill('Charger')
  await page.getByRole('button', { name: 'Save item type' }).click()
  await expect(page).toHaveURL(/\/shop\/items$/)
}

export async function addItems(page: Page, typeName: string, count: string, size: string): Promise<void> {
  const type = page.getByRole('region', { name: typeName })
  await type.getByText('Add items').first().click()
  await type.getByLabel('How many').fill(count)
  await type.getByLabel('Size').fill(size)
  await type.getByRole('button', { name: 'Add items' }).click()
  await expect(type.getByText('Items added.')).toBeVisible()
}

// An owner whose shop can take bookings: prices, PayPal, and an item type with items.
export async function shopReadyToBook(page: Page, shopName?: string): Promise<void> {
  await ownerWithPrices(page, shopName)
  await page.getByRole('navigation', { name: 'Shop pages' }).getByRole('link', { name: 'PayPal' }).click()
  await page.getByLabel('Client ID').fill('sandbox-client-id-for-the-test')
  await page.getByLabel('Secret').fill('sandbox-secret-for-the-test')
  await page.getByRole('button', { name: 'Check and connect' }).click()
  await expect(page.getByText('Connected. PayPal accepted the credentials.')).toBeVisible()
  await page.getByRole('navigation', { name: 'Shop pages' }).getByRole('link', { name: 'Items' }).click()
  await newType(page, 'City e-bike')
  await addItems(page, 'City e-bike', '3', 'M')
}
