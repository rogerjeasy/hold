import { useTranslations } from 'next-intl'
import { CapabilityTable, type CapabilityKey } from './capability-table'
import { TitledSection } from './section'

// The home page shows the hold's own lifecycle. The PayPal page lists every capability.
const homeRows: readonly CapabilityKey[] = ['hold', 'release', 'capture', 'renewal', 'events']

export function PayPalCapabilities() {
  const t = useTranslations('paypal')

  return (
    <TitledSection title={t('title')} lead={t('lead')}>
      <CapabilityTable rows={homeRows} />
    </TitledSection>
  )
}
