import { Baby, Bike, Camera, Lock, PartyPopper, Ruler, Tent, UserCheck, Users, Wrench } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { routes } from '@/lib/routes'
import { audienceImages, shopPointKeys } from '../audience-points'
import { BeforeAfterTable } from '../before-after-table'
import { ClosingCall } from '../closing-call'
import { FeatureGrid } from '../feature-grid'
import { ItemPassport } from '../item-passport'
import { PageIntro } from '../page-intro'
import { PointList } from '../point-list'
import { PriceListCard } from '../price-list-card'
import { SplitSection, TitledSection } from '../section'
import { ShopToday } from '../shop-today'

const setupKeys = ['prices', 'wear', 'photos', 'amounts'] as const
const passportPointKeys = ['old', 'maintenance', 'resale'] as const

const safeguards = [
  { key: 'approval', icon: UserCheck },
  { key: 'second', icon: Users },
  { key: 'cap', icon: Ruler },
  { key: 'records', icon: Lock },
] as const

const shopTypes = [
  { key: 'bikes', icon: Bike },
  { key: 'cameras', icon: Camera },
  { key: 'outdoor', icon: Tent },
  { key: 'events', icon: PartyPopper },
  { key: 'tools', icon: Wrench },
  { key: 'family', icon: Baby },
] as const

export function ForShopsScreen() {
  const t = useTranslations('pages.forShops')
  const audience = useTranslations('audiences.shops')

  return (
    <>
      <PageIntro
        title={t('title')}
        lead={t('lead')}
        action={{ href: routes.demo, label: t('action') }}
        secondaryAction={{ href: routes.howItWorks, label: t('secondaryAction') }}
        image={{ src: audienceImages.shops, alt: audience('imageAlt') }}
      />
      <SplitSection title={t('benefitsHeading')} lead={t('benefitsLead')} aside={<ShopToday />}>
        <PointList points={shopPointKeys.map((key) => audience(`points.${key}`))} className="text-[1.0625rem]" />
      </SplitSection>
      <TitledSection title={t('change.title')} lead={t('change.lead')}>
        <BeforeAfterTable />
      </TitledSection>
      <SplitSection title={t('setup.title')} lead={t('setup.lead')} aside={<PriceListCard />} asideFirst>
        <FeatureGrid
          columns="one"
          items={setupKeys.map((key) => ({ title: t(`setup.items.${key}.title`), body: t(`setup.items.${key}.body`) }))}
        />
      </SplitSection>
      <SplitSection title={t('passport.title')} lead={t('passport.lead')} aside={<ItemPassport />}>
        <PointList points={passportPointKeys.map((key) => t(`passport.points.${key}`))} className="text-[1.0625rem]" />
      </SplitSection>
      <TitledSection title={t('safeguards.title')} lead={t('safeguards.lead')} tone="band">
        <FeatureGrid
          tone="band"
          columns="four"
          items={safeguards.map(({ key, icon }) => ({
            title: t(`safeguards.items.${key}.title`),
            body: t(`safeguards.items.${key}.body`),
            icon,
          }))}
        />
      </TitledSection>
      <TitledSection title={t('types.title')} lead={t('types.lead')}>
        <FeatureGrid items={shopTypes.map(({ key, icon }) => ({ title: t(`types.items.${key}.title`), body: t(`types.items.${key}.body`), icon }))} />
      </TitledSection>
      <ClosingCall />
    </>
  )
}
