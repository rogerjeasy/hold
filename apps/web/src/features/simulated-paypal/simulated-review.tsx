import { FlaskConical } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'

// Stands in for PayPal finishing its review of a payment it held, in the test environment only, and says so.
export function SimulatedReview({ orderId }: { orderId: string }) {
  const t = useTranslations('simulatedPayPal')
  return (
    <div className="mx-auto grid w-full max-w-md gap-6 px-4 py-12">
      <p className="flex gap-2 border border-border-strong bg-card p-3 text-sm">
        <FlaskConical aria-hidden="true" className="size-4.5 shrink-0 text-primary" />
        {t('notice')}
      </p>
      <p className="label text-xs text-muted-foreground">{t('label')}</p>
      <h1 className="text-page-title">{t('reviewTitle')}</h1>
      <p className="text-pretty text-muted-foreground">{t('reviewBody')}</p>
      <form method="post" action={`/simulated-paypal/${orderId}/review`} className="grid gap-3">
        <Button type="submit" name="outcome" value="completed" className="min-h-12 w-full">
          {t('complete')}
        </Button>
        <Button type="submit" name="outcome" value="declined" variant="outline" className="min-h-12 w-full">
          {t('deny')}
        </Button>
      </form>
    </div>
  )
}
