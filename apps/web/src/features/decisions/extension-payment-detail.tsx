import { useTranslations } from 'next-intl'
import { Fact } from '@/components/detail-parts'
import type { ExtensionPaymentRow } from './board'
import { CheckPaymentForm } from './check-payment-form'
import type { RowText } from './use-row-text'

// Money PayPal moved for extra days that Hold did not apply as quoted (architecture.md section 6.14): what happened,
// Hold's price beside what PayPal took, and the capture to find in PayPal. The person acts in PayPal; here they only say
// they have looked. Nothing on this board refunds or charges anyone.
export function ExtensionPaymentDetail({ row, text }: { row: ExtensionPaymentRow; text: RowText }) {
  const t = useTranslations('decisions.detail.extensionPayment')
  return (
    <>
      <p className="max-w-prose text-pretty">{t(row.attention)}</p>
      <dl className="grid grid-cols-2 gap-3 @md:grid-cols-3">
        <Fact label={t('price')} value={text.money(row.quotedCents)} />
        <Fact label={t('took')} value={text.money(row.amountCents)} />
        <Fact label={t('capture')} value={row.paypalCaptureId} />
      </dl>
      {row.decider === 'you' ? <CheckPaymentForm extensionId={row.extensionId} /> : null}
    </>
  )
}
