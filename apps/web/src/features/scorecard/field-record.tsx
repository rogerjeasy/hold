import { fieldRecordAlarm } from '@hold/domain'
import type { FieldRecordMonthCounts } from '@hold/domain'
import { ClipboardCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Notice } from '@/components/ui/notice'
import { Panel } from '@/components/ui/panel'

// What people in this shop did with the comparison's findings, by month, and the alarm when that changes sharply.
// Each month's share removed is drawn as a bar beside its count, which says the same in words.
export function FieldRecord({ months }: { months: readonly FieldRecordMonthCounts[] }) {
  const t = useTranslations('scorecard.field')
  return (
    <div className="grid gap-4">
      {fieldRecordAlarm(months) ? <Notice title={t('alarmTitle')} body={t('alarmBody')} /> : null}
      <Panel title={t('title')} icon={ClipboardCheck}>
        <p className="max-w-prose px-4 pt-4 text-[0.9375rem] text-muted-foreground md:px-5">{t('lead')}</p>
        {months.length === 0 ? <p className="px-4 py-4 md:px-5">{t('empty')}</p> : (
          <ul className="grid gap-1 p-2 md:p-3">
            {months.map((month) => (
              <li key={month.month} className="grid min-w-0 gap-2 rounded-xl px-2.5 py-2.5 hover:bg-muted/50 sm:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1.4fr)] sm:items-center sm:gap-4">
                <span className="figures text-sm font-semibold">{t('month', { month: month.month })}</span>
                <span aria-hidden="true" className="relative h-1.5 overflow-hidden rounded-full bg-muted">
                  <span className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${String(month.total === 0 ? 0 : (month.removed / month.total) * 100)}%` }} />
                </span>
                <span className="text-sm wrap-long-words">{t('removed', month)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
