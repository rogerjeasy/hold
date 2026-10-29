import type { Money } from '@hold/domain'
import { FlaskConical } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/money'

type SimulatedApprovalProps = { orderId: string; amount: Money; description: string; cancelPath: string }

// Stands in for PayPal's approval page in the test environment, and says so. It exists nowhere else.
export function SimulatedApproval({ orderId, amount, description, cancelPath }: SimulatedApprovalProps) {
  const t = useTranslations('simulatedPayPal')
  const locale = useLocale()
  return (
    <div className="mx-auto grid w-full max-w-md gap-6 px-4 py-12">
      <p className="flex gap-2 border border-border-strong bg-card p-3 text-sm">
        <FlaskConical aria-hidden="true" className="size-4.5 shrink-0 text-primary" />
        {t('notice')}
      </p>
      <p className="label text-xs text-muted-foreground">{t('label')}</p>
      <h1 className="text-page-title">{t('title')}</h1>
      <dl className="grid gap-3">
        <div>
          <dt className="text-sm text-muted-foreground">{t('amount')}</dt>
          <dd className="text-figure">{formatMoney(amount, locale)}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">{t('for')}</dt>
          <dd className="font-semibold wrap-long-words">{description}</dd>
        </div>
      </dl>
      <form method="post" action={`/simulated-paypal/${orderId}/approve`} className="grid gap-3">
        <Button type="submit" className="min-h-12 w-full">
          {t('approve')}
        </Button>
        <Button type="submit" name="then" value="dispute" variant="outline" className="min-h-12 w-full whitespace-normal">
          {t('approveThenDispute')}
        </Button>
        <Button type="submit" name="then" value="review" variant="outline" className="min-h-12 w-full whitespace-normal">
          {t('approveForReview')}
        </Button>
        <Button type="submit" name="then" value="other_amount" variant="outline" className="min-h-12 w-full whitespace-normal">
          {t('approveOtherAmount')}
        </Button>
      </form>
      <a href={cancelPath} className="inline-flex min-h-11 items-center justify-center font-semibold underline underline-offset-4">
        {t('cancel')}
      </a>
    </div>
  )
}
