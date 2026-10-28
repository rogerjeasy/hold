import { runTrend } from '@hold/domain'
import type { TrendPoint, TrendRun } from '@hold/domain'
import { TriangleAlert } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { ShareFigure } from '@/features/scorecard/scorecard-figures'

const percent = (rate: number) => Math.round(rate * 100)

// One measure of one run as a bar, with its gate's line drawn across it where there is one.
function Meter({ label, rate, line, figure, lineText }: { label: string; rate: number; line: number | null; figure: ReactNode; lineText: string | null }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="font-semibold">{label}</span>
        <span className="figures">{figure}{lineText === null ? null : <span className="text-muted-foreground"> · {lineText}</span>}</span>
      </div>
      <div aria-hidden="true" className="relative h-2.5 bg-muted">
        <span className="absolute inset-y-0 left-0 bg-foreground" style={{ width: `${String(percent(rate))}%` }} />
        {line === null ? null : <span className="absolute -inset-y-1 w-0.5 bg-primary" style={{ left: `${String(Math.min(100, Math.max(0, percent(line))))}%` }} />}
      </div>
    </div>
  )
}

function RunItem({ point }: { point: TrendPoint }) {
  const t = useTranslations('openScorecard.trend')
  const format = useFormatter()
  const crossed = !point.withinCleanLimit || !point.aboveDamageFloor
  return (
    <li className="grid gap-3 border bg-card p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="font-semibold wrap-long-words">{t('run', { date: format.dateTime(point.completedAt, { dateStyle: 'medium' }), pipeline: point.pipelineVersion })}</span>
        <span className="flex flex-wrap gap-x-3 text-sm">
          <span>{point.accepted ? t('accepted') : t('notAccepted')}</span>
          {point.gatePassed ? null : <span className="font-semibold">{t('gateStopped')}</span>}
        </span>
      </div>
      <Meter label={t('damage')} rate={point.damageRate} line={point.damageFloor} figure={<ShareFigure share={point.measures.damageFound} />} lineText={point.damageFloor === null ? null : t('floor', { percent: percent(point.damageFloor) })} />
      <Meter label={t('clean')} rate={point.cleanRate} line={point.cleanLimit} figure={<ShareFigure share={point.measures.cleanWronglyFlagged} zeroIsGood />} lineText={point.cleanLimit === null ? null : t('limit', { percent: percent(point.cleanLimit) })} />
      {point.cleanLimit === null && point.damageFloor === null ? <p className="text-sm text-muted-foreground">{t('noLine')}</p> : null}
      {crossed ? (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-destructive">
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
          {t('crossed')}
        </p>
      ) : null}
    </li>
  )
}

// Every run of the gate half, oldest first, against the lines its gate drew: whether the latest version got worse.
export function RunTrend({ history }: { history: readonly TrendRun[] }) {
  const t = useTranslations('openScorecard.trend')
  return (
    <div className="grid gap-3">
      <p className="max-w-prose text-muted-foreground">{t('lead')}</p>
      <ol className="grid gap-3">
        {runTrend(history).map((point) => <RunItem key={point.id} point={point} />)}
      </ol>
    </div>
  )
}

