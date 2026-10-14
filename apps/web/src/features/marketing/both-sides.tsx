import { useTranslations } from 'next-intl'
import { HoldTag } from './hold-tag'
import { PhoneFrame } from './phone-frame'
import { RenterClaimScreen } from './renter-claim-screen'
import { Section, SectionHeading } from './section'
import { ShopClaimScreen } from './shop-claim-screen'

const HEADING_ID = 'both-sides-title'

export function BothSides() {
  const t = useTranslations('bothSides')

  return (
    <Section aria-labelledby={HEADING_ID}>
      <SectionHeading id={HEADING_ID} title={t('title')} lead={t('lead')} />
      <div className="mt-10 grid justify-items-center border bg-card px-4 py-8 md:mt-14 md:grid-cols-2 md:gap-x-6 md:py-10 lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:gap-x-0 lg:py-12">
        <div className="flex w-full justify-center lg:justify-end">
          <PhoneFrame caption={t('shop.caption')}>
            <ShopClaimScreen />
          </PhoneFrame>
        </div>
        {/* The dashed line runs down between the phones when they stack, and across when they sit side by side. */}
        <div className="relative flex w-full justify-center py-6 before:absolute before:inset-y-0 before:left-1/2 before:border-l before:border-dashed before:border-border-strong md:order-first md:col-span-2 md:pt-0 md:pb-8 md:before:hidden lg:order-none lg:col-span-1 lg:w-48 lg:self-stretch lg:py-0 lg:before:inset-x-0 lg:before:inset-y-auto lg:before:top-1/2 lg:before:block lg:before:border-t lg:before:border-l-0 lg:items-center">
          <HoldTag />
        </div>
        <div className="flex w-full justify-center lg:justify-start">
          <PhoneFrame caption={t('renter.caption')}>
            <RenterClaimScreen />
          </PhoneFrame>
        </div>
      </div>
    </Section>
  )
}
