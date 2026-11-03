import type { QueueEntry } from '@hold/db'
import { DETECTOR_KINDS, money } from '@hold/domain'
import type { DetectorKind } from '@hold/domain'
import { ArrowRight, Clock } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import type { ShopClock } from '@/hooks/use-shop-format'
import { detailLinkClass } from '@/components/detail-parts'
import { SampleTag } from '@/components/ui/sample-tag'
import { useShopFormat } from '@/hooks/use-shop-format'
import { Link } from '@/i18n/navigation'
import { rentalRoutes } from '@/lib/routes'
import { formatMoney } from '@/lib/money'
import { EntryActions } from './entry-actions'
import { EntryMarkList } from './entry-mark-list'
import { entryMarks } from './entry-marks'

const isDetector = (kind: string | undefined): kind is DetectorKind => DETECTOR_KINDS.some((each) => each === kind)

type QueueEntryCardProps = { entry: QueueEntry; clock: ShopClock; canDecide: boolean; passkeyNeeded: boolean; together: string | undefined }

// One entry as the owner reads it over coffee: what will happen, why, the amount from the records, the PayPal
// references, any draft, and how it was written (entry-marks.ts). The reason the agent wrote is shown as text, never markup.
export function QueueEntryCard({ entry, clock, canDecide, passkeyNeeded, together }: QueueEntryCardProps) {
  const t = useTranslations('operations')
  const locale = useLocale()
  const format = useShopFormat(clock)
  const fixed = entry.payload['fixedReason']
  const titleId = `entry-${entry.id}`
  return (
    <article aria-labelledby={titleId} className="surface grid h-full min-w-0 content-start gap-4 p-4 md:p-5">
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 id={titleId} className="text-[1.0625rem] leading-snug font-bold text-pretty wrap-long-words">{t(`kinds.${entry.kind}.action`)}</h3>
          {entry.payload['simulated'] === 'yes' ? <SampleTag /> : null}
        </div>
        {entry.deadline === null ? null : (
          <p className="inline-flex w-fit max-w-full items-center gap-1.5 rounded-full bg-warning/12 px-2.5 py-1 text-sm font-semibold text-warning">
            <Clock aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="min-w-0 wrap-long-words">{t('deadline', { when: `${format.day(entry.deadline)} ${format.time(entry.deadline)}` })}</span>
          </p>
        )}
      </div>
      {entry.amountCents === null || entry.currency === null ? null : (
        <p className="grid gap-0.5">
          <span className="label text-xs text-muted-foreground">{t('amount')}</span>
          <span className="text-figure tabular-nums" data-testid="entry-amount">{formatMoney(money(entry.amountCents, entry.currency), locale)}</span>
        </p>
      )}
      <div className="grid gap-1.5">
        <p className="label text-xs text-muted-foreground">{t('why')}</p>
        <p className="whitespace-pre-wrap text-pretty wrap-long-words">{isDetector(fixed) ? t(`fixedReasons.${fixed}`) : entry.reason}</p>
      </div>
      <div className="grid gap-1.5">
        <p className="label text-xs text-muted-foreground">{t('references')}</p>
        {entry.references.length === 0 ? <p className="text-sm text-muted-foreground">{t('noReferences')}</p> : (
          <ul className="flex flex-wrap gap-2">
            {entry.references.map((reference) => <li key={reference} className="min-w-0 rounded-lg border border-border/70 bg-muted/40 px-2.5 py-1 font-mono text-sm wrap-long-words">{reference}</li>)}
          </ul>
        )}
      </div>
      {entry.draft === null ? null : (
        <div className="grid gap-1.5">
          <p className="label text-xs text-muted-foreground">{t('draft')}</p>
          <blockquote className="min-w-0 rounded-xl border border-border/70 bg-muted/40 px-4 py-3 whitespace-pre-wrap wrap-long-words">{entry.draft}</blockquote>
        </div>
      )}
      <EntryMarkList marks={entryMarks(entry)} model={entry.model} />
      {entry.rentalId === null ? null : (
        <Link href={rentalRoutes.rental(entry.rentalId)} className={detailLinkClass}>
          {t('openRental')}
          <ArrowRight aria-hidden="true" />
        </Link>
      )}
      {canDecide ? <EntryActions proposalId={entry.id} kind={entry.kind} passkeyNeeded={passkeyNeeded} together={together} /> : null}
    </article>
  )
}
