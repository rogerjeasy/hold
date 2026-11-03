import { cn } from 'cn'
import { ArrowRight, BadgeCheck, ListChecks, ScanSearch, Sunrise } from 'lucide-react'
import { useId } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { routes } from '@/lib/routes'
import motion from '@/features/site/motion.module.css'
import { Section, SectionHeading } from './section'

const parts = [
  { key: 'detect', icon: ScanSearch, href: routes.ai },
  { key: 'operations', icon: Sunrise, href: routes.ai },
  { key: 'evidence', icon: BadgeCheck, href: routes.verify },
  { key: 'measured', icon: ListChecks, href: routes.reliability },
] as const

// What Hold adds around the hold, each part with the page where it runs, so the reader can check every claim.
export function JoinedParts() {
  const t = useTranslations('joined')
  const titleId = useId()

  return (
    <Section aria-labelledby={titleId}>
      <SectionHeading id={titleId} title={t('title')} lead={t('lead')} />
      <ul role="list" className={cn('stagger mt-10 grid gap-4 sm:grid-cols-2 md:mt-14 lg:grid-cols-4', motion.reveal)}>
        {parts.map(({ key, icon: Icon, href }) => (
          <li key={key} className="surface flex min-w-0 flex-col p-5 md:p-6">
            <span aria-hidden="true" className="mb-5 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
              <Icon className="size-5" />
            </span>
            <h3 className="text-xl leading-tight font-bold tracking-tight wrap-long-words">{t(`items.${key}.title`)}</h3>
            <p className="mt-2 text-muted-foreground">{t(`items.${key}.body`)}</p>
            <Link href={href} className="group mt-auto inline-flex min-h-11 items-center gap-2 pt-4 font-semibold underline-offset-4 hover:underline">
              {t(`items.${key}.action`)}
              <ArrowRight aria-hidden="true" className="size-4 shrink-0 transition-transform duration-300 ease-spring group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  )
}
