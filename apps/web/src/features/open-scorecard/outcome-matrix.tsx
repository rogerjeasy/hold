import { outcomeMatrix } from '@hold/domain'
import type { EvaluatedCase, PairOutcome } from '@hold/domain'
import { useTranslations } from 'next-intl'

const OUTCOMES: readonly PairOutcome[] = ['clean', 'findings', 'deferred']

// The tint of a cell grows with its share of the busiest cell: right in the success colour, sent to a person in the
// muted one, and a mistake in the warning colour. Every cell also says its count and, on the diagonal, that it was right.
function tint(count: number, most: number, kind: 'right' | 'person' | 'wrong'): string | undefined {
  if (count === 0 || most === 0) return undefined
  const token = kind === 'right' ? 'var(--success)' : kind === 'person' ? 'var(--muted-foreground)' : 'var(--destructive)'
  return `color-mix(in oklab, ${token} ${String(Math.round(8 + (count / most) * 32))}%, var(--card))`
}

// What each pair should have ended in, against what it did: the confusion table, shaded.
export function OutcomeMatrix({ cases }: { cases: readonly EvaluatedCase[] }) {
  const t = useTranslations('openScorecard')
  const matrix = outcomeMatrix(cases)
  const most = Math.max(...OUTCOMES.flatMap((expected) => OUTCOMES.map((actual) => matrix[expected][actual])))
  return (
    <div className="grid gap-3">
      <p className="max-w-prose text-muted-foreground">{t('matrix.lead')}</p>
      <div className="min-w-0 overflow-x-auto border bg-card">
        <table className="w-full text-left">
          <caption className="sr-only">{t('matrix.title')}</caption>
          <thead className="label text-xs text-muted-foreground">
            <tr className="border-b">
              <th scope="col" className="px-4 py-3 font-medium">{t('matrix.expected')} / {t('matrix.actual')}</th>
              {OUTCOMES.map((actual) => <th key={actual} scope="col" className="px-4 py-3 font-medium">{t(`outcomes.${actual}`)}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y">
            {OUTCOMES.map((expected) => (
              <tr key={expected}>
                <th scope="row" className="px-4 py-4 font-semibold">{t(`outcomes.${expected}`)}</th>
                {OUTCOMES.map((actual) => {
                  const count = matrix[expected][actual]
                  const right = expected === actual
                  const kind = right ? 'right' : actual === 'deferred' ? 'person' : 'wrong'
                  return (
                    <td key={actual} className="figures px-4 py-4 wrap-long-words" style={{ backgroundColor: tint(count, most, kind) }}>
                      {t('matrix.cell', { count })}{right ? `, ${t('matrix.right')}` : ''}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
