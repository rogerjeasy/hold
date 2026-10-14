import { CircleCheck, FlaskConical, ScanLine, Smartphone, Store } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Notice } from '@/components/ui/notice'
import { routes } from '@/lib/routes'
import { FeatureGrid } from '../feature-grid'
import { MarkedList } from '../marked-list'
import { PageIntro } from '../page-intro'
import { SampleRentals } from '../sample-rentals'
import { TitledSection } from '../section'

const cast = [
  { key: 'owner', icon: Store },
  { key: 'staff', icon: ScanLine },
  { key: 'renter', icon: Smartphone },
] as const

const realKeys = ['paypal', 'comparison', 'approval'] as const
const simulatedKeys = ['money', 'camera', 'people'] as const

export function DemoScreen() {
  const t = useTranslations('pages.demo')

  return (
    <>
      <PageIntro title={t('title')} lead={t('lead')} action={{ href: routes.howItWorks, label: t('action') }}>
        <Notice title={t('status.title')} body={t('status.body')} />
      </PageIntro>
      <TitledSection title={t('samples.title')} lead={t('samples.lead')}>
        <SampleRentals />
      </TitledSection>
      <TitledSection title={t('cast.title')} lead={t('cast.lead')}>
        <FeatureGrid items={cast.map(({ key, icon }) => ({ title: t(`cast.items.${key}.title`), body: t(`cast.items.${key}.body`), icon }))} />
      </TitledSection>
      <TitledSection title={t('honest.title')} lead={t('honest.lead')} tone="band">
        <div className="grid gap-10 md:grid-cols-2 md:gap-12">
          <MarkedList title={t('honest.real.title')} items={realKeys.map((key) => t(`honest.real.items.${key}`))} icon={CircleCheck} tone="band" />
          <MarkedList
            title={t('honest.simulated.title')}
            items={simulatedKeys.map((key) => t(`honest.simulated.items.${key}`))}
            icon={FlaskConical}
            accent
            tone="band"
          />
        </div>
      </TitledSection>
    </>
  )
}
