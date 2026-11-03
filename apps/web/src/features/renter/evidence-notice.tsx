import { EVIDENCE_KEPT_DAYS } from '@hold/domain'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { routes } from '@/lib/routes'

// Said once, before the renter approves the fee or the hold: the item's photographs are kept as evidence, and for how
// long, read from the period the evidence bucket deletes them after.
export function EvidenceNotice() {
  const t = useTranslations('renter')
  return (
    <p className="max-w-prose text-[0.9375rem] text-pretty text-muted-foreground">
      {t.rich('evidenceNotice', {
        days: EVIDENCE_KEPT_DAYS,
        link: (chunks) => (
          <Link href={routes.privacy} referrerPolicy="no-referrer" className="font-semibold text-foreground underline underline-offset-4">
            {chunks}
          </Link>
        ),
      })}
    </p>
  )
}
