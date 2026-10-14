import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Section } from './section'

export type FaqKey = keyof IntlMessages['faq']['items']

type FaqProps = {
  title: string
  lead: string
  questions: readonly FaqKey[]
}

// Questions open in place. The browser's own disclosure element works by keyboard and without scripts.
export function Faq({ title, lead, questions }: FaqProps) {
  const t = useTranslations('faq.items')

  return (
    <Section>
      <div className="grid gap-10 lg:grid-cols-[5fr_7fr] lg:gap-16">
        <div className="min-w-0">
          <h2 className="text-headline text-balance wrap-long-words">{title}</h2>
          <p className="mt-6 max-w-prose text-lead text-muted-foreground">{lead}</p>
        </div>
        <div className="min-w-0 border-t border-t-foreground">
          {questions.map((key) => (
            <details key={key} className="group border-b">
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-3 [&::-webkit-details-marker]:hidden">
                <h3 className="text-xl leading-tight font-bold tracking-tight wrap-long-words">{t(`${key}.q`)}</h3>
                <Plus aria-hidden="true" className="size-5 shrink-0 text-primary transition-transform group-open:rotate-45" />
              </summary>
              <p className="max-w-prose pb-6 text-muted-foreground">{t(`${key}.a`)}</p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  )
}
