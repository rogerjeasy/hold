import type { ReactNode } from 'react'
import type { ShellProps } from './shell-props'
import { ShopSidebar } from './shop-sidebar'
import { ShopTopBar } from './shop-top-bar'

// The frame of every signed-in page in a shop: the shop's menu beside the page, or above it on a phone.
export function ShopShell({ children, ...shell }: ShellProps & { children: ReactNode }) {
  return (
    <div className="flex-1 md:grid md:grid-cols-[4.75rem_minmax(0,1fr)] lg:grid-cols-[16.5rem_minmax(0,1fr)]">
      <ShopSidebar {...shell} />
      <div className="flex min-w-0 flex-col">
        <ShopTopBar {...shell} />
        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  )
}
