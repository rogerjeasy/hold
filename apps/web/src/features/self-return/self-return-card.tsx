import { ArrowRight, MapPin } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { linkRoutes } from '@/lib/routes'

// offered: the renter may return the item now; shopClosed: nobody is at the counter, so it comes first on the page.
export type SelfReturnOffer = { readonly offered: boolean; readonly shopClosed: boolean; readonly droppedOffAt: Date | null }

// On the renter's own page, the way to return the item with nobody at the counter (architecture.md section 6.13).
export function SelfReturnCard({ token, offer }: { token: string; offer: SelfReturnOffer }) {
  const t = useTranslations('selfReturn.card')
  if (!offer.offered) return null
  return (
    <section aria-labelledby="self-return-card" className={cn('surface grid gap-3 p-4 md:p-5', offer.shopClosed && 'border-primary/50 shadow-raised')}>
      <h2 id="self-return-card" className="flex items-center gap-3 text-lg leading-snug font-extrabold tracking-tight text-balance">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><MapPin className="size-4.5" /></span>
        {offer.shopClosed ? t('closedTitle') : t('openTitle')}
      </h2>
      <p className="max-w-prose text-pretty">{t('body')}</p>
      <p className="label text-xs text-muted-foreground">{t('meta')}</p>
      <Button asChild variant={offer.shopClosed ? 'default' : 'outline'} className="justify-self-stretch sm:justify-self-start">
        <Link href={linkRoutes.selfReturn(token)} referrerPolicy="no-referrer">
          {t('start')}
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
    </section>
  )
}
