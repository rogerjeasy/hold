import { CircleCheck, CircleDashed, LogOut } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useId } from 'react'
import type { Person } from '@hold/db'
import { Button } from '@/components/ui/button'
import { signOut } from '@/features/auth/actions'
import { Link } from '@/i18n/navigation'
import { shopRoutes } from '@/lib/routes'
import { switchShop } from './choose-shop'
import { ShopFrame } from './shop-frame'

export type SetupStatus = { readonly passkey: boolean; readonly paypal: boolean; readonly prices: boolean; readonly staff: number }

const setupSteps = [
  { key: 'passkey', href: shopRoutes.security },
  { key: 'prices', href: shopRoutes.prices },
  { key: 'paypal', href: shopRoutes.paypal },
  { key: 'staff', href: shopRoutes.staff },
] as const

function SignOutForm() {
  const t = useTranslations('shop')
  const locale = useLocale()
  return (
    <form action={signOut} className="mt-12">
      <input type="hidden" name="locale" value={locale} />
      <Button type="submit" variant="outline" className="min-h-11">
        <LogOut aria-hidden="true" />
        {t('signOut')}
      </Button>
    </form>
  )
}

// A signed-in person with an account and no shop: a sign-up whose shop could not be created, or someone not yet
// invited anywhere.
export function NoShop({ person }: { person: Person | undefined }) {
  const t = useTranslations('shop')
  return (
    <div className="mx-auto w-full max-w-page px-4 pt-9 pb-14 md:px-8 md:pt-14 lg:px-10 lg:pt-16">
      <div className="max-w-prose min-w-0">
        <h1 className="text-headline text-balance wrap-long-words">{t('noShop.title')}</h1>
        {person === undefined ? null : <p className="mt-5 text-lead text-muted-foreground wrap-long-words">{t('signedInAs', { email: person.email })}</p>}
        <p className="mt-3 text-muted-foreground">{t('noShop.body')}</p>
      </div>
      <SignOutForm />
    </div>
  )
}

// The first page after signing in: the shop, what is left to set up, and the way to the others.
export function ShopHome({ person, shopId, shopName, setup }: { person: Person; shopId: string; shopName: string; setup: SetupStatus }) {
  const t = useTranslations('shop')
  const locale = useLocale()
  const stepsTitleId = useId()
  const otherShops = person.shops.filter((shop) => shop.shopId !== shopId)
  const done = { passkey: setup.passkey, prices: setup.prices, paypal: setup.paypal, staff: setup.staff > 1 }

  return (
    <ShopFrame shopName={t('label')} current="home" title={shopName}>
      <p className="max-w-prose text-lead text-muted-foreground wrap-long-words">{t('signedInAs', { email: person.email })}</p>

      <section aria-labelledby={stepsTitleId} className="mt-12 max-w-prose">
        <h2 id={stepsTitleId} className="text-title text-balance">
          {t('setup.title')}
        </h2>
        <ul className="mt-6 border-t">
          {setupSteps.map(({ key, href }) => (
            <li key={key} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 border-b py-5">
              {done[key] ? (
                <CircleCheck aria-hidden="true" className="mt-1 size-5 text-primary" />
              ) : (
                <CircleDashed aria-hidden="true" className="mt-1 size-5 text-muted-foreground" />
              )}
              <div className="min-w-0">
                <h3 className="text-xl leading-tight font-bold tracking-tight wrap-long-words">{t(`setup.${key}.title`)}</h3>
                <p className="mt-2 text-muted-foreground">{t(`setup.${key}.body`)}</p>
                <p className="mt-2 text-sm font-semibold">{done[key] ? t('setup.done') : t('setup.toDo')}</p>
                <Link href={href} className="mt-1 inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
                  {t(`setup.${key}.action`)}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {otherShops.length === 0 ? null : (
        <section className="mt-12 max-w-prose">
          <h2 className="text-xl font-bold">{t('otherShops')}</h2>
          <ul className="mt-3 border-t">
            {otherShops.map((other) => (
              <li key={other.shopId} className="flex flex-wrap items-center justify-between gap-2 border-b py-2">
                <span className="min-w-0 wrap-long-words">{other.name}</span>
                <form action={switchShop}>
                  <input type="hidden" name="shopId" value={other.shopId} />
                  <input type="hidden" name="locale" value={locale} />
                  <Button type="submit" variant="ghost" className="min-h-11">
                    {t('switchShop')}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <SignOutForm />
    </ShopFrame>
  )
}
