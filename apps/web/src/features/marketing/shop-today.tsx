import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { exampleRental, exampleShop, holdLength } from './example-rental'
import { useExampleMoney } from './use-example-money'

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b p-4 odd:border-r md:p-5">
      <dt className="text-[0.9375rem] text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-title">{value}</dd>
    </div>
  )
}

// A picture of a button, as in the phone screens: the panel is an illustration and nothing in it can be pressed.
function AttentionRow({ action, children }: { action: string; children: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 border-t py-2.5 text-[0.9375rem]">
      <span className="min-w-0">{children}</span>
      <span className="shrink-0 rounded-lg border border-border-strong px-2.5 py-1 text-sm font-semibold">{action}</span>
    </li>
  )
}

// The owner's day at a glance: what is out, what is held, and the two things that need a decision.
export function ShopToday() {
  const t = useTranslations('pages.forShops.today')
  const shop = useTranslations('bothSides.renter')
  const money = useExampleMoney()

  return (
    <figure className="border bg-card text-card-foreground">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b px-4 py-3 md:px-5">
        <p className="font-bold">{shop('shopName')}</p>
        <p className="label text-xs text-muted-foreground">{t('title')}</p>
      </div>
      <dl className="grid grid-cols-2">
        <Tile label={t('itemsOut')} value={String(exampleShop.itemsOut)} />
        <Tile label={t('dueBack')} value={String(exampleShop.dueBack)} />
        <Tile label={t('holds')} value={money(exampleShop.holdsInPlaceCents)} />
        <Tile label={t('claims')} value={String(exampleShop.claimsWaiting)} />
      </dl>
      <div className="px-4 pt-4 pb-2 md:px-5">
        <p className="label text-xs text-muted-foreground">{t('attention')}</p>
        <ul className="mt-2">
          <AttentionRow action={t('claimAction')}>
            {t('claim', { number: exampleRental.holdNumber, amount: money(exampleRental.outcomes.damage.takenCents) })}
          </AttentionRow>
          <AttentionRow action={t('expiringAction')}>
            {t('expiring', { number: exampleShop.expiringHold.number, day: exampleShop.expiringHold.day, max: holdLength.paypalDays })}
          </AttentionRow>
        </ul>
      </div>
      <figcaption className="border-t px-4 py-2.5 text-sm text-muted-foreground md:px-5">{t('caption')}</figcaption>
    </figure>
  )
}
