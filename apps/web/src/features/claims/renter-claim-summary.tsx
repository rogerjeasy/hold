import { useId } from 'react'
import { useTranslations } from 'next-intl'

// What the claim does to the renter's hold, drawn as the hold itself: the part the shop would take and the part that
// goes back to them, side by side on one bar, with each amount in words beside its colour.
export function RenterClaimSummary({ captureCents, releaseCents, invoiceCents, amount }: { captureCents: number; releaseCents: number; invoiceCents: number; amount: (cents: number) => string }) {
  const t = useTranslations('claim')
  const page = useTranslations('claim.renterPage')
  const titleId = useId()
  const held = captureCents + releaseCents
  const share = held === 0 ? 0 : Math.round((captureCents / held) * 1000) / 10
  return (
    <section aria-labelledby={titleId} className="surface grid min-w-0 animate-rise gap-5 p-5 md:p-6">
      <div className="grid gap-1">
        <h2 id={titleId} className="label text-xs text-muted-foreground">{t('summary')}</h2>
        <p className="text-headline tabular-nums wrap-long-words">{amount(captureCents)}</p>
        <p className="text-sm text-muted-foreground">{page('fromHold', { held: amount(held) })}</p>
      </div>
      {held === 0 ? null : (
        <div aria-hidden="true" className="flex h-3 overflow-hidden rounded-full bg-success/25">
          <span className="h-full animate-fade rounded-full bg-primary" style={{ width: `${String(share)}%` }} />
        </div>
      )}
      <dl className="grid gap-3 text-[0.9375rem] sm:grid-cols-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <span aria-hidden="true" className="mt-1.5 size-2.5 shrink-0 rounded-full bg-primary" />
          <div className="min-w-0">
            <dt className="text-muted-foreground">{t('capture')}</dt>
            <dd className="figures font-semibold">{amount(captureCents)}</dd>
          </div>
        </div>
        <div className="flex min-w-0 items-start gap-2.5">
          <span aria-hidden="true" className="mt-1.5 size-2.5 shrink-0 rounded-full bg-success" />
          <div className="min-w-0">
            <dt className="text-muted-foreground">{t('release')}</dt>
            <dd className="figures font-semibold">{amount(releaseCents)}</dd>
          </div>
        </div>
        {invoiceCents > 0 ? (
          <div className="flex min-w-0 items-start gap-2.5 sm:col-span-2">
            <span aria-hidden="true" className="mt-1.5 size-2.5 shrink-0 rounded-full bg-warning" />
            <div className="min-w-0">
              <dt className="text-muted-foreground">{t('invoice')}</dt>
              <dd className="figures font-semibold">{amount(invoiceCents)}</dd>
            </div>
          </div>
        ) : null}
      </dl>
    </section>
  )
}
