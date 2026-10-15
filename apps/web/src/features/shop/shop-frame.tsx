import type { ReactNode } from 'react'

// The head of a signed-in page inside the shop's frame: which shop, and the page's title. The shop's menu is in the
// frame itself (features/shell).
export function ShopFrame({ shopName, title, children }: { shopName: string; title: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-app px-4 pt-7 pb-14 md:px-8 md:pt-10 lg:px-10">
      <p className="label text-xs text-muted-foreground wrap-long-words">{shopName}</p>
      <h1 className="mt-2.5 text-page-title text-balance wrap-long-words">{title}</h1>
      <div className="mt-8 min-w-0 md:mt-10">{children}</div>
    </div>
  )
}
