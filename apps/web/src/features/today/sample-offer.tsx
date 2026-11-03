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
    <section className="surface relative isolate grid gap-4 overflow-clip p-5 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center md:gap-5 md:p-6">
      <div aria-hidden="true" className="absolute inset-0 -z-10 dot-grid mask-l-from-0% mask-l-to-60% opacity-60" />
      <span aria-hidden="true" className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Sparkles className="size-5" />
      </span>
      <div className="min-w-0">
        <h2 className="text-[1.0625rem] font-extrabold tracking-tight">{t('offerTitle')}</h2>
        <p className="mt-1 max-w-prose text-[0.9375rem] text-muted-foreground">{needsPrices ? t('needsPrices') : t('offerBody')}</p>
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
