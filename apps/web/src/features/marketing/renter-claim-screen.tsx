import { useTranslations } from 'next-intl'
import { FindingRow, PhotoPair, ScreenAction, ScreenHeader } from './claim-screen-parts'
import { exampleRental } from './example-rental'
import { useExampleMoney } from './use-example-money'

export function RenterClaimScreen() {
  const t = useTranslations('bothSides')
  const money = useExampleMoney()
  const { takenCents, releasedCents } = exampleRental.outcomes.damage
  const taken = money(takenCents)

  return (
    <>
      <ScreenHeader left={t('renter.context')} right={t('renter.shopName')} />
      <p className="text-base font-bold tracking-tight">{t('renter.title', { amount: taken })}</p>
      <PhotoPair />
      <FindingRow kind="new" title={t('finding.scratch')} amount={taken} note={t('renter.newNote')} />
      <FindingRow kind="old" title={t('finding.scuff')} amount={money(0)} note={t('renter.oldNote')} />
      <p className="figures text-xs text-muted-foreground">
        {t('renter.ifAccept')}{' '}
        <span className="font-medium text-foreground">{t('renter.ifAcceptResult', { taken, released: money(releasedCents) })}</span>
      </p>
      <div className="mt-auto grid grid-cols-2 gap-1.5">
        <ScreenAction variant="primary">{t('renter.accept')}</ScreenAction>
        <ScreenAction variant="outline">{t('renter.disagree')}</ScreenAction>
      </div>
    </>
  )
}
