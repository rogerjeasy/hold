import { useTranslations } from 'next-intl'
import type { Ref } from 'react'
import { PhotoWithMarks } from '@/components/photo-with-marks'
import { SampleTag } from '@/components/ui/sample-tag'
import type { CaseRow } from './case-rows'
import { Verdict } from './case-cells'
import { evalPhotoUrl } from './eval-photos'

// One pair, whole: the handover photograph with any mark already known, the return photograph with where the damage
// truly is and what the comparison found, what it should have ended in and did, and what each look said.
export function CaseDetail({ row, headingRef }: { row: CaseRow; headingRef: Ref<HTMLHeadingElement> }) {
  const t = useTranslations('openScorecard')
  const detail = useTranslations('openScorecard.detail')
  const outcome = (value: CaseRow['actual']) => t(`outcomes.${value}`)
  const known = row.knownMarks.map((region, index) => ({ id: `known-${String(index)}`, region }))
  const truth = row.labels.map((label, index) => ({ id: `label-${String(index)}`, region: label.region, tone: 'truth' as const }))
  const found = row.findings.map((finding, index) => ({ id: `finding-${String(index)}`, region: finding.region, confirmed: finding.secondLookConfirmed !== false }))
  return (
    <div className="grid min-w-0 gap-5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <h2 ref={headingRef} tabIndex={-1} className="font-mono text-[1.1875rem] font-bold tracking-tight wrap-long-words focus:outline-none">{detail('heading', { id: row.id })}</h2>
        {row.origin === 'synthetic' ? <SampleTag label={t('synthetic')} /> : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-sm text-muted-foreground">{t(`groups.${row.group}`)}</span>
        <Verdict verdict={row.verdict} />
      </div>
      <p>{detail('outcome', { expected: outcome(row.expected), actual: outcome(row.actual) })}</p>
      <div className="grid gap-3 @md:grid-cols-2">
        <figure className="grid content-start gap-1.5">
          <figcaption className="text-sm text-muted-foreground">{detail('handover')}</figcaption>
          <PhotoWithMarks src={evalPhotoUrl(row.before)} alt={detail('altHandover', { id: row.id })} marks={known} />
        </figure>
        <figure className="grid content-start gap-1.5">
          <figcaption className="text-sm text-muted-foreground">{detail('return')}</figcaption>
          <PhotoWithMarks src={evalPhotoUrl(row.after)} alt={detail('altReturn', { id: row.id })} marks={[...truth, ...found]} />
        </figure>
      </div>
      <p className="text-sm text-muted-foreground">{detail('legend')}</p>
      <p className="text-sm">{detail('labels', { count: row.labels.length })}</p>
      <div className="grid gap-1.5">
        <h3 className="label text-xs text-muted-foreground">{detail('findings')}</h3>
        {row.findings.length === 0 ? <p className="text-sm">{detail('noFindings')}</p> : (
          <ul className="grid gap-1 text-sm">
            {row.findings.map((finding, index) => (
              <li key={`finding-${String(index)}`}>
                {detail('finding', { class: t(`classes.${finding.class}`), confidence: Math.round(finding.confidence * 100) })}
                {finding.secondLookConfirmed === null ? null : <span className="text-muted-foreground"> · {detail('secondLook', { answer: t(`secondLook.${finding.secondLookConfirmed ? 'confirmed' : 'not_confirmed'}`) })}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="grid gap-1 text-sm text-muted-foreground">
        <p>{row.alignment === null ? detail('notAligned') : detail('aligned', { percent: Math.round(row.alignment * 100) })}</p>
        <p>{detail('cost', { seconds: (row.milliseconds / 1000).toFixed(1), tokens: row.inputTokens + row.outputTokens })}</p>
      </div>
    </div>
  )
}

