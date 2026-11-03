import { cn } from 'cn'
import { useTranslations } from 'next-intl'
import motion from '@/features/site/motion.module.css'
import { HoldTag } from './hold-tag'
import { PhoneFrame } from './phone-frame'
import { RenterClaimScreen } from './renter-claim-screen'
import { Section, SectionHeading } from './section'
import { ShopClaimScreen } from './shop-claim-screen'
import { Stage } from './stage'

const HEADING_ID = 'both-sides-title'

// Two phones on one stage, tipped a little towards each other on wide screens, with the hold they share between them.
export function BothSides() {
  const t = useTranslations('bothSides')

  return (
    <Section aria-labelledby={HEADING_ID}>
      <SectionHeading id={HEADING_ID} title={t('title')} lead={t('lead')} />
      <Stage
        className={cn(
          'mt-10 grid justify-items-center px-4 py-10 md:mt-14 md:grid-cols-2 md:gap-x-6 md:py-12 lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:gap-x-0 lg:py-16',
          motion.reveal,
        )}
      >
        <div className="flex w-full justify-center lg:justify-end">
          <PhoneFrame caption={t('shop.caption')} className="transition-transform duration-700 ease-spring lg:-rotate-2 lg:hover:rotate-0">
            <ShopClaimScreen />
          </PhoneFrame>
        </div>
        {/* The dashed line runs down between the phones when they stack, and across when they sit side by side. */}
        <div className="relative flex w-full justify-center py-7 before:absolute before:inset-y-0 before:left-1/2 before:border-l before:border-dashed before:border-border-strong md:order-first md:col-span-2 md:pt-0 md:pb-10 md:before:hidden lg:order-none lg:col-span-1 lg:w-52 lg:items-center lg:self-stretch lg:py-0 lg:before:inset-x-0 lg:before:inset-y-auto lg:before:top-1/2 lg:before:block lg:before:border-t lg:before:border-l-0">
          <HoldTag />
        </div>
        <div className="flex w-full justify-center lg:justify-start">
          <PhoneFrame caption={t('renter.caption')} className="transition-transform duration-700 ease-spring lg:rotate-2 lg:hover:rotate-0">
            <RenterClaimScreen />
          </PhoneFrame>
        </div>
      </Stage>
    </Section>
  )
}
