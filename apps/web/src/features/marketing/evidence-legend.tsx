import { CircleCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { exampleRental, type OutcomeKey } from './example-rental'
import { useExampleMoney } from './use-example-money'

function LegendItem({ marker, title, note }: { marker: ReactNode; title: string; note: string }) {
  return (
    <div className="flex items-start gap-3 border-t border-border/70 px-4 py-4 first:border-t-0 sm:border-t-0 sm:border-l sm:first:border-l-0 md:px-6 md:py-5 lg:px-7">
      {marker}
      <p className="min-w-0 font-medium">
        {title}
        <span className="block text-sm font-normal text-muted-foreground">{note}</span>
      </p>
    </div>
  )
}

export function EvidenceLegend({ outcome }: { outcome: OutcomeKey }) {
  const t = useTranslations('evidence')
  const money = useExampleMoney()
  const { takenCents, releasedCents } = exampleRental.outcomes[outcome]

  return (
    <div aria-live="polite" className="grid text-[0.9375rem] sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
      {outcome === 'damage' ? (
        <LegendItem
          marker={<span aria-hidden="true" className="mt-1 size-3.5 shrink-0 animate-pop rounded-xs border-[2.5px] border-primary" />}
          title={t('findings.new.title', { amount: money(takenCents) })}
          note={t('findings.new.note')}
        />
      ) : (
        <LegendItem
          marker={<CircleCheck aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 animate-pop text-success" />}
          title={t('findings.none.title')}
          note={t('findings.none.note')}
        />
      )}
      <LegendItem
        marker={<span aria-hidden="true" className="mt-1 size-3.5 shrink-0 rounded-xs border-[1.5px] border-dashed border-muted-foreground" />}
        title={t('findings.old.title')}
        note={t('findings.old.note')}
      />
      <div className="flex flex-col justify-center border-t border-border/70 bg-muted/50 px-4 py-4 sm:col-span-2 md:px-6 md:py-5 lg:col-span-1 lg:border-t-0 lg:border-l lg:px-7">
        <p className="figures text-sm font-medium">
          {t('summary', {
            reserved: money(exampleRental.reservedCents),
            taken: money(takenCents),
            released: money(releasedCents),
          })}
        </p>
        <p className="text-sm text-muted-foreground">{t('example')}</p>
      </div>
    </div>
  )
}
