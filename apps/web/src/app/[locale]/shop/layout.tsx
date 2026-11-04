import type { ReactNode } from 'react'
import { ShopShell } from '@/features/shell/shop-shell'
import { SiteFrame } from '@/features/site/site-frame'
import { shopAccess } from '@/server/shop-access'

// Every page in a shop sits in the shop's frame. The frame is not the access check: each page and each action asks
// shopAccess itself. A person with no shop, or signed out on the way to a redirect, sees the public site's frame.
// The frame reads nothing of its own: whether PayPal is connected comes with the access, so the first byte of every
// shop page waits for one transaction (packages/db/src/accounts.ts).
export default async function ShopLayout({ children }: { children: ReactNode }) {
  const access = await shopAccess()
  if (access.kind !== 'in_shop') return <SiteFrame>{children}</SiteFrame>
  const { context } = access
  return (
    <ShopShell person={context.person} shop={{ id: context.shop.id, name: context.shop.name }} role={context.role} paypalConnected={context.paypalConnected}>
      {children}
    </ShopShell>
  )
}
