import type { EvaluatedCase, TrendRun } from '@hold/domain'
import { useTranslations } from 'next-intl'
import { useId } from 'react'
import type { ReactNode } from 'react'
import { CalibrationTable } from './calibration-table'
import { CaseExplorer } from './case-explorer'
import { caseRows } from './case-rows'
import { EVAL_PHOTO_CREDITS } from './eval-photos'
import { OutcomeMatrix } from './outcome-matrix'
import { RunTrend } from './run-trend'

// Inline in a sentence: the padding gives a 44-pixel touch target without spacing the lines apart.
function CreditLink({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} className="py-4 font-semibold underline underline-offset-4" rel="noreferrer" target="_blank">{children}</a>
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="grid min-w-0 gap-4">
      <h2 id={id} className="text-title text-balance">{title}</h2>
      {children}
    </section>
  )
}

// The open scorecard (extensions.md section 5.5): the accepted run read case by case, then how confidence held up,
// what each pair should have ended in against what it did, and every run against the lines its gate drew.
export function OpenScorecard({ cases, history }: { cases: readonly EvaluatedCase[]; history: readonly TrendRun[] }) {
  const t = useTranslations('openScorecard')
  return (
    <div className="grid min-w-0 gap-14">
      <Part title={t('title')}>
        <p className="max-w-prose text-muted-foreground">{t('lead')}</p>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground wrap-long-words">
          {t.rich('credit', {
            urwahn: (chunks) => <CreditLink href={EVAL_PHOTO_CREDITS.urwahn}>{chunks}</CreditLink>,
            rm: (chunks) => <CreditLink href={EVAL_PHOTO_CREDITS.rm}>{chunks}</CreditLink>,
            licence: (chunks) => <CreditLink href={EVAL_PHOTO_CREDITS.licence}>{chunks}</CreditLink>,
            scratches: (chunks) => <CreditLink href={EVAL_PHOTO_CREDITS.scratches}>{chunks}</CreditLink>,
            gouge: (chunks) => <CreditLink href={EVAL_PHOTO_CREDITS.gouge}>{chunks}</CreditLink>,
            rust: (chunks) => <CreditLink href={EVAL_PHOTO_CREDITS.rust}>{chunks}</CreditLink>,
            chip: (chunks) => <CreditLink href={EVAL_PHOTO_CREDITS.chip}>{chunks}</CreditLink>,
            by20: (chunks) => <CreditLink href={EVAL_PHOTO_CREDITS.by20}>{chunks}</CreditLink>,
            bysa30: (chunks) => <CreditLink href={EVAL_PHOTO_CREDITS.bysa30}>{chunks}</CreditLink>,
          })}
        </p>
        <CaseExplorer rows={caseRows(cases)} />
      </Part>
      <Part title={t('calibration.title')}><CalibrationTable cases={cases} /></Part>
      <Part title={t('matrix.title')}><OutcomeMatrix cases={cases} /></Part>
      {history.length === 0 ? null : <Part title={t('trend.title')}><RunTrend history={history} /></Part>}
    </div>
  )
}
