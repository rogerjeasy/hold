import type { HoldState } from '@hold/domain'
import { CircleAlert, CircleCheck, CircleDashed } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { cn } from 'cn'
import { useShopFormat } from '@/hooks/use-shop-format'
import { Link } from '@/i18n/navigation'
import { linkRoutes } from '@/lib/routes'
import type { ReceiptData } from './return-receipt'
import { useWhenChecked } from './return-intro'
import type { ReturnPromise } from './return-intro'

type StepState = 'done' | 'next' | 'waiting' | 'problem'

const ICONS: Readonly<Record<StepState, LucideIcon>> = { done: CircleCheck, next: CircleDashed, waiting: CircleDashed, problem: CircleAlert }
const RELEASED: ReadonlySet<HoldState> = new Set(['released', 'expired'])
const CHARGED: ReadonlySet<HoldState> = new Set(['captured', 'invoiced'])

function Step({ state, title, children }: { state: StepState; title: string; children: ReactNode }) {
  const Icon = ICONS[state]
  return (
    <li className="relative grid grid-cols-[1.375rem_minmax(0,1fr)] gap-3 pb-5 last:pb-0 [&:not(:last-child)]:before:absolute [&:not(:last-child)]:before:top-7 [&:not(:last-child)]:before:bottom-1 [&:not(:last-child)]:before:left-[0.625rem] [&:not(:last-child)]:before:w-0.5 [&:not(:last-child)]:before:bg-border">
      <Icon aria-hidden="true" className={cn('mt-0.5 size-5.5', state === 'done' && 'text-success', state === 'next' && 'text-primary', state === 'waiting' && 'text-muted-foreground', state === 'problem' && 'text-destructive')} />
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <div className="mt-0.5 text-[0.9375rem] text-muted-foreground">{children}</div>
      </div>
    </li>
  )
}

// The return in three steps: sent by the renter, seen by a person, then the hold released or a claim to answer.
// The words say where each step stands, so colour is never alone.
export function ReturnSteps({ token, data, promise, count }: { token: string; data: ReceiptData; promise: ReturnPromise; count: number }) {
  const t = useTranslations('selfReturn.renter.steps')
  const format = useShopFormat({ timeZone: promise.timeZone, currency: promise.currency })
  const whenChecked = useWhenChecked(promise)
  const checked = data.rentalState !== 'dropped_off'
  const holdState = data.hold?.state
  const released = holdState !== undefined && RELEASED.has(holdState)
  const charged = holdState !== undefined && CHARGED.has(holdState)
  return (
    <section aria-labelledby="return-steps" className="grid gap-4 border bg-card px-4 py-5 md:px-5">
      <h2 id="return-steps" className="text-[1.0625rem] leading-tight font-extrabold tracking-tight">{t('title')}</h2>
      <ol>
        <Step state="done" title={t('returned')}>{t('returnedDetail', { count, time: format.time(data.droppedOffAt) })}</Step>
        {checked ? <Step state="done" title={t('checked', { shop: promise.shopName })}>{t('checkedDetail')}</Step>
          : data.missingAt === null ? <Step state="next" title={t('check')}>{whenChecked}</Step>
            : <Step state="problem" title={t('notFound')}>{t('notFoundDetail', { shop: promise.shopName })}</Step>}
        {released ? <Step state="done" title={t('released')}>{t('releasedDetail')}</Step>
          : charged ? <Step state="done" title={t('charged')}><Link href={linkRoutes.claim(token)} referrerPolicy="no-referrer" className="font-semibold text-foreground underline underline-offset-4">{t('seeClaim')}</Link></Step>
            : <Step state="waiting" title={t('settle')}>{t('settleDetail')}</Step>}
      </ol>
    </section>
  )
}
