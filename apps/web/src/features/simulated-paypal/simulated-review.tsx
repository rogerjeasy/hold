import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { SimulatedSheet } from './simulated-sheet'

// Stands in for PayPal finishing its review of a payment it held, in the test environment only, and says so.
export function SimulatedReview({ orderId }: { orderId: string }) {
  const t = useTranslations('simulatedPayPal')
  return (
    <SimulatedSheet title={t('reviewTitle')}>
      <p className="text-pretty text-muted-foreground">{t('reviewBody')}</p>
      <form method="post" action={`/simulated-paypal/${orderId}/review`} className="grid gap-3">
        <Button type="submit" name="outcome" value="completed" className="min-h-12 w-full">
          {t('complete')}
        </Button>
        <Button type="submit" name="outcome" value="declined" variant="outline" className="min-h-12 w-full">
          {t('deny')}
        </Button>
      </form>
    </SimulatedSheet>
  )
}
