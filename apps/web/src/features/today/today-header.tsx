import type { PartOfDay } from '@hold/domain'
import { useTranslations } from 'next-intl'
import type { ShopClock } from '@/hooks/use-shop-format'
import { LiveClock } from './live-clock'

type TodayHeaderProps = {
  readonly name: string
  readonly part: PartOfDay
  readonly now: Date
  readonly clock: ShopClock
  readonly decisions: number
  readonly dueBack: number
}

// The greeting: the shop's own date and time, kept current, then what the day holds in one sentence.
export function TodayHeader({ name, part, now, clock, decisions, dueBack }: TodayHeaderProps) {
  const t = useTranslations('today')

  return (
    <header className="min-w-0">
      <p className="label flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span aria-hidden="true" className="size-1.5 shrink-0 animate-pulse-ring rounded-full bg-success text-success" />
        <LiveClock now={now} clock={clock} />
      </p>
      <h1 className="mt-3 text-page-title text-balance wrap-long-words">{t(`greeting.${part}`, { name })}</h1>
      <p className="mt-3 max-w-prose text-lead text-muted-foreground">
        <strong className="font-semibold text-foreground">{t('decisionsSummary', { count: decisions })}</strong> {t('returnsSummary', { count: dueBack })}
      </p>
    </header>
  )
}
