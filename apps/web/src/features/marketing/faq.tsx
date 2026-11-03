import { EVIDENCE_KEPT_DAYS } from '@hold/domain'
import { cn } from 'cn'
import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import motion from '@/features/site/motion.module.css'
import { Section } from './section'

export type FaqKey = keyof IntlMessages['faq']['items']

type FaqProps = {
  title: string
  lead: string
  questions: readonly FaqKey[]
}

// Questions open in place. An answer may state how long photographs are kept, read from the evidence bucket's period. The browser's own disclosure element works by keyboard and without scripts.
export function Faq({ title, lead, questions }: FaqProps) {
  const t = useTranslations('faq.items')

  return (
    <Section>
      <div className="grid gap-10 lg:grid-cols-[5fr_7fr] lg:gap-16">
        <div className={cn('min-w-0 lg:sticky lg:top-28 lg:self-start', motion.reveal)}>
          <h2 className="text-headline text-balance wrap-long-words">{title}</h2>
          <p className="mt-6 max-w-prose text-lead text-muted-foreground">{lead}</p>
        </div>
        <div className={cn('surface min-w-0 overflow-clip', motion.reveal)}>
          {questions.map((key) => (
            <details key={key} className="group border-t border-border/70 first:border-t-0">
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 transition-colors duration-200 hover:bg-muted/50 md:px-7 [&::-webkit-details-marker]:hidden">
                <h3 className="text-xl leading-tight font-bold tracking-tight wrap-long-words">{t(`${key}.q`)}</h3>
                <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary transition-[transform,background-color] duration-300 ease-spring group-open:rotate-45 group-open:bg-primary group-open:text-primary-foreground">
                  <Plus className="size-4" />
                </span>
              </summary>
              <p className="max-w-prose animate-fade px-5 pb-6 text-muted-foreground md:px-7">{t(`${key}.a`, { days: EVIDENCE_KEPT_DAYS })}</p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  )
}
