import { CircleCheck, CircleDashed } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { shopRoutes } from '@/lib/routes'
import { Panel } from '@/components/ui/panel'

export type SetupStatus = { readonly passkey: boolean; readonly paypal: boolean; readonly prices: boolean; readonly items: number; readonly staff: number }

const steps = [
  { key: 'passkey', href: shopRoutes.security },
  { key: 'prices', href: shopRoutes.prices },
  { key: 'items', href: shopRoutes.items },
  { key: 'paypal', href: shopRoutes.paypal },
  { key: 'staff', href: shopRoutes.staff },
] as const

export function setupDone(setup: SetupStatus) {
  return { passkey: setup.passkey, prices: setup.prices, items: setup.items > 0, paypal: setup.paypal, staff: setup.staff > 1 }
}

// What is left before the shop can take its first hold. Shown until every step is done.
export function SetupSteps({ setup }: { setup: SetupStatus }) {
  const t = useTranslations('shop.setup')
  const today = useTranslations('today.setup')
  const done = setupDone(setup)
  const count = Object.values(done).filter(Boolean).length

  return (
    <Panel title={t('title')} aside={<p className="label text-xs text-muted-foreground">{today('progress', { done: count, total: steps.length })}</p>}>
      <div aria-hidden="true" className="flex h-1 gap-0.5 bg-card">
        {steps.map(({ key }) => (
          <span key={key} className={done[key] ? 'flex-1 bg-primary' : 'flex-1 bg-muted'} />
        ))}
      </div>
      <ul className="grid md:grid-cols-2">
        {steps.map(({ key, href }) => (
          <li key={key} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 border-t px-4 py-4 md:px-5 md:odd:border-r">
            {done[key] ? <CircleCheck aria-hidden="true" className="mt-0.5 size-5 text-primary" /> : <CircleDashed aria-hidden="true" className="mt-0.5 size-5 text-muted-foreground" />}
            <div className="min-w-0">
              <h3 className="font-bold wrap-long-words">{t(`${key}.title`)}</h3>
              <p className="mt-1 text-[0.9375rem] text-muted-foreground">{t(`${key}.body`)}</p>
              <p className="mt-1.5 text-sm font-semibold">{done[key] ? t('done') : t('toDo')}</p>
              {done[key] ? null : (
                <Link href={href} className="inline-flex min-h-11 items-center text-[0.9375rem] font-semibold underline underline-offset-4">
                  {t(`${key}.action`)}
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
