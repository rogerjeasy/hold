import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { Link } from '@/i18n/navigation'
import { shopRoutes } from '@/lib/routes'

export type ShopPageKey = keyof typeof shopRoutes

const pageKeys = Object.keys(shopRoutes) as ShopPageKey[]

// The frame of every signed-in page: which shop, the shop's pages, and the page itself.
export function ShopFrame({ shopName, current, title, children }: { shopName: string; current: ShopPageKey; title: string; children: ReactNode }) {
  const t = useTranslations('shop')

  return (
    <div className="mx-auto w-full max-w-page px-4 pt-9 pb-14 md:px-8 md:pt-14 lg:px-10 lg:pt-16">
      <p className="label text-muted-foreground wrap-long-words">{shopName}</p>
      <h1 className="mt-3 text-headline text-balance wrap-long-words">{title}</h1>
      <nav aria-label={t('nav.label')} className="mt-8 border-b">
        <ul className="-mb-px flex flex-wrap gap-x-1">
          {pageKeys.map((key) => (
            <li key={key}>
              <Link
                href={shopRoutes[key]}
                aria-current={key === current ? 'page' : undefined}
                className="inline-flex min-h-11 items-center border-b-2 border-transparent px-3 font-semibold text-muted-foreground hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:text-foreground"
              >
                {t(`nav.${key}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-10 min-w-0">{children}</div>
    </div>
  )
}
