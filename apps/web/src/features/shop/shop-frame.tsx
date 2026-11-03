import type { ReactNode } from 'react'

type ShopFrameProps = {
  readonly shopName: string
  readonly title: string
  // One or two sentences under the title: what this page is for.
  readonly description?: string
  // The page's main actions, beside the title from md and under it on a phone.
  readonly actions?: ReactNode
  readonly children: ReactNode
}

// The head of a signed-in page inside the shop's frame: which shop, the page's title and what it is for, then the
// page. The shop's menu is in the frame itself (features/shell).
export function ShopFrame({ shopName, title, description, actions, children }: ShopFrameProps) {
  return (
    <div className="mx-auto w-full max-w-app px-4 pt-6 pb-14 md:px-8 md:pt-9 lg:px-10">
      <header className="flex animate-rise flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 flex-[1_1_28rem]">
          <p className="label flex items-center gap-2 text-xs text-muted-foreground wrap-long-words">
            <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-primary" />
            {shopName}
          </p>
          <h1 className="mt-2.5 text-page-title text-balance wrap-long-words">{title}</h1>
          {description === undefined ? null : <p className="mt-3 max-w-prose text-lead text-muted-foreground">{description}</p>}
        </div>
        {actions === undefined ? null : <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className="mt-8 min-w-0 animate-rise [animation-delay:80ms] md:mt-10">{children}</div>
    </div>
  )
}
