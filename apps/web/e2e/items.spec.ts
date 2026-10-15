import type { Page } from '@playwright/test'
import { addVirtualAuthenticator } from './support/passkey'
import { expectFitsEveryWidth } from './support/responsive'
import { newEmail, signUpAs } from './support/sign-in'
import { expect, test } from './support/test'

// An owner with a passkey and a published price list, on the items page.
async function ownerWithPrices(page: Page, shopName?: string): Promise<void> {
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

async function newType(page: Page, name: string): Promise<void> {
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

async function addItems(page: Page, typeName: string, count: string, size: string): Promise<void> {
  const type = page.getByRole('region', { name: typeName })
  await type.getByText('Add items').first().click()
  await type.getByLabel('How many').fill(count)
  await type.getByLabel('Size').fill(size)
  await type.getByRole('button', { name: 'Add items' }).click()
  await expect(type.getByText('Items added.')).toBeVisible()
}

test('an owner adds an item type and its items, then sends one to repair and back', async ({ page }) => {
  await ownerWithPrices(page)
  await expect(page.getByText('No items yet')).toBeVisible()

  await newType(page, 'City e-bike')
  const type = page.getByRole('region', { name: 'City e-bike' })
  await expect(type.getByText('€300.00')).toBeVisible()
  await expect(type.getByText('6 views')).toBeVisible()
  await expect(type.getByText('1 × Charger')).toBeVisible()

  await addItems(page, 'City e-bike', '3', 'M')
  await expect(type.getByRole('link', { name: 'City e-bike 3' })).toBeVisible()

  await type.getByRole('link', { name: 'City e-bike 2' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('City e-bike 2')
  await expect(page.getByText('Not rented yet.')).toBeVisible()
  await page.getByLabel('What needs repair').fill('Brake pads worn')
  await page.getByRole('button', { name: 'Send to repair' }).click()
  await expect(page.getByText('Brake pads worn')).toBeVisible()
  await page.getByRole('button', { name: 'Back in service' }).click()
  await expect(page.getByRole('button', { name: 'Send to repair' })).toBeVisible()

  await page.getByRole('link', { name: 'All items' }).click()
  await page.getByRole('navigation', { name: 'Show items' }).getByRole('link', { name: 'In repair' }).click()
  await expect(page.getByText('No items here.')).toBeVisible()

  // The shop's first item ticks its setup step.
  await page.getByRole('navigation', { name: 'Shop pages' }).getByRole('link', { name: 'Today' }).click()
  await expect(page.getByRole('region', { name: 'Set up your shop' }).getByText('Done.')).toHaveCount(3)
})

test('editing a type’s views keeps the type and its items', async ({ page }) => {
  await ownerWithPrices(page)
  await newType(page, 'Gravel bike')
  await addItems(page, 'Gravel bike', '1', 'L')
  await page.getByRole('link', { name: 'Edit Gravel bike' }).click()
  await expect(page.getByText(/Changing the views starts a new photo plan/)).toBeVisible()
  await page.getByRole('button', { name: 'Remove view 6' }).click()
  await page.getByRole('button', { name: 'Save item type' }).click()
  await expect(page).toHaveURL(/\/shop\/items$/)
  const type = page.getByRole('region', { name: 'Gravel bike' })
  await expect(type.getByText('5 views')).toBeVisible()
  await expect(type.getByRole('link', { name: 'Gravel bike 1' })).toBeVisible()
})

test('the items pages fit every width, with long names', async ({ page }) => {
  await ownerWithPrices(page, 'Ribeira Bicicletas e Caiaques do Douro Litoral')
  const longName = 'Elektrisches Lastenfahrrad mit Kindersitz'
  await newType(page, longName)
  await addItems(page, longName, '2', 'XL')
  await expectFitsEveryWidth(page)

  await page.getByRole('link', { name: `${longName} 1` }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${longName} 1`)
  await expectFitsEveryWidth(page)

  await page.goto('/shop/items/new')
  await expect(page.getByRole('textbox', { name: 'View 1' })).toBeVisible()
  await expectFitsEveryWidth(page)
})

test('another shop’s owner gets no item page, only a 404', async ({ page, browser, browserErrors }) => {
  await ownerWithPrices(page)
  await newType(page, 'Tandem kayak')
  await addItems(page, 'Tandem kayak', '1', '')
  await page.getByRole('link', { name: 'Tandem kayak 1' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tandem kayak 1')
  const address = page.url()

  const other = await (await browser.newContext()).newPage()
  await signUpAs(other, newEmail(), 'Douro Kayaks')
  const response = await other.goto(address)
  expect(response?.status()).toBe(404)
  await expect(other.getByText('Tandem kayak 1')).toHaveCount(0)
  await other.context().close()
  // The 404 the browser logs is the point of this test. The fixture watches the first page only.
  browserErrors.length = 0
})
