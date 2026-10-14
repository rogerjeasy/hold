import 'server-only'
import { getLocale } from 'next-intl/server'
import { redirect } from '@/i18n/navigation'
import { routes, shopRoutes } from '@/lib/routes'
import { shopAccess } from './shop-access'
import type { ShopContext } from './shop-access'

// For a signed-in page inside a shop: the shop context, or a redirect to where the person belongs.
export async function requireShop(): Promise<ShopContext> {
  const access = await shopAccess()
  const locale = await getLocale()
  if (access.kind === 'signed_out') return redirect({ href: routes.signIn, locale })
  if (access.kind === 'no_shop') return redirect({ href: shopRoutes.home, locale })
  return access.context
}
