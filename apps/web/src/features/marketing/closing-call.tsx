import { cn } from 'cn'
import { useTranslations } from 'next-intl'
import motion from '@/features/site/motion.module.css'
import { AudienceDoors } from './audience-doors'
import { Section } from './section'

// The last word on every page that sells: a large invitation on its own card, and the two doors again.
export function ClosingCall() {
  const t = useTranslations('closing')

  return (
    <Section>
      <div className={cn('surface relative isolate overflow-clip px-5 py-10 md:px-10 md:py-14 lg:px-14 lg:py-18', motion.reveal)}>
        <div aria-hidden="true" className="dot-grid absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_80%_90%_at_0%_100%,black,transparent_70%)]" />
        <div aria-hidden="true" className="absolute -right-1/4 -bottom-1/2 -z-10 aspect-square w-[min(40rem,80%)] rounded-full bg-primary/10 blur-3xl" />
        <div className="grid gap-6 lg:grid-cols-[7fr_5fr] lg:items-end lg:gap-12">
          <h2 className="text-closing text-balance wrap-long-words">{t('title')}</h2>
          <div>
            <p className="max-w-prose text-lead text-muted-foreground">{t('lead')}</p>
            <AudienceDoors className="mt-7" />
          </div>
        </div>
      </div>
    </Section>
  )
}
