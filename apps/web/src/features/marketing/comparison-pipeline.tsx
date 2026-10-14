import { cn } from 'cn'
import { useTranslations } from 'next-intl'

// The seven steps of docs/tech-stack.md section 6.1, and who carries each one out.
const steps = [
  { key: 'quality', actor: 'code' },
  { key: 'normalize', actor: 'code' },
  { key: 'align', actor: 'code' },
  { key: 'regions', actor: 'code' },
  { key: 'judge', actor: 'model' },
  { key: 'price', actor: 'code' },
  { key: 'decide', actor: 'person' },
] as const

const rowClasses = {
  code: 'border-b',
  model: 'border-b bg-card',
  person: 'bg-primary text-primary-foreground',
} as const

// The path from a photograph to a decision, one row a step. The model's row and the person's row are set apart.
export function ComparisonPipeline() {
  const t = useTranslations('pages.ai.pipeline')

  return (
    <ol role="list" className="border-t border-t-foreground">
      {steps.map(({ key, actor }, index) => (
        <li
          key={key}
          className={cn(
            'grid gap-x-8 gap-y-1 px-4 py-4 md:grid-cols-[2.5rem_11rem_minmax(0,1fr)_minmax(0,2fr)] md:items-baseline md:py-5 lg:px-6',
            rowClasses[actor],
          )}
        >
          <span aria-hidden="true" className={cn('figures text-sm', actor !== 'person' && 'text-muted-foreground')}>
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className={cn('label text-[0.8125rem]', actor === 'code' && 'text-muted-foreground', actor === 'model' && 'text-primary')}>
            {t(`actors.${actor}`)}
          </span>
          <h3 className="text-xl leading-tight font-bold tracking-tight wrap-long-words">{t(`steps.${key}.title`)}</h3>
          <p className={cn(actor === 'code' && 'text-muted-foreground')}>{t(`steps.${key}.body`)}</p>
        </li>
      ))}
    </ol>
  )
}
