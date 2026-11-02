import type { ConditionReply } from '@hold/domain'
import { CircleCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useShopFormat } from '@/hooks/use-shop-format'

// The renter's own answer to the handover photographs, with when they gave it: part of the record a tribunal reads.
export function HandoverConfirmation({ confirmed, timeZone }: { confirmed: { readonly reply: ConditionReply; readonly at: Date }; timeZone: string }) {
  const t = useTranslations('provenance')
  const format = useShopFormat({ timeZone, currency: null })
  return (
    <p className="flex items-start gap-2 font-semibold">
      <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
      {t(confirmed.reply === 'confirmed' ? 'confirmed' : 'added', { day: format.day(confirmed.at), time: format.time(confirmed.at) })}
    </p>
  )
}
