'use client'

import type { ContestLine } from '@hold/db'
import type { ContestSummaryVersion, Region } from '@hold/domain'
import { useTranslations } from 'next-intl'
import { useId } from 'react'
import { PhotoWithMarks } from '@/components/photo-with-marks'
import { useShopFormat } from '@/hooks/use-shop-format'
import { RewriteSummaryForm } from './rewrite-summary-form'

export type ContestView = {
  // pending: the renter contested and no summary has been tried yet.
  readonly outcome: 'answered' | 'refused' | 'unavailable' | 'invalid' | 'dropped' | 'pending'
  readonly simulated: boolean
  readonly version: ContestSummaryVersion | null
  readonly comment: string
  readonly lines: readonly ContestLine[]
  readonly rental: { readonly conditionReply: 'confirmed' | 'added' | null; readonly conditionRepliedAt: Date | null; readonly renterPhotos: number; readonly incidentsReported: number }
}

export type LinePhotos = Readonly<Record<string, { readonly before: string | null; readonly after: string | null; readonly region: Region | null }>>

// What the records show about a disputed line, found by code and worded by templates: never the model's words.
function useFacts(view: ContestView, timeZone: string) {
  const t = useTranslations('contest.facts')
  const format = useShopFormat({ timeZone, currency: null })
  return (line: ContestLine) => {
    const own = line.source === 'finding'
      ? [line.bothLooksConfirmed ? t('confirmedTwice') : t('foundOnce'), line.knownMarkNearby ? t('markNearby') : t('noMarkNearby')]
      : line.source === 'agreed_in_rental' ? [t('agreedDuringRental')] : [t('addedBy', { name: line.addedBy ?? t('someone') })]
    const { rental } = view
    const condition = rental.conditionReply === 'confirmed' && rental.conditionRepliedAt !== null ? t('conditionConfirmed', { when: format.when(rental.conditionRepliedAt) })
      : rental.conditionReply === 'added' ? t('conditionAdded') : t('conditionNotAnswered')
    return [...own, condition, rental.incidentsReported > 0 ? t('incidentReported') : t('noIncident'), ...(rental.renterPhotos > 0 ? [t('renterPhotos', { count: rental.renterPhotos })] : [])]
  }
}

// The neutral summary of a contest, above the decision (architecture.md section 6.15). The layout and every fact are
// plain code; only the sentences are the model's, labelled as such. With no summary, the renter's words and the facts
// still show. The renter reads the same content, in their language.
export function ContestSummaryPanel({ view, audience, timeZone, photos = {}, rentalId, canRewrite = false }: { view: ContestView; audience: 'shop' | 'renter'; timeZone: string; photos?: LinePhotos; rentalId?: string; canRewrite?: boolean }) {
  const t = useTranslations('contest')
  const factsOf = useFacts(view, timeZone)
  const summary = view.version
  const said = (lineId: string) => summary?.lines.find((line) => line.lineId === lineId)
  const disputed = summary === null ? null : summary.lines.filter((line) => line.disputed).length
  const titleId = useId()
  // Sized by its own width, not the window's: it sits across a claim page and beside the decision board's grid alike.
  return (
    <section aria-labelledby={titleId} className="@container min-w-0 border border-t-4 border-t-foreground bg-card">
      <div className="grid gap-2.5 border-b px-4 py-4 @lg:px-5">
        <h2 id={titleId} className="text-[1.1875rem] leading-tight font-extrabold tracking-tight">{t('title')}</h2>
        {summary === null ? (
          <>
            <p className="text-pretty">{t(`missing.${view.outcome === 'answered' ? 'pending' : view.outcome}`)}</p>
            <figure className="grid gap-1">
              <figcaption className="text-sm text-muted-foreground">{t(audience === 'shop' ? 'renterWrote' : 'youWrote')}</figcaption>
              <blockquote className="min-w-0 border-l-2 border-border-strong pl-3 whitespace-pre-wrap italic wrap-long-words">{view.comment === '' ? t('noWords') : view.comment}</blockquote>
            </figure>
            {canRewrite && rentalId !== undefined ? <RewriteSummaryForm rentalId={rentalId} first={view.outcome === 'pending'} /> : null}
          </>
        ) : (
          <>
            <p className="text-lg leading-snug text-pretty">{summary.overview}</p>
            <p className="text-sm font-semibold">{t('count', { disputed: disputed ?? 0, total: summary.lines.length })}</p>
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="label bg-muted px-1.5 py-0.5 text-[0.6875rem] text-foreground">{view.simulated ? t('bySimulated') : t('byClaude')}</span>
              {t('neutral')}
            </p>
          </>
        )}
      </div>
      <ol>
        {view.lines.map((line) => {
          const words = said(line.id)
          const isDisputed = words?.disputed ?? true
          const photo = photos[line.id]
          const pictured = photo !== undefined && (photo.before !== null || photo.after !== null)
          return (
            <li key={line.id} className="grid min-w-0 gap-3 border-b px-4 py-4 last:border-b-0 @lg:px-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="min-w-0 font-extrabold tracking-tight wrap-long-words">{line.description}</h3>
                {words === undefined ? null : <span className={isDisputed ? 'label bg-primary/10 px-1.5 py-0.5 text-[0.6875rem] text-primary' : 'label bg-success/10 px-1.5 py-0.5 text-[0.6875rem] text-success'}>{isDisputed ? t('disputed') : t('notDisputed')}</span>}
              </div>
              {words !== undefined && !isDisputed ? <p className="text-[0.9375rem] text-muted-foreground">{words.shopSays}</p> : (
                <>
                  {words === undefined ? null : (
                    <div className="grid gap-2.5 @xl:grid-cols-2">
                      <div className="grid content-start gap-1 border px-3 py-2.5">
                        <p className="label text-[0.6875rem] text-muted-foreground">{t('shopSays')}</p>
                        <p className="text-pretty">{words.shopSays}</p>
                      </div>
                      <div className="grid content-start gap-1 border px-3 py-2.5">
                        <p className="label text-[0.6875rem] text-muted-foreground">{t(audience === 'shop' ? 'renterSays' : 'youSaid')}</p>
                        {words.renterQuote === null ? null : <blockquote className="border-l-2 border-border-strong pl-2.5 italic wrap-long-words">“{words.renterQuote}”</blockquote>}
                        {words.renterSays === null ? null : <p className="text-sm text-pretty text-muted-foreground">{words.renterSays}</p>}
                      </div>
                    </div>
                  )}
                  <div className={pictured ? 'grid gap-3 border bg-background px-3 py-3 @2xl:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]' : 'grid gap-3 border bg-background px-3 py-3'}>
                    {!pictured ? null : (
                      <div className="grid grid-cols-2 gap-2">
                        {photo.before === null ? null : <figure className="min-w-0"><PhotoWithMarks src={photo.before} alt={t('before', { line: line.description })} marks={[]} /><figcaption className="label mt-1 text-[0.625rem] text-muted-foreground">{t('beforeShort')}</figcaption></figure>}
                        {photo.after === null ? null : <figure className="min-w-0"><PhotoWithMarks src={photo.after} alt={t('after', { line: line.description })} marks={photo.region === null ? [] : [{ id: line.id, region: photo.region }]} /><figcaption className="label mt-1 text-[0.625rem] text-muted-foreground">{t('afterShort')}</figcaption></figure>}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="mb-1.5 text-sm font-bold">{t('records')}</p>
                      <ul className="grid gap-1.5 text-[0.9375rem]">
                        {factsOf(line).map((fact) => <li key={fact} className="grid grid-cols-[0.5rem_minmax(0,1fr)] gap-2"><span aria-hidden="true" className="mt-2 size-1.5 rounded-full bg-foreground" />{fact}</li>)}
                        {line.source === 'person' && line.reason !== '' ? <li className="grid grid-cols-[0.5rem_minmax(0,1fr)] gap-2"><span aria-hidden="true" className="mt-2 size-1.5 rounded-full bg-foreground" /><span className="wrap-long-words">{t('staffReason')} <q className="italic">{line.reason}</q></span></li> : null}
                      </ul>
                    </div>
                  </div>
                </>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
