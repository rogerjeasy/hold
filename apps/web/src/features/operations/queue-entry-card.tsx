import type { QueueEntry } from '@hold/db'
import { DETECTOR_KINDS, money } from '@hold/domain'
import type { DetectorKind } from '@hold/domain'
import { useLocale, useTranslations } from 'next-intl'
import type { ShopClock } from '@/hooks/use-shop-format'
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
    <article aria-labelledby={titleId} className="grid h-full min-w-0 content-start gap-3 border bg-card p-4 text-card-foreground md:p-5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 id={titleId} className="font-semibold text-pretty wrap-long-words">{t(`kinds.${entry.kind}.action`)}</h3>
        {entry.payload['simulated'] === 'yes' ? <SampleTag /> : null}
      </div>
      {entry.amountCents === null || entry.currency === null ? null : (
        <p className="grid">
          <span className="text-sm text-muted-foreground">{t('amount')}</span>
          <span className="text-figure" data-testid="entry-amount">{formatMoney(money(entry.amountCents, entry.currency), locale)}</span>
        </p>
      )}
      {entry.deadline === null ? null : <p className="text-sm font-semibold">{t('deadline', { when: `${format.day(entry.deadline)} ${format.time(entry.deadline)}` })}</p>}
      <div className="grid gap-1">
        <p className="text-sm text-muted-foreground">{t('why')}</p>
        <p className="whitespace-pre-wrap wrap-long-words">{isDetector(fixed) ? t(`fixedReasons.${fixed}`) : entry.reason}</p>
      </div>
      <div className="grid gap-1">
        <p className="text-sm text-muted-foreground">{t('references')}</p>
        {entry.references.length === 0 ? <p className="text-sm">{t('noReferences')}</p> : (
          <ul className="flex flex-wrap gap-2">
            {entry.references.map((reference) => <li key={reference} className="min-w-0 rounded border px-2 py-0.5 font-mono text-sm wrap-long-words">{reference}</li>)}
          </ul>
        )}
      </div>
      {entry.draft === null ? null : (
        <div className="grid gap-1">
          <p className="text-sm text-muted-foreground">{t('draft')}</p>
          <blockquote className="min-w-0 border-l-2 pl-3 whitespace-pre-wrap wrap-long-words">{entry.draft}</blockquote>
        </div>
      )}
      <EntryMarkList marks={entryMarks(entry)} model={entry.model} />
      {entry.rentalId === null ? null : <Link href={rentalRoutes.rental(entry.rentalId)} className="inline-flex min-h-11 items-center justify-self-start font-semibold underline underline-offset-4">{t('openRental')}</Link>}
      {canDecide ? <EntryActions proposalId={entry.id} kind={entry.kind} passkeyNeeded={passkeyNeeded} together={together} /> : null}
    </article>
  )
}
