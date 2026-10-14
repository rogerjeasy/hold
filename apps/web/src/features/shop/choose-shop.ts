'use server'

import { findPerson } from '@hold/db'
import { chooseShop, readAccessToken } from '@/features/auth/session-cookies'
import { readLocale } from '@/features/auth/locale-input'
import { redirect } from '@/i18n/navigation'
import { shopRoutes } from '@/lib/routes'
import { getServices } from '@/server/services'

// Switches the shop a person works in. Only to one where they have a role: the cookie is checked again on every
// request by shopAccess, so a forged one reaches nothing.
export async function switchShop(data: FormData): Promise<void> {
  const accessToken = await readAccessToken()
  const shopId = data.get('shopId')
  if (accessToken !== undefined && typeof shopId === 'string') {
    const { identity, database } = await getServices()
    const verified = await identity.verifyAccessToken(accessToken)
    const person = verified.ok ? await findPerson(database, verified.value.subject) : undefined
    if (person?.shops.some((shop) => shop.shopId === shopId) === true) await chooseShop(shopId)
  }
  redirect({ href: shopRoutes.home, locale: readLocale(data.get('locale')) })
}
