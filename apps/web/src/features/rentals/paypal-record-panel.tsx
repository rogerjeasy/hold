import type { PayPalRecord, PayPalRecordLine } from '@hold/db'
import { formatMoney, money } from '@hold/domain'
import { useLocale, useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'
import { SampleTag } from '@/components/ui/sample-tag'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'

const ID_NAMES = ['order', 'authorization', 'capture', 'refund', 'invoice'] as const

// The PayPal record (architecture.md section 11.9): each call Hold made to PayPal for the rental, with PayPal's own ids
// and status, the PayPal-Request-Id it went with, and what confirmed it. PayPal's ids and words are shown as PayPal
// writes them, so they can be found in PayPal's own records.
export function PayPalRecordPanel({ record, clock }: { record: PayPalRecord; clock: ShopClock }) {
  const t = useTranslations('shop.rentals.paypal')
  return (
    <Panel title={t('title')} aside={record.simulated ? <SampleTag /> : null}>
      <div className="grid gap-3 px-4 py-4 md:px-5">
        <p className="max-w-prose text-muted-foreground">{t('body')}</p>
        {record.simulated ? <p className="border-l-2 border-primary pl-3">{t('sampleNote')}</p> : null}
        {record.lines.length === 0 ? <p>{t('empty')}</p> : null}
      </div>
      {record.lines.length === 0 ? null : (
        <ol className="border-t">
          {record.lines.map((line, index) => <RecordLine key={`${line.requestId ?? line.kind ?? ''}-${String(index)}`} line={line} simulated={record.simulated} clock={clock} />)}
        </ol>
      )}
    </Panel>
  )
}

function RecordLine({ line, simulated, clock }: { line: PayPalRecordLine; simulated: boolean; clock: ShopClock }) {
  const t = useTranslations('shop.rentals.paypal')
  const locale = useLocale()
  const format = useShopFormat(clock)
  const title = line.kind !== null ? t(`kinds.${line.kind}`) : line.action !== null ? t(`calls.${line.action}`) : ''
  return (
    <li className="grid min-w-0 gap-2 border-b px-4 py-3 last:border-b-0 md:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="flex min-w-0 flex-wrap items-center gap-2 font-semibold">
          {title}
          {simulated ? <SampleTag /> : null}
        </span>
        <span className="figures">{formatMoney(money(line.amountCents, line.currency), locale)}</span>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        {ID_NAMES.map((name) => {
          const id = line.ids[name]
          return id === undefined ? null : <Row key={name} label={t(`ids.${name}`)} value={id} code />
        })}
        {line.paypalStatus === null ? null : <Row label={t('status')} value={line.paypalStatus} code />}
        {line.finalCapture === null ? null : <Row label={t('finalCapture')} value={String(line.finalCapture)} code />}
        {line.authorizationState === null ? null : <Row label={t('authorizationNow')} value={t(`authorizationStates.${line.authorizationState}`)} />}
        {line.requestId === null ? null : <Row label={t('requestId')} value={line.requestId} code />}
      </dl>
      {line.releasedBy === null ? null : <p className="text-sm wrap-long-words">{t('releasedBy', { capture: line.releasedBy.capture })}</p>}
      <div className="grid gap-0.5 text-sm text-muted-foreground">
        {line.readBackAt === null ? line.callState === null ? null : <p>{t(`callStates.${line.callState}`)}</p> : simulated ? null : <p>{t('readBack', { when: format.deadline(line.readBackAt) })}</p>}
        {line.event === null ? null : <p className="wrap-long-words">{t(line.event.simulated ? 'simulatedEvent' : 'event', { type: line.event.type, when: format.deadline(line.event.receivedAt) })}</p>}
      </div>
    </li>
  )
}

function Row({ label, value, code = false }: { label: string; value: string; code?: boolean }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={code ? 'min-w-0 font-mono break-all' : 'min-w-0'}>{value}</dd>
    </>
  )
}
