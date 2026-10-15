import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { expect } from './test'

// The code the test environment's fake identity service sends every time (apps/web/src/server/services.ts).
export const TEST_CODE = '24681357'

// An address no other test uses, so tests running side by side never meet in the shared fake.
export function newEmail(): string {
  return `owner-${randomUUID().slice(0, 8)}@shop.example`
}

// The Today page of this shop: the greeting, and the shop named in the shop's menu.
export async function expectInShop(page: Page, shopName: string): Promise<void> {
  await expect(page).toHaveURL(/\/shop$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Good (morning|afternoon|evening), /)
  await expect(page.getByRole('button', { name: `Switch shop, now ${shopName}` })).toBeVisible()
}

// Signs a new owner up through the real pages and lands on their shop.
export async function signUpAs(page: Page, email: string, shopName = 'Ribeira Bikes'): Promise<void> {
  await page.goto('/sign-up')
  await page.getByRole('textbox', { name: 'Your name' }).fill('Tomás')
  await page.getByRole('textbox', { name: 'Shop name' }).fill(shopName)
  await page.getByRole('textbox', { name: 'Work email' }).fill(email)
  await page.getByRole('button', { name: 'Create my shop account' }).click()
  await page.getByRole('textbox', { name: 'Code from the email' }).fill(TEST_CODE)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expectInShop(page, shopName)
}
