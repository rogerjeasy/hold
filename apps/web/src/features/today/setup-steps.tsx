import { ArrowRight, Check, Rocket } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from 'cn'
import type { CSSProperties } from 'react'
import { StatusPill } from '@/components/ui/status-pill'
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

// How far along the shop is, as a ring that fills; the words beside it say the same.
function ProgressRing({ done, total }: { done: number; total: number }) {
  const radius = 20
  const length = 2 * Math.PI * radius
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="size-12 shrink-0 -rotate-90">
      <circle cx="24" cy="24" r={radius} fill="none" strokeWidth="5" className="stroke-muted" />
      <circle
        cx="24"
        cy="24"
        r={radius}
        fill="none"
        strokeWidth="5"
        strokeLinecap="round"
        className="animate-draw stroke-primary"
        strokeDasharray={`${String((done / total) * length)} ${String(length)}`}
        style={{ '--draw-length': String((done / total) * length) } as CSSProperties}
      />
    </svg>
  )
}

// What is left before the shop can take its first hold, what is left first. Shown until every step is done.
export function SetupSteps({ setup }: { setup: SetupStatus }) {
  const t = useTranslations('shop.setup')
  const today = useTranslations('today.setup')
  const done = setupDone(setup)
  const count = Object.values(done).filter(Boolean).length
  const ordered = [...steps.filter(({ key }) => !done[key]), ...steps.filter(({ key }) => done[key])]

  return (
    <Panel
      title={t('title')}
      icon={Rocket}
      aside={
        <p className="flex items-center gap-3">
          <span className="label text-xs text-muted-foreground">{today('progress', { done: count, total: steps.length })}</span>
          <ProgressRing done={count} total={steps.length} />
        </p>
      }
    >
      <p className="px-4 pt-4 text-[0.9375rem] text-muted-foreground md:px-5">{today('lead')}</p>
      <ul className="grid stagger gap-2 p-3 md:grid-cols-2 md:p-4">
        {ordered.map(({ key, href }) => (
          <li
            key={key}
            className={cn(
              'grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 rounded-xl border p-3.5 md:p-4',
              done[key] ? 'border-transparent bg-muted/45' : 'border-border bg-card shadow-xs',
            )}
          >
            <span
              aria-hidden="true"
              className={cn('mt-0.5 grid size-7 place-items-center rounded-full', done[key] ? 'bg-success/15 text-success' : 'border-2 border-dashed border-border-strong text-muted-foreground')}
            >
              {done[key] ? <Check className="size-4" /> : null}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h3 className={cn('font-bold wrap-long-words', done[key] && 'text-muted-foreground')}>{t(`${key}.title`)}</h3>
                {done[key] ? <StatusPill tone="success">{t('done')}</StatusPill> : <StatusPill tone="attention">{t('toDo')}</StatusPill>}
              </div>
              <p className="mt-1 text-[0.9375rem] text-muted-foreground">{t(`${key}.body`)}</p>
              {done[key] ? null : (
                <Link href={href} className="group mt-1.5 inline-flex min-h-11 items-center gap-1.5 text-[0.9375rem] font-semibold text-primary underline-offset-4 hover:underline">
                  {t(`${key}.action`)}
                  <ArrowRight aria-hidden="true" className="size-4 transition-transform duration-300 ease-spring group-hover:translate-x-0.5" />
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
