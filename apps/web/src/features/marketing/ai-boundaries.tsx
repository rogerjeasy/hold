import { cn } from 'cn'
import { CircleCheck, CircleX } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { MarkedList } from './marked-list'
import { Section, SectionHeading } from './section'

const doesKeys = ['checks', 'compares', 'classifies', 'matches'] as const
const neverKeys = ['charge', 'price', 'doubt', 'status'] as const

// On the home page the section carries its own headline. On the AI page the page headline already says it.
export function AiBoundaries({ hiddenHeading }: { hiddenHeading?: string }) {
  const t = useTranslations('ai')

  return (
    <Section tone="band">
      {hiddenHeading === undefined ? (
        <SectionHeading title={t('title')} lead={t('lead')} tone="band" />
      ) : (
        <h2 className="sr-only">{hiddenHeading}</h2>
      )}
      <div className={cn('grid gap-10 md:grid-cols-2 md:gap-12', hiddenHeading === undefined && 'mt-10 md:mt-14')}>
        <MarkedList title={t('does.title')} items={doesKeys.map((key) => t(`does.items.${key}`))} icon={CircleCheck} tone="band" />
        <MarkedList title={t('never.title')} items={neverKeys.map((key) => t(`never.items.${key}`))} icon={CircleX} accent tone="band" />
      </div>
    </Section>
  )
}
