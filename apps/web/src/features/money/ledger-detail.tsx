import { useTranslations } from 'next-intl'
import type { Ref } from 'react'
import { SampleTag } from '@/components/ui/sample-tag'
import { Link } from '@/i18n/navigation'
import { rentalRoutes } from '@/lib/routes'
import { detailLinkClass, Fact, SubHeading } from '@/components/detail-parts'
import type { LedgerRow } from './ledger-rows'
import type { LedgerText } from './use-ledger-text'

// Who the audit trail names: a person, the renter, the shop's systems or one of the agents.
const ACTORS = ['person', 'staff', 'renter', 'system', 'worker', 'shop_agent', 'renter_agent', 'public_agent', 'public', 'referee'] as const
type Actor = (typeof ACTORS)[number]
const isActor = (kind: string): kind is Actor => ACTORS.some((actor) => actor === kind)

type LedgerDetailProps = { row: LedgerRow; text: LedgerText; headingRef: Ref<HTMLHeadingElement> }

// One line of the money log, opened: when PayPal says it happened and when Hold wrote it, what confirmed it (the
// read-back, the verified PayPal event about the same resource, the execution that asked for it) and the rental's
// audit trail. A PayPal event is named by its type and identifier; its body, with the payer's details, is never shown.
export function LedgerDetail({ row, text, headingRef }: LedgerDetailProps) {
  const t = useTranslations('money.detail')
  const actors = useTranslations('money.actors')
  return (
    <div className="grid min-w-0 gap-5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <h2 ref={headingRef} tabIndex={-1} className="text-[1.3125rem] leading-tight font-extrabold tracking-tight text-balance wrap-long-words focus:outline-none">{text.lineName(row)}</h2>
        {row.rental.simulated ? <SampleTag /> : null}
      </div>
      <dl className="grid grid-cols-2 gap-3 @md:grid-cols-4">
        <Fact label={t('rental')} value={`${text.renter(row.rental)} · ${text.period(row.rental)}`} />
        <Fact label={t('occurred')} value={text.moment(row.occurredAt)} />
        <Fact label={t('flow')} value={text.flow(row.flow)} />
        {row.paypalFeeCents === null ? null : <Fact label={t('paypalFee')} value={text.money(row.paypalFeeCents)} />}
        {row.netCents === null ? null : <Fact label={t('net')} value={text.money(row.netCents)} />}
      </dl>
      <section className="grid gap-2" aria-label={t('confirmed')}>
        <SubHeading>{t('confirmed')}</SubHeading>
        <p>{t('readBack', { when: text.moment(row.recordedAt) })}</p>
        <p className="font-mono text-sm wrap-long-words">{row.paypalReference}</p>
        <p className="text-sm">
          {row.event === null
            ? t('noEvent')
            : t(row.event.simulated ? 'simulatedEvent' : 'event', { type: row.event.type, id: row.event.eventId, when: text.moment(row.event.receivedAt) })}
        </p>
        <p className="text-sm">
          {row.execution === null ? t('noExecution') : t('execution', { action: row.execution.action, key: row.execution.idempotencyKey, attempts: row.execution.attempts })}
        </p>
      </section>
      <section className="grid gap-2" aria-label={t('audit')}>
        <SubHeading>{t('audit')}</SubHeading>
        {row.rental.audit.length === 0 ? <p className="text-sm">{t('noAudit')}</p> : (
          <ul aria-label={t('audit')} className="grid divide-y border">
            {row.rental.audit.map((line, index) => (
              <li key={`${line.action}-${String(index)}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-3 py-2 text-sm">
                <span className="font-mono wrap-long-words">{line.action}</span>
                <span className="text-muted-foreground">{`${isActor(line.actorKind) ? actors(line.actorKind) : line.actorKind} · ${text.moment(line.at)}`}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Link href={rentalRoutes.rental(row.rentalId)} className={detailLinkClass}>{t('openRental')}</Link>
    </div>
  )
}
