import { useTranslations } from 'next-intl'
import { ScreenAction, ScreenHeader } from './claim-screen-parts'
import { exampleRental, priceListKeys } from './example-rental'
import { useExampleMoney } from './use-example-money'

function AmountRow({ label, amount, state }: { label: string; amount: string; state: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-2 border bg-background px-2.5 py-2">
      <span className="font-semibold">{label}</span>
      <span className="font-semibold">{amount}</span>
      <span className="col-span-2 text-[0.8125rem] text-muted-foreground">{state}</span>
    </div>
  )
}

// What the renter reads before approving: two amounts kept apart, and the price of each kind of damage.
export function ReserveScreen() {
  const t = useTranslations('pages.howItWorks.reserveScreen')
  const prices = useTranslations('priceList')
  const shop = useTranslations('bothSides.renter')
  const money = useExampleMoney()

  return (
    <>
      <ScreenHeader left={shop('context')} right={shop('shopName')} />
      <p className="text-base font-bold tracking-tight">{t('item', { days: exampleRental.rentalDays })}</p>
      <AmountRow label={t('fee')} amount={money(exampleRental.feeCents)} state={t('feeState')} />
      <AmountRow label={t('hold')} amount={money(exampleRental.reservedCents)} state={t('holdState')} />
      <p className="text-[0.8125rem] text-muted-foreground">{t('promise')}</p>
      <div>
        <p className="label mb-1 text-xs text-muted-foreground">{prices('title')}</p>
        <dl className="figures text-[0.8125rem]">
          {priceListKeys.map((key) => (
            <div key={key} className="flex justify-between gap-2 border-t py-1">
              <dt className="min-w-0 font-sans">{prices(`items.${key}`)}</dt>
              <dd>{money(exampleRental.priceListCents[key])}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="mt-auto grid">
        <ScreenAction variant="primary">{t('approve')}</ScreenAction>
      </div>
    </>
  )
}
