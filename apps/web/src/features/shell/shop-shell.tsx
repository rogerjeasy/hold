import type { ReactNode } from 'react'
import type { ShellProps } from './shell-props'
import { ShopSidebar } from './shop-sidebar'
import { ShopTabBar } from './shop-tab-bar'
import { ShopTopBar } from './shop-top-bar'

// The frame of every signed-in page in a shop. From lg the shop's menu sits in the dark band and the page floats beside
// it on its own rounded sheet of paper. Below lg the menu moves behind a tab bar at the foot of the screen, within
// thumb reach at the counter. --shop-bottom-inset is the height that bar takes, for anything a page pins to its foot.
export function ShopShell({ children, ...shell }: ShellProps & { children: ReactNode }) {
  return (
    <div className="flex-1 bg-band [--shop-bottom-inset:calc(4.5rem+env(safe-area-inset-bottom))] lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:[--shop-bottom-inset:0px]">
      <ShopSidebar {...shell} />
      <div className="flex min-h-dvh min-w-0 flex-col bg-background lg:my-2 lg:mr-2 lg:min-h-[calc(100dvh-1rem)] lg:rounded-2xl lg:shadow-overlay">
        <ShopTopBar {...shell} />
        <main id="main" className="min-w-0 flex-1 pb-(--shop-bottom-inset)">
          {children}
        </main>
      </div>
      <ShopTabBar {...shell} />
    </div>
  )
}
