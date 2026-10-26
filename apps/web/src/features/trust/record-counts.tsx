import type { CleanRecord } from '@hold/domain'
import { useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'

const COUNTS = ['clean', 'settled', 'unpaid', 'open', 'shops'] as const

// The counts behind a Clean Record, and only those: the renter's own page and the page that checks a credential both
// show them, and neither names a shop or an amount.
export function RecordCounts({ record }: { record: CleanRecord }) {
  const t = useTranslations('trust.record')
  return (
    <Panel title={t('counts', { months: record.windowMonths })}>
      <dl className="grid grid-cols-2 gap-px sm:grid-cols-3 lg:grid-cols-5">
        {COUNTS.map((count) => (
          <div key={count} className="min-w-0 px-4 py-4 md:px-5">
            <dt className="text-sm text-muted-foreground">{t(count)}</dt>
            <dd className="mt-1 text-figure">{record[count]}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  )
}
