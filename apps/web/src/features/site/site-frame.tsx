import type { ReactNode } from 'react'
import { SiteFooter } from './site-footer'
import { SiteHeader } from './site-header'

// The public site's frame: its header, the page, and its footer. Signed-in pages have the shop's frame instead.
export function SiteFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter year={new Date().getFullYear()} />
    </>
  )
}
