import { findPayPalAccount, inShop } from '@hold/db'
import type { ReactNode } from 'react'
import { ShopShell } from '@/features/shell/shop-shell'
import { SiteFrame } from '@/features/site/site-frame'
import { getServices } from '@/server/services'
import { shopAccess } from '@/server/shop-access'

// Every page in a shop sits in the shop's frame. The frame is not the access check: each page and each action asks
// shopAccess itself. A person with no shop, or signed out on the way to a redirect, sees the public site's frame.
export default async function ShopLayout({ children }: { children: ReactNode }) {
  const access = await shopAccess()
  if (access.kind !== 'in_shop') return <SiteFrame>{children}</SiteFrame>
  const { context } = access
  const { database, config } = await getServices()
  const paypal = await inShop(database, { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId }, (transaction) =>
    findPayPalAccount(transaction, context.shop.id, config.paypalMode),
  )
  return (
    <ShopShell person={context.person} shop={{ id: context.shop.id, name: context.shop.name }} role={context.role} paypalConnected={paypal !== undefined}>
      {children}
    </ShopShell>
  )
}
