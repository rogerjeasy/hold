import type { LedgerLine } from '@hold/db'
import { BookCheck } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'
import { StatusPill } from '@/components/ui/status-pill'
import type { StatusTone } from '@/components/ui/status-pill'
import { Link } from '@/i18n/navigation'
import { rentalRoutes } from '@/lib/routes'

const OUTCOME_TONES: Readonly<Record<LedgerLine['outcome'], StatusTone>> = { clean: 'success', settled: 'neutral', unpaid: 'danger', open: 'progress' }

// The shop's own outcomes, newest first (extensions.md section 7.11): what each closed rental added to its renter's
// record. Another shop's outcomes are never listed here.
export function TrustLedger({ ledger, timeZone }: { ledger: readonly LedgerLine[]; timeZone: string }) {
  const t = useTranslations('trust.ladder.ledger')
  const categories = useTranslations('shop.items.categories')
  const format = useFormatter()
  return (
    <Panel title={t('title')} icon={BookCheck}>
      {ledger.length === 0 ? (
        <p className="px-4 py-4 text-muted-foreground md:px-5">{t('empty')}</p>
      ) : (
        <ul>
          {ledger.map((line) => (
            <li key={line.rentalId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border/70 px-4 py-2.5 last:border-b-0 md:px-5">
              <span className="grid min-w-0 gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={OUTCOME_TONES[line.outcome]}>{t(`outcomes.${line.outcome}`)}</StatusPill>
                  {line.counts ? null : <span className="text-sm text-muted-foreground">{t('notCounted')}</span>}
                </span>
                <span className="text-sm text-muted-foreground">{t('line', { category: categories(line.itemCategory), date: format.dateTime(line.closedAt, { dateStyle: 'medium', timeZone }) })}</span>
              </span>
              <Link href={rentalRoutes.rental(line.rentalId)} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 font-semibold text-primary underline-offset-4 hover:underline">
                {t('see')}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
