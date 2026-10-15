import { shopDay } from '@hold/domain'
import { currentPriceList, findPayPalAccount, inShop, listStaff, shopToday } from '@hold/db'
import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { readAccessToken } from '@/features/auth/session-cookies'
import { NoShop } from '@/features/shop/shop-home'
import { TodayScreen } from '@/features/today/today-screen'
import { redirect } from '@/i18n/navigation'
import { routes } from '@/lib/routes'
import { getServices } from '@/server/services'
import { shopAccess } from '@/server/shop-access'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.shop')
  // A signed-in page is nobody's search result.
  return { title: t('title'), robots: { index: false, follow: false } }
}

export default async function Page() {
  const access = await shopAccess()
  if (access.kind === 'signed_out') return redirect({ href: routes.signIn, locale: await getLocale() })
  if (access.kind === 'no_shop') return <NoShop person={access.person} />
  const { context } = access
  const { database, identity, config } = await getServices()
  const now = new Date()
  const day = shopDay(context.shop.timeZone, now)
  const scope = { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId } as const
  const [loaded, passkeys] = await Promise.all([
    inShop(database, scope, async (transaction) => ({
      paypal: await findPayPalAccount(transaction, context.shop.id, config.paypalMode),
      prices: await currentPriceList(transaction),
      staff: await listStaff(transaction),
      today: await shopToday(transaction, { now, day }),
    })),
    identity.listPasskeys((await readAccessToken()) ?? ''),
  ])
  const setup = {
    passkey: passkeys.ok && passkeys.value.length > 0,
    paypal: loaded.paypal !== undefined,
    prices: loaded.prices !== undefined,
    staff: loaded.staff.length,
  }
  // Only the owner may add sample rentals, and only to a shop with none (features/shop/actions.ts checks both again).
  const offerSamples = context.role === 'owner' && loaded.today.rentals.total === 0
  const samples = !offerSamples ? 'none' : loaded.prices === undefined ? 'needs_prices' : 'offer'
  const firstName = context.person.name?.trim().split(/\s+/)[0] ?? context.shop.name
  return (
    <TodayScreen
      firstName={firstName === '' ? context.shop.name : firstName}
      shop={{ name: context.shop.name, timeZone: context.shop.timeZone, currency: context.shop.currency }}
      now={now}
      part={day.part}
      setup={setup}
      today={loaded.today}
      samples={samples}
    />
  )
}
