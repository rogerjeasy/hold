import type { PublishedTrustLadder } from '@hold/db'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { formatMoney } from '@/lib/money'

// The ladder renters are held under now: its version, what counts, and each rung in plain words.
export function CurrentLadder({ current }: { current: PublishedTrustLadder | undefined }) {
  const t = useTranslations('trust.ladder')
  const format = useFormatter()
  const locale = useLocale()
  if (current === undefined) return <p className="max-w-prose text-lead text-muted-foreground">{t('none')}</p>
  const { ladder } = current
  return (
    <div className="grid gap-4">
      <p className="max-w-prose text-lead text-muted-foreground">{t('current', { version: current.version, date: format.dateTime(current.publishedAt, { dateStyle: 'medium' }) })}</p>
      <p className="max-w-prose text-pretty">
        {t('historyLine', { history: t(`historyNames.${ladder.history}`), months: ladder.windowMonths, fee: formatMoney(ladder.minimumFee, locale), hours: ladder.minimumHours })}
      </p>
      <ol className="grid gap-2 border-l-2 border-border-strong pl-4">
        <li>{t('rungZero')}</li>
        {ladder.rungs.map((rung) => (
          <li key={rung.cleanReturns} className="grid gap-0.5">
            <span>
              {t('rungLine', { count: rung.cleanReturns, share: rung.sharePercent, cover: rung.largestValue === undefined ? t('anyValue') : t('upTo', { amount: formatMoney(rung.largestValue, locale) }) })}
            </span>
            {rung.needsSavedMethod ? <span className="text-sm text-muted-foreground">{t('neverReached')}</span> : null}
          </li>
        ))}
      </ol>
    </div>
  )
}
