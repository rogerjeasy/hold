'use client'

import type { ComparisonReport } from '@hold/db'
import { comparisonNotice, DROP_POINT_VIEW } from '@hold/domain'
import type { ConfidenceLevel, Share } from '@hold/domain'
import { ChevronDown, CircleCheck, CircleHelp, ClipboardPen, Cpu, History, LoaderCircle, MapPin, Sparkles, TriangleAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { PhotoWithMarks } from '@/components/photo-with-marks'
import { BackLink } from '@/components/ui/back-link'
import { Notice } from '@/components/ui/notice'
import { Panel } from '@/components/ui/panel'
import { StatusPill } from '@/components/ui/status-pill'
import { ShopFrame } from '@/features/shop/shop-frame'
import { useLookAgain } from '@/hooks/use-look-again'
import { rentalRoutes } from '@/lib/routes'
import { ComparisonFindings } from './comparison-findings'
import { ReviewForm } from './review-form'
import type { SampleComparisonAllowance } from './limits'
import { SampleComparisonForm } from './sample-comparison-form'
import { useViewName } from './use-view-name'

// What a comparison records when no model answered it (packages/compare pipeline.ts).
const NO_MODEL = 'not_called'

type DisplayPhoto = { readonly view: string; readonly url: string | null }
export type ComparisonView = Omit<ComparisonReport, 'before' | 'after' | 'reviews'> & { readonly before: readonly DisplayPhoto[]; readonly after: readonly DisplayPhoto[]; readonly reviews: readonly { readonly actorName: string | null; readonly outcome: 'clean' | 'findings' | 'deferred'; readonly reason: string }[] }

// How often findings at each confidence level were correct in the accepted evaluation run, when one exists.
export type Calibration = Readonly<Record<ConfidenceLevel, Share>>

// Each outcome's mark beside its heading; the heading says it in words.
const OUTCOME_MARKS = {
  clean: { icon: CircleCheck, tile: 'bg-success/12 text-success' },
  findings: { icon: TriangleAlert, tile: 'bg-destructive/10 text-destructive' },
  deferred: { icon: CircleHelp, tile: 'bg-warning/14 text-warning' },
} as const

// One view's two photographs side by side, the handover and the return, each whole at its own shape, with what the
// comparison found boxed on the return.
function ViewPair({ view, name, report }: { view: string; name: string; report: ComparisonView }) {
  const t = useTranslations('shop.comparison')
  const found = report.findings.filter((finding) => finding.view === view)
  return (
    <Panel title={name} aside={found.length === 0 ? null : <StatusPill tone="danger">{t('marked', { count: found.length })}</StatusPill>}>
      <div className="grid gap-4 p-3 sm:p-4 md:grid-cols-2 md:p-5">
        {(['before', 'after'] as const).map((side) => {
          const photo = report[side].find((each) => each.view === view)
          return (
            <figure key={side} className="grid min-w-0 content-start gap-2">
              <figcaption className="flex items-center gap-2">
                <span aria-hidden="true" className={side === 'before' ? 'size-2 rounded-full bg-muted-foreground' : 'size-2 rounded-full bg-primary'} />
                <span className="label text-xs text-muted-foreground">{t(side)}</span>
              </figcaption>
              {photo?.url == null ? (
                <div className="grid aspect-thumbnail place-items-center rounded-xl bg-muted px-4 text-center text-sm text-muted-foreground skeleton">{t('preparing')}</div>
              ) : (
                <PhotoWithMarks src={photo.url} alt={t('photo', { side: t(side), view: name })} marks={side === 'after' ? found : []} />
              )}
            </figure>
          )
        })}
      </div>
    </Panel>
  )
}

// sampleAllowance: the real comparisons on samples left today, read by the server while the sample return waits.
// standIn: the app runs on its in-process fakes, where a stand-in answers for Claude, so the sample panel says so.
export function ComparisonScreen({ shopName, report, canAct, calibration, sampleAllowance, standIn = false }: { shopName: string; report: ComparisonView; canAct: boolean; calibration?: Calibration | undefined; sampleAllowance?: SampleComparisonAllowance | undefined; standIn?: boolean }) {
  const t = useTranslations('shop.comparison')
  const notice = comparisonNotice(report)
  // The demo's sample return waits for a person to start its comparison; any other is on its way once sealed.
  const waiting = report.waitsForStart
  const pending = !waiting && (report.state === 'pending' || report.state === 'running')
  const viewName = useViewName(report.viewLabels)
  useLookAgain(pending || [...report.before, ...report.after].some((photo) => photo.url === null), { forMs: 180_000 })
  const outcome = report.state === 'clean' ? 'clean' : report.state === 'findings' ? 'findings' : 'deferred'
  // Where a renter left the item has no handover twin: it is shown on its own and never compared (section 6.13).
  const views = [...new Set([...report.before, ...report.after].map((photo) => photo.view))].filter((view) => view !== DROP_POINT_VIEW)
  const dropPoint = report.after.find((photo) => photo.view === DROP_POINT_VIEW)
  return (
    <ShopFrame shopName={shopName} title={report.label} actions={<BackLink href={rentalRoutes.rental(report.rentalId)}>{t('back')}</BackLink>}>
      <div className="grid gap-6">
        {notice === 'none' || waiting ? null : <Notice title={t(`notices.${notice}.title`)} body={t(`notices.${notice}.body`)} />}
        {waiting ? (
          <Panel title={t(standIn ? 'sample.standIn.title' : 'sample.title')} icon={Sparkles}>
            <div className="grid gap-3 px-4 py-5 md:px-5">
              <p className="max-w-prose text-pretty">{t(standIn ? 'sample.standIn.body' : 'sample.body')}</p>
              <p className="text-sm text-muted-foreground">{t('boundary')}</p>
              {canAct && sampleAllowance !== undefined ? <SampleComparisonForm rentalId={report.rentalId} allowance={sampleAllowance} standIn={standIn} /> : null}
            </div>
          </Panel>
        ) : pending ? (
          <p role="status" className="surface flex items-start gap-3 px-4 py-4 md:px-5">
            <LoaderCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0 animate-spin text-primary" />
            <span className="text-pretty">{t('pending')} {t('updatesItself')}</span>
          </p>
        ) : (
          <OutcomeCard report={report} outcome={outcome} />
        )}
        <div className="stagger grid gap-6">
          {views.map((view) => <ViewPair key={view} view={view} name={viewName(view)} report={report} />)}
        </div>
        {dropPoint === undefined ? null : (
          <Panel title={t('dropPoint')} icon={MapPin}>
            <div className="grid max-w-md gap-2 px-4 py-4 md:px-5">
              {dropPoint.url === null ? <p>{t('preparing')}</p> : <img src={dropPoint.url} alt={t('dropPoint')} className="aspect-thumbnail w-full rounded-xl bg-photo object-cover" />}
              <p className="text-sm text-muted-foreground">{t('dropPointBody')}</p>
            </div>
          </Panel>
        )}
        <ComparisonFindings findings={report.findings} rentalId={report.rentalId} viewName={viewName} calibration={calibration} />
        {report.reviews.length === 0 ? null : (
          <Panel title={t('reviewHistory')} icon={History}>
            <ul className="divide-y divide-border/70">
              {report.reviews.map((review, index) => (
                <li key={index} className="grid min-w-0 gap-1 px-4 py-3.5 md:px-5">
                  <p className="font-semibold wrap-long-words">{review.actorName ?? t('staff')} · {t(`outcomes.${review.outcome}`)}</p>
                  <p className="whitespace-pre-wrap text-pretty wrap-long-words">{review.reason}</p>
                </li>
              ))}
            </ul>
          </Panel>
        )}
        {canAct ? <Panel title={t('manual')} icon={ClipboardPen}><div className="px-4 py-5 md:px-5"><ReviewForm comparisonId={report.id} /></div></Panel> : null}
        {/* Which model and prompt made this result, and what it took: kept with the result, behind a disclosure, so it
            is there for whoever asks and not read as the page's message (audit finding F-L1). */}
        <details className="group min-w-0 rounded-2xl border border-dashed border-border-strong/70 text-sm text-muted-foreground">
          <summary className="flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl px-4 py-2.5 font-medium transition-colors hover:text-foreground md:px-5 [&::-webkit-details-marker]:hidden">
            <Cpu aria-hidden="true" className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">{t('produced')}</span>
            <ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform duration-300 ease-spring group-open:rotate-180" />
          </summary>
          <div className="grid min-w-0 gap-0.5 px-4 pb-3.5 pl-11 md:px-5 md:pl-12">
            <p className="figures text-[0.8125rem] wrap-long-words">{t('version', { model: report.model === null || report.model === NO_MODEL ? t('notRun') : report.model, prompt: report.promptVersion ?? t('notRun') })}</p>
            {report.modelAnswered ? <p>{t('usage', { calls: report.usage.calls, read: report.usage.inputTokens, written: report.usage.outputTokens })}</p> : null}
          </div>
        </details>
      </div>
    </ShopFrame>
  )
}

// The comparison's answer, first: its outcome as the heading with its mark, what it means, and the line that it decides
// nothing about money.
function OutcomeCard({ report, outcome }: { report: ComparisonView; outcome: 'clean' | 'findings' | 'deferred' }) {
  const t = useTranslations('shop.comparison')
  const { icon: Icon, tile } = OUTCOME_MARKS[outcome]
  return (
    <section aria-labelledby="comparison-outcome" className="surface relative isolate grid gap-3 overflow-hidden px-4 py-5 md:px-6 md:py-6">
      <div aria-hidden="true" className="absolute inset-0 -z-10 dot-grid mask-l-from-0% mask-l-to-60% opacity-50" />
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden="true" className={`grid size-11 shrink-0 animate-pop place-items-center rounded-2xl ${tile}`}><Icon className="size-5.5" /></span>
        <h2 id="comparison-outcome" className="text-title wrap-long-words">{t(`outcomes.${outcome}`)}</h2>
      </div>
      <p className="max-w-prose text-lead text-pretty">{report.deferredReason === 'model_unavailable' ? t('modelUnavailable') : t(`bodies.${outcome}`)}</p>
      {report.deferredReason === 'reused_photo' ? <p className="max-w-prose text-pretty">{t('reused')}</p> : null}
      {report.deferredReason === 'processing_failed' ? <p className="max-w-prose text-pretty">{t('unavailable')}</p> : null}
      <p className="text-sm text-muted-foreground">{t('boundary')}</p>
    </section>
  )
}
