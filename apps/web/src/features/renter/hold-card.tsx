import { cn } from 'cn'
import { ShieldCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

export type HoldCardStanding = 'waiting' | 'reserved' | 'settling' | 'ended' | 'none'

// The hold as the renter's wallet shows it: a dark card with the amount reserved in their own PayPal account, never a
// charge, and where it stands in words. The card keeps one look in both themes, as a card in a wallet does.
export function HoldCard({ amount, standing, children }: { amount: string; standing: HoldCardStanding; children?: ReactNode }) {
  const t = useTranslations('renter.holdCard')
  const live = standing === 'reserved'
  return (
    <div className="relative isolate grid min-w-0 animate-pop gap-5 overflow-hidden rounded-2xl border border-band-border bg-band p-5 text-band-foreground shadow-raised md:p-6">
      <div aria-hidden="true" className="absolute -top-16 -right-16 -z-10 size-48 rounded-full bg-band-accent/12 blur-2xl" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="label flex items-center gap-2 text-xs text-band-muted">
          <ShieldCheck aria-hidden="true" className="size-4 text-band-accent" />
          {t('label')}
        </p>
        <span className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full bg-band-foreground/10 px-2.5 py-1 text-[0.8125rem] leading-none font-semibold">
          <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', standing === 'ended' ? 'bg-band-success' : standing === 'none' || standing === 'waiting' ? 'bg-band-muted' : 'bg-band-accent', live && 'animate-pulse-ring text-band-accent')} />
          <span className="min-w-0 truncate">{t(`standing.${standing}`)}</span>
        </span>
      </div>
      <p className="text-headline tabular-nums wrap-long-words">{amount}</p>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-t border-band-border pt-4 text-sm">
        <p className="text-band-muted">{t('where')}</p>
        <p className="font-semibold text-band-success">{t('notCharged')}</p>
      </div>
      {children}
    </div>
  )
}
