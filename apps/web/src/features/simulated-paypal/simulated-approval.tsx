import type { Money } from '@hold/domain'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/money'
import { SimulatedSheet } from './simulated-sheet'

type SimulatedApprovalProps = { orderId: string; amount: Money; description: string; cancelPath: string }

// Stands in for PayPal's approval page in the test environment, and says so. It exists nowhere else.
export function SimulatedApproval({ orderId, amount, description, cancelPath }: SimulatedApprovalProps) {
  const t = useTranslations('simulatedPayPal')
  const locale = useLocale()
  return (
    <SimulatedSheet title={t('title')}>
      <dl className="grid gap-4 rounded-xl bg-muted/60 p-4">
        <div>
          <dt className="label text-xs text-muted-foreground">{t('amount')}</dt>
          <dd className="mt-1 text-headline tabular-nums wrap-long-words">{formatMoney(amount, locale)}</dd>
        </div>
        <div>
          <dt className="label text-xs text-muted-foreground">{t('for')}</dt>
          <dd className="mt-1 font-semibold wrap-long-words">{description}</dd>
        </div>
      </dl>
      <form method="post" action={`/simulated-paypal/${orderId}/approve`} className="grid gap-3">
        <Button type="submit" className="min-h-12 w-full">
          {t('approve')}
        </Button>
        <fieldset className="mt-3 grid gap-2">
          <legend className="label pb-2 text-xs text-muted-foreground">{t('outcomes')}</legend>
          <Button type="submit" name="then" value="dispute" variant="outline" className="min-h-12 w-full whitespace-normal">
            {t('approveThenDispute')}
          </Button>
          <Button type="submit" name="then" value="review" variant="outline" className="min-h-12 w-full whitespace-normal">
            {t('approveForReview')}
          </Button>
          <Button type="submit" name="then" value="other_amount" variant="outline" className="min-h-12 w-full whitespace-normal">
            {t('approveOtherAmount')}
          </Button>
        </fieldset>
      </form>
      <a href={cancelPath} className="inline-flex min-h-11 items-center justify-center font-semibold text-muted-foreground underline underline-offset-4 hover:text-foreground">
        {t('cancel')}
      </a>
    </SimulatedSheet>
  )
}
