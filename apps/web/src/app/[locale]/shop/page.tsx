import { currentPriceList, findPayPalAccount, inShop, listStaff } from '@hold/db'
import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { readAccessToken } from '@/features/auth/session-cookies'
import { NoShop, ShopHome } from '@/features/shop/shop-home'
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
  const scope = { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId } as const
  const [loaded, passkeys] = await Promise.all([
    inShop(database, scope, async (transaction) => ({
      paypal: await findPayPalAccount(transaction, context.shop.id, config.paypalMode),
      prices: await currentPriceList(transaction),
      staff: await listStaff(transaction),
    })),
    identity.listPasskeys((await readAccessToken()) ?? ''),
  ])
  const setup = {
    passkey: passkeys.ok && passkeys.value.length > 0,
    paypal: loaded.paypal !== undefined,
    prices: loaded.prices !== undefined,
    staff: loaded.staff.length,
  }
  return <ShopHome person={context.person} shopId={context.shop.id} shopName={context.shop.name} setup={setup} />
}
