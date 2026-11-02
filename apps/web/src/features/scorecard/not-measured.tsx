import type { withdrawnEvalRun } from '@hold/db'
import { useFormatter, useTranslations } from 'next-intl'
import { Notice } from '@/components/ui/notice'

export type WithdrawnRun = NonNullable<Awaited<ReturnType<typeof withdrawnEvalRun>>>

// What a scorecard with no run to show says: that it claims no accuracy, and, when an accepted run was withdrawn,
// which one, why, and that the pairs it is measured on were rebuilt (extensions.md section 5.9).
export function NotMeasured({ withdrawn }: { withdrawn?: WithdrawnRun | undefined }) {
  const t = useTranslations('scorecard.empty')
  const format = useFormatter()
  const day = (date: Date) => format.dateTime(date, { dateStyle: 'medium' })
  return (
    <Notice title={t('title')} body={t('body')}>
      {withdrawn === undefined ? null : (
        <div className="mt-3 grid gap-2">
          <p className="wrap-long-words">{t('withdrawn', { accepted: day(withdrawn.completedAt), withdrawn: day(withdrawn.withdrawnAt) })} {t(`reasons.${withdrawn.reason}`)}</p>
          <p className="wrap-long-words">{t('refreshed')}</p>
        </div>
      )}
    </Notice>
  )
}
