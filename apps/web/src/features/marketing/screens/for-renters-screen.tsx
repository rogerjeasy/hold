import { EyeOff, HandCoins, MessageSquareReply, ReceiptText, Scale, ScrollText } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { routes } from '@/lib/routes'
import { audienceImages, renterPointKeys } from '../audience-points'
import { ClosingCall } from '../closing-call'
import { Faq, type FaqKey } from '../faq'
import { FeatureGrid } from '../feature-grid'
import { PageIntro } from '../page-intro'
import { PhoneFrame } from '../phone-frame'
import { PointList } from '../point-list'
import { PriceListCard } from '../price-list-card'
import { RenterClaimScreen } from '../renter-claim-screen'
import { SplitSection, TitledSection } from '../section'
import { StatementCompare } from '../statement-compare'

const pricePointKeys = ['cap', 'wear', 'old'] as const

const assurances = [
  { key: 'informed', icon: ScrollText },
  { key: 'noSurprise', icon: ReceiptText },
  { key: 'reply', icon: MessageSquareReply },
  { key: 'consistent', icon: Scale },
  { key: 'privacy', icon: EyeOff },
  { key: 'notInsurer', icon: HandCoins },
] as const

const questions: readonly FaqKey[] = ['charge', 'release', 'chargedFor', 'disagree', 'app', 'photographs']

export function ForRentersScreen() {
  const t = useTranslations('pages.forRenters')
  const audience = useTranslations('audiences.renters')
  const sides = useTranslations('bothSides')

  return (
    <>
      <PageIntro
        title={t('title')}
        lead={t('lead')}
        action={{ href: routes.howItWorks, label: t('action') }}
        image={{ src: audienceImages.renters, alt: audience('imageAlt') }}
      />
      <TitledSection title={t('statement.title')} lead={t('statement.lead')}>
        <StatementCompare />
      </TitledSection>
      <SplitSection
        title={t('benefitsHeading')}
        lead={t('benefitsLead')}
        asideFirst
        aside={
          <div className="flex justify-center border bg-card px-4 py-8 lg:py-12">
            <PhoneFrame caption={sides('renter.caption')}>
              <RenterClaimScreen />
            </PhoneFrame>
          </div>
        }
      >
        <PointList points={renterPointKeys.map((key) => audience(`points.${key}`))} className="text-[1.0625rem]" />
      </SplitSection>
      <SplitSection title={t('prices.title')} lead={t('prices.lead')} aside={<PriceListCard />}>
        <PointList points={pricePointKeys.map((key) => t(`prices.points.${key}`))} className="text-[1.0625rem]" />
      </SplitSection>
      <TitledSection title={t('assurances.title')} lead={t('assurances.lead')} tone="band">
        <FeatureGrid
          tone="band"
          items={assurances.map(({ key, icon }) => ({
            title: t(`assurances.items.${key}.title`),
            body: t(`assurances.items.${key}.body`),
            icon,
          }))}
        />
      </TitledSection>
      <Faq title={t('faq.title')} lead={t('faq.lead')} questions={questions} />
      <ClosingCall />
    </>
  )
}
