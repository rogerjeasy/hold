import type { PartOfDay } from '@hold/domain'
import { useTranslations } from 'next-intl'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'

type TodayHeaderProps = {
  readonly name: string
  readonly part: PartOfDay
  readonly now: Date
  readonly clock: ShopClock
  readonly decisions: number
  readonly dueBack: number
}

export function TodayHeader({ name, part, now, clock, decisions, dueBack }: TodayHeaderProps) {
  const t = useTranslations('today')
  const format = useShopFormat(clock)

  return (
    <header className="min-w-0">
      <p className="label text-xs text-muted-foreground">
        <time dateTime={now.toISOString()}>
          {format.date(now)} · {format.time(now)}
        </time>
      </p>
      <h1 className="mt-2.5 text-page-title text-balance wrap-long-words">{t(`greeting.${part}`, { name })}</h1>
      <p className="mt-3 text-lead text-muted-foreground">
        <strong className="font-semibold text-foreground">{t('decisionsSummary', { count: decisions })}</strong> {t('returnsSummary', { count: dueBack })}
      </p>
    </header>
  )
}
