import type { RentalHold } from '@hold/db'
import { useTranslations } from 'next-intl'

type HoldReasonProps = {
  hold: Pick<RentalHold, 'reservedCents' | 'ordinaryCents' | 'trust'>
  money: (cents: number) => string
  // The renter reads why their hold is lower; staff read the rung and the counts, and nothing of other shops.
  audience: 'renter' | 'staff'
}

// Why a hold is lower than the ordinary one (extensions.md section 7.5). Nothing for an ordinary hold.
export function HoldReason({ hold, money, audience }: HoldReasonProps) {
  const t = useTranslations('trust')
  if (hold.trust === null || hold.reservedCents >= hold.ordinaryCents) return null
  const values = { amount: money(hold.reservedCents), ordinary: money(hold.ordinaryCents), count: hold.trust.cleanReturns, months: hold.trust.windowMonths }
  return (
    <p className="max-w-prose border-l-2 border-primary pl-3 text-pretty">
      {audience === 'renter' ? t('reason', values) : t('staffReason', { ...values, version: hold.trust.version, rung: hold.trust.rung })}
    </p>
  )
}
