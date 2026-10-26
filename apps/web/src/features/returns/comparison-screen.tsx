'use client'

import type { ComparisonReport } from '@hold/db'
import { confidenceLevel, formatMoney, money } from '@hold/domain'
import type { ConfidenceLevel, Share } from '@hold/domain'
import { useLocale, useTranslations } from 'next-intl'
import { PhotoWithMarks } from '@/components/photo-with-marks'
import { Notice } from '@/components/ui/notice'
import { Panel } from '@/components/ui/panel'
import { ShopFrame } from '@/features/shop/shop-frame'
import { useLookAgain } from '@/hooks/use-look-again'
import { Link } from '@/i18n/navigation'
import { rentalRoutes } from '@/lib/routes'
import { ReviewForm } from './review-form'

type DisplayPhoto = { readonly view: string; readonly url: string | null }
export type ComparisonView = Omit<ComparisonReport, 'before' | 'after' | 'reviews'> & { readonly before: readonly DisplayPhoto[]; readonly after: readonly DisplayPhoto[]; readonly reviews: readonly { readonly actorName: string | null; readonly outcome: 'clean' | 'findings' | 'deferred'; readonly reason: string }[] }

// How often findings at each confidence level were correct in the accepted evaluation run, when one exists.
export type Calibration = Readonly<Record<ConfidenceLevel, Share>>

export function ComparisonScreen({ shopName, report, canAct, calibration }: { shopName: string; report: ComparisonView; canAct: boolean; calibration?: Calibration | undefined }) {
  const t = useTranslations('shop.comparison')
  const scorecard = useTranslations('scorecard')
  const accuracy = (confidence: number) => {
    const level = confidenceLevel(confidence)
    const measured = calibration?.[level]
    return measured === undefined || measured.total === 0 ? scorecard('findingLevel', { level: scorecard(`levels.${level}`) }) : scorecard('findingAccuracy', { level: scorecard(`levels.${level}`), ...measured })
  }
  const locale = useLocale()
  const pending = report.state === 'pending' || report.state === 'running'
  useLookAgain(pending || [...report.before, ...report.after].some((photo) => photo.url === null), { forMs: 180_000 })
  const outcome = report.state === 'clean' ? 'clean' : report.state === 'findings' ? 'findings' : 'deferred'
  const views = [...new Set([...report.before, ...report.after].map((photo) => photo.view))]
  return <ShopFrame shopName={shopName} title={report.label}><div className="grid gap-6">
    <Link className="inline-flex min-h-11 items-center justify-self-start font-semibold underline underline-offset-4" href={rentalRoutes.rental(report.rentalId)}>{t('back')}</Link>
    {report.simulated ? <Notice title={t('simulated')} body={t('simulatedBody')} /> : null}
    {pending ? <p role="status">{t('pending')}</p> : <Panel title={t(`outcomes.${outcome}`)}><div className="grid gap-3 px-4 py-4 md:px-5"><p>{t(`bodies.${outcome}`)}</p><p className="text-muted-foreground">{t('boundary')}</p>
      {report.deferredReason === 'reused_photo' ? <p>{t('reused')}</p> : null}
      {report.deferredReason === 'processing_failed' ? <p>{t('unavailable')}</p> : null}
    </div></Panel>}
    {views.map((view) => <Panel key={view} title={view}><div className="grid gap-4 px-4 py-4 md:grid-cols-2 md:px-5">{(['before', 'after'] as const).map((side) => {
      const photo = report[side].find((photo) => photo.view === view)
      return <figure key={side} className="min-w-0"><figcaption className="mb-2 font-semibold">{t(side)}</figcaption>{photo?.url == null ? <p>{t('preparing')}</p> : <PhotoWithMarks src={photo.url} alt={t('photo', { side: t(side), view })} marks={side === 'after' ? report.findings.filter((finding) => finding.view === view) : []} />}</figure>
    })}</div></Panel>)}
    {report.findings.length === 0 ? null : <Panel title={t('observations')}><ul className="grid gap-4 px-4 py-4 md:px-5">{report.findings.map((finding) => <li key={finding.id} className="grid min-w-0 gap-1 border-t pt-3 first:border-t-0 first:pt-0">
      <p className="font-semibold">{t(`classes.${finding.class}`)}</p><p className="wrap-long-words">{finding.description}</p>
      {finding.secondLookConfirmed === true ? <p className="text-muted-foreground">{t('secondLook')}</p> : null}
      {finding.class === 'known_mark' || finding.class === 'wear' || finding.class === 'reported' ? null : <p className="text-sm text-muted-foreground wrap-long-words">{accuracy(finding.confidence)}</p>}
      {finding.reported === null ? null : <p>{finding.reported.agreedCents === null ? t('reportedNotAgreed') : t('reportedAgreed', { amount: formatMoney(money(finding.reported.agreedCents, finding.reported.currency), locale) })} <Link className="font-semibold underline underline-offset-4" href={rentalRoutes.claim(report.rentalId)}>{t(finding.reported.agreedCents === null ? 'claimLink' : 'reportedLink')}</Link></p>}
      {finding.amountCents !== null && finding.currency !== null && finding.class !== 'known_mark' && finding.class !== 'wear' && finding.class !== 'reported' ? <p>{t('price', { description: finding.priceDescription ?? '', amount: formatMoney(money(finding.amountCents, finding.currency), locale) })}</p> : null}
    </li>)}</ul></Panel>}
    <p className="text-sm text-muted-foreground wrap-long-words">{t('version', { model: report.model ?? t('notRun'), prompt: report.promptVersion ?? t('notRun') })}</p>
    {report.reviews.length === 0 ? null : <Panel title={t('reviewHistory')}><ul className="grid gap-3 px-4 py-4 md:px-5">{report.reviews.map((review, index) => <li key={index} className="min-w-0"><p className="font-semibold wrap-long-words">{review.actorName ?? t('staff')} · {t(`outcomes.${review.outcome}`)}</p><p className="whitespace-pre-wrap wrap-long-words">{review.reason}</p></li>)}</ul></Panel>}
    {canAct ? <Panel title={t('manual')}><div className="px-4 py-4 md:px-5"><ReviewForm comparisonId={report.id} /></div></Panel> : null}
  </div></ShopFrame>
}
