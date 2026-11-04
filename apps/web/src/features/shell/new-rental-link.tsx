import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { LinkPendingIcon } from '@/components/ui/link-pending-icon'
import { Link } from '@/i18n/navigation'
import { rentalRoutes } from '@/lib/routes'

// The action a counter starts most, from any page. The rental page still checks the person may start one.
export function NewRentalLink() {
  const t = useTranslations('shell')
  return (
    <Button asChild>
      <Link href={rentalRoutes.new}>
        <LinkPendingIcon opening={t('openingPage')}><Plus aria-hidden="true" /></LinkPendingIcon>
        {t('newRental')}
      </Link>
    </Button>
  )
}
