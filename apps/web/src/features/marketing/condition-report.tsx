import { CircleCheck } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { exampleRental } from './example-rental'
import { photoPlanKeys } from './photo-plan'

// What the handover leaves behind: every view taken, the marks already on the item, and the renter's confirmation.
export function ConditionReport() {
  const t = useTranslations('pages.howItWorks.report')
  const views = useTranslations('pages.howItWorks.captureScreen.views')
  const shop = useTranslations('bothSides.shop')
  const format = useFormatter()
  const time = format.dateTime(exampleRental.handoverAt, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

  return (
    <div role="group" aria-label={t('title')} className="w-full border border-foreground bg-card p-4">
      <p className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-bold">{t('title')}</span>
        <span className="label text-xs text-muted-foreground">{shop('item')}</span>
      </p>
      <ul className="mt-3 text-[0.9375rem]">
        {photoPlanKeys.map((key) => (
          <li key={key} className="flex items-center gap-2 border-t py-1.5">
            <CircleCheck aria-hidden="true" className="size-4 shrink-0 text-success" />
            {views(key)}
          </li>
        ))}
      </ul>
      <p className="border-t pt-2 text-[0.9375rem]">{t('noted', { count: exampleRental.marksAtHandover })}</p>
      <p className="figures mt-1 text-[0.8125rem] text-muted-foreground">{t('confirmed', { time })}</p>
    </div>
  )
}
