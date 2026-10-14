import { useTranslations } from 'next-intl'
import { FindingRow, PhotoPair, ScreenAction, ScreenHeader } from './claim-screen-parts'
import { exampleRental } from './example-rental'
import { useExampleMoney } from './use-example-money'

export function ShopClaimScreen() {
  const t = useTranslations('bothSides')
  const money = useExampleMoney()
  const taken = money(exampleRental.outcomes.damage.takenCents)

  return (
    <>
      <ScreenHeader left={t('shop.context')} right={t('shop.item')} />
      <p className="text-base font-bold tracking-tight">{t('shop.title', { count: exampleRental.newMarkCount })}</p>
      <PhotoPair />
      <FindingRow kind="new" title={t('finding.scratch')} amount={taken} note={t('shop.newNote')} />
      <FindingRow kind="old" title={t('finding.scuff')} amount={money(0)} note={t('shop.oldNote')} />
      <div className="mt-auto grid gap-1.5">
        <ScreenAction variant="primary">{t('shop.approve', { amount: taken })}</ScreenAction>
        <ScreenAction variant="outline">{t('shop.change')}</ScreenAction>
      </div>
    </>
  )
}
