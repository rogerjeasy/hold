import { fieldRecordAlarm } from '@hold/domain'
import type { FieldRecordMonthCounts } from '@hold/domain'
import { useTranslations } from 'next-intl'
import { Notice } from '@/components/ui/notice'
import { Panel } from '@/components/ui/panel'

// What people in this shop did with the comparison's findings, by month, and the alarm when that changes sharply.
export function FieldRecord({ months }: { months: readonly FieldRecordMonthCounts[] }) {
  const t = useTranslations('scorecard.field')
  return (
    <section className="grid gap-4">
      <h2 className="text-title">{t('title')}</h2>
      <p className="max-w-prose text-muted-foreground">{t('lead')}</p>
      {fieldRecordAlarm(months) ? <Notice title={t('alarmTitle')} body={t('alarmBody')} /> : null}
      <Panel title={t('title')}>
        {months.length === 0 ? <p className="px-4 py-4 md:px-5">{t('empty')}</p> : (
          <ul className="divide-y">
            {months.map((month) => (
              <li key={month.month} className="flex min-w-0 flex-wrap justify-between gap-2 px-4 py-3 md:px-5">
                <span className="figures">{t('month', { month: month.month })}</span>
                <span className="wrap-long-words">{t('removed', month)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </section>
  )
}
