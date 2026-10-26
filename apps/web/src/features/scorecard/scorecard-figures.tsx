import { CONFIDENCE_LEVELS, sharePercent, zeroUpperBound } from '@hold/domain'
import type { Measures, Share, Spread } from '@hold/domain'
import { useFormatter, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { Panel } from '@/components/ui/panel'

export type ScorecardRun = {
  readonly completedAt: Date
  readonly caseCount: number
  readonly syntheticCount: number
  readonly pipelineVersion: string
  readonly model: string
  readonly measures: Measures
  readonly realMeasures: Measures
}

// One share, always with its count. Where none is the good outcome, it says how far "none" can be trusted.
export function ShareFigure({ share, zeroIsGood = false }: { share: Share; zeroIsGood?: boolean }) {
  const t = useTranslations('scorecard')
  if (share.total === 0) return <>{t('notMeasured', share)}</>
  if (share.count === 0 && zeroIsGood) return <>{t('zeroBound', { ...share, bound: Math.round(zeroUpperBound(share.total) * 100) })}</>
  return <>{t('share', { ...share, percent: sharePercent(share) })}</>
}

const seconds = (milliseconds: number) => (milliseconds / 1000).toFixed(1)

type Row = { readonly key: string; readonly name: string; readonly help: string; readonly figure: (measures: Measures) => ReactNode }

// The scorecard's measures (extensions.md section 5.4) for all pairs and for the photographs taken as they are.
// The owner's page and the public page show the same component, so they always show the same figures.
export function ScorecardFigures({ run }: { run: ScorecardRun }) {
  const t = useTranslations('scorecard')
  const format = useFormatter()
  const spread = (value: Spread, kind: 'spread' | 'tokens') => t(kind, kind === 'spread' ? { median: seconds(value.median), slowest: seconds(value.slowestTenth) } : { median: value.median, slowest: value.slowestTenth })
  const rows: readonly Row[] = [
    ...(['damageFound', 'cleanWronglyFlagged', 'sentToPerson', 'knownMarksRespected', 'looksAgree', 'identityCaught'] as const).map((key) => ({
      key, name: t(`measures.${key}.name`), help: t(`measures.${key}.help`), figure: (measures: Measures) => <ShareFigure share={measures[key]} zeroIsGood={key === 'cleanWronglyFlagged'} />,
    })),
    ...CONFIDENCE_LEVELS.map((level) => ({ key: `confidence-${level}`, name: t('measures.confidence.name', { level: t(`levels.${level}`) }), help: t('measures.confidence.help'), figure: (measures: Measures) => <ShareFigure share={measures.confidence[level]} /> })),
    { key: 'time', name: t('measures.time.name'), help: t('measures.time.help'), figure: (measures: Measures) => spread(measures.milliseconds, 'spread') },
    { key: 'tokens', name: t('measures.tokens.name'), help: t('measures.tokens.help'), figure: (measures: Measures) => spread(measures.tokens, 'tokens') },
  ]
  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground wrap-long-words">{t('measuredOn', { date: format.dateTime(run.completedAt, { dateStyle: 'medium' }), pairs: run.caseCount, real: run.caseCount - run.syntheticCount, synthetic: run.syntheticCount, pipeline: run.pipelineVersion, model: run.model })}</p>
      <Panel title={t('title')}>
        <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 border-b px-4 py-2 text-sm text-muted-foreground md:grid md:px-5">
          <span>{t('columns.measure')}</span><span>{t('columns.all')}</span><span>{t('columns.real')}</span>
        </div>
        <dl className="divide-y">
          {rows.map((row) => (
            <div key={row.key} className="grid min-w-0 gap-2 px-4 py-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] md:gap-4 md:px-5">
              <dt className="min-w-0"><span className="font-semibold wrap-long-words">{row.name}</span><span className="mt-1 block text-sm text-muted-foreground wrap-long-words">{row.help}</span></dt>
              <dd className="figures min-w-0 wrap-long-words"><span className="label text-xs text-muted-foreground md:hidden">{t('columns.all')} · </span>{row.figure(run.measures)}</dd>
              <dd className="figures min-w-0 wrap-long-words"><span className="label text-xs text-muted-foreground md:hidden">{t('columns.real')} · </span>{row.figure(run.realMeasures)}</dd>
            </div>
          ))}
        </dl>
      </Panel>
      <p className="text-sm text-muted-foreground wrap-long-words">{t('synthetic')}</p>
    </div>
  )
}
