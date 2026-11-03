import type { LucideIcon } from 'lucide-react'
import { ArrowLeft, Bot, Camera, Scale, ShieldCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { linkRoutes } from '@/lib/routes'
import { RenterNote } from './renter-page'

export type UnavailableReason = 'no_assistant' | 'no_negotiation' | 'no_claim' | 'not_handed_over'

const ICONS: Readonly<Record<UnavailableReason, LucideIcon>> = { no_assistant: Bot, no_negotiation: Scale, no_claim: ShieldCheck, not_handed_over: Camera }

// A working link that opened a page this rental has nothing on yet, such as a claim before any. It says what is not
// there and leads back to the rental, instead of calling a good link broken.
export function LinkUnavailable({ token, reason }: { token: string; reason: UnavailableReason }) {
  const t = useTranslations('renter.unavailable')
  return (
    <RenterNote icon={ICONS[reason]} title={t(`${reason}.title`)} body={t(`${reason}.body`)}>
      <Button asChild className="mt-2 min-h-12">
        <Link href={`${linkRoutes.renter}/${token}`} referrerPolicy="no-referrer">
          <ArrowLeft aria-hidden="true" />
          {t('back')}
        </Link>
      </Button>
    </RenterNote>
  )
}
