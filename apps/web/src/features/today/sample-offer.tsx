'use client'

import { Sparkles } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { ActionMessage } from '@/features/shop/action-message'
import { addSampleRentals } from '@/features/shop/actions'
import { Link } from '@/i18n/navigation'
import { shopRoutes } from '@/lib/routes'

// For an owner whose shop has no rentals yet: one press fills the day with sample rentals, each marked as a sample.
export function SampleOffer({ needsPrices }: { needsPrices: boolean }) {
  const t = useTranslations('today.sample')
  const setup = useTranslations('shop.setup.prices')
  const locale = useLocale()
  const [result, add, pending] = useActionState(addSampleRentals, null)

  return (
    <section className="grid gap-4 border border-dashed border-border-strong bg-card p-4 text-card-foreground md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center md:gap-5 md:p-5">
      <Sparkles aria-hidden="true" className="size-6 text-primary" />
      <div className="min-w-0">
        <h2 className="font-bold">{t('offerTitle')}</h2>
        <p className="mt-1 text-[0.9375rem] text-muted-foreground">{needsPrices ? t('needsPrices') : t('offerBody')}</p>
        <div className="mt-2 empty:hidden">
          <ActionMessage result={result} success={t('added')} />
        </div>
      </div>
      {needsPrices ? (
        <Button asChild variant="outline" className="justify-self-start">
          <Link href={shopRoutes.prices}>{setup('action')}</Link>
        </Button>
      ) : (
        <form action={add} className="justify-self-start">
          <input type="hidden" name="locale" value={locale} />
          <Button type="submit" disabled={pending}>
            {pending ? t('adding') : t('add')}
          </Button>
        </form>
      )}
    </section>
  )
}
