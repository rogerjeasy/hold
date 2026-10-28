import { CONFIDENCE_LEVELS, measureEvaluation } from '@hold/domain'
import type { EvaluatedCase } from '@hold/domain'
import { useTranslations } from 'next-intl'
import { ShareFigure } from '@/features/scorecard/scorecard-figures'

// Level by level, how often a change the comparison claimed was right, counted here from the pairs themselves with
// the measure the published figures use. A finding on a return in a shop shows this same count for its level.
export function CalibrationTable({ cases }: { cases: readonly EvaluatedCase[] }) {
  const t = useTranslations('openScorecard.calibration')
  const levels = useTranslations('scorecard.levels')
  const { confidence } = measureEvaluation(cases)
  return (
    <div className="grid gap-3">
      <p className="max-w-prose text-muted-foreground">{t('lead')}</p>
      <div className="min-w-0 overflow-x-auto border bg-card">
        <table className="w-full text-left">
          <caption className="sr-only">{t('title')}</caption>
          <thead className="label text-xs text-muted-foreground">
            <tr className="border-b">
              <th scope="col" className="px-4 py-3 font-medium">{t('level')}</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">{t('right')}</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">{t('wrong')}</th>
              <th scope="col" className="px-4 py-3 font-medium">{t('record')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {CONFIDENCE_LEVELS.map((level) => {
              const share = confidence[level]
              return (
                <tr key={level}>
                  <th scope="row" className="px-4 py-3 font-semibold">{levels(level)}</th>
                  <td className="figures px-4 py-3 text-right">{share.count}</td>
                  <td className="figures px-4 py-3 text-right">{share.total - share.count}</td>
                  <td className="figures px-4 py-3 wrap-long-words"><ShareFigure share={share} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
