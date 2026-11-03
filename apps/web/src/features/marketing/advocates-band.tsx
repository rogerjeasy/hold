import { cn } from 'cn'
import { ArrowRight, Gavel, Scale, UserCheck } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { routes } from '@/lib/routes'
import motion from '@/features/site/motion.module.css'
import { OfferLadder } from '@/features/negotiation/offer-ladder'
import { RECORDED_RUN } from '@/features/negotiation/recorded-run'
import { FeatureGrid } from './feature-grid'
import { Section, SectionHeading } from './section'

const rules = [
  { key: 'limits', icon: Scale },
  { key: 'referee', icon: Gavel },
  { key: 'people', icon: UserCheck },
] as const

// The part of Hold a reader meets nowhere else, straight after the photograph: the recorded run of the two advocates,
// closing the gap between the two sides, and the three rules that bound it.
export function AdvocatesBand() {
  const t = useTranslations('advocatesBand')
  const format = useFormatter()

  return (
    <Section tone="band">
      <SectionHeading title={t('title')} lead={t('lead')} tone="band" />
      <div className={cn('mt-10 grid gap-8 md:mt-14 lg:grid-cols-[7fr_5fr] lg:items-start lg:gap-12', motion.reveal)}>
        {RECORDED_RUN === undefined ? null : (
          <OfferLadder
            transcript={RECORDED_RUN.transcript}
            caption={t('caption', { date: format.dateTime(RECORDED_RUN.recordedAt, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) })}
          />
        )}
        <div className="grid gap-6">
          <FeatureGrid columns="one" tone="band" items={rules.map(({ key, icon }) => ({ title: t(`rules.${key}.title`), body: t(`rules.${key}.body`), icon }))} />
          <Link
            href={routes.advocates}
            className="group inline-flex min-h-11 items-center gap-2 justify-self-start font-semibold text-band-accent underline-offset-4 hover:underline"
          >
            {t('action')}
            <ArrowRight aria-hidden="true" className="size-4 transition-transform duration-300 ease-spring group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </Section>
  )
}
