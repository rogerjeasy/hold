'use client'
import { CircleCheck } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { PhotoWithMarks } from '@/components/photo-with-marks'

// Under a claim line the renter paid: the shop repaired it, when, and the photograph of the repaired view
// (architecture.md section 9.6). The cost is the shop's own and is not shown.
export function LineRepaired({ description, repairedAt, url, timeZone }: { description: string; repairedAt: Date; url: string | null; timeZone: string }) {
  const t = useTranslations('claim')
  const format = useFormatter()
  return (
    <div className="grid gap-2 rounded-xl bg-success/6 p-3.5">
      <p className="flex items-center gap-2 font-semibold text-success"><CircleCheck aria-hidden="true" className="size-5 shrink-0" />{t('repairedOn', { date: format.dateTime(repairedAt, { month: 'short', day: 'numeric', timeZone }) })}</p>
      <p className="text-sm text-muted-foreground text-pretty">{t('repairedBody')}</p>
      {url === null ? null : <div className="sm:max-w-sm"><PhotoWithMarks src={url} alt={t('repairedAlt', { line: description })} marks={[]} /></div>}
    </div>
  )
}
