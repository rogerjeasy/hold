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

// Who does a step, as a pill with words: code quietly, the model in the accent, the person solid.
const actorClasses = {
  code: 'bg-muted text-muted-foreground',
  model: 'bg-primary/10 text-primary',
  person: 'bg-primary text-primary-foreground',
} as const

const nodeClasses = {
  code: 'border-border-strong bg-card',
  model: 'border-primary bg-card',
  person: 'border-primary bg-primary',
} as const

// The path from a photograph to a decision, down one thread. The model's step and the person's step are set apart.
export function ComparisonPipeline() {
  const t = useTranslations('pages.ai.pipeline')

  return (
    <ol role="list" className="surface overflow-clip">
      {steps.map(({ key, actor }, index) => (
        <li
          key={key}
          className={cn(
            'relative grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-4 border-t border-border/70 px-5 py-5 first:border-t-0 md:grid-cols-[1.25rem_9rem_minmax(0,1fr)_minmax(0,1.6fr)] md:items-start md:gap-x-6 md:px-7',
            actor === 'model' && 'bg-primary/4',
            actor === 'person' && 'bg-primary/8',
          )}
        >
          {/* The thread runs through every node but stops at the last. */}
          {index < steps.length - 1 ? (
            <span aria-hidden="true" className="absolute top-10 -bottom-6.5 left-[calc(1.25rem+0.625rem-0.5px)] border-l border-border-strong md:left-[calc(1.75rem+0.625rem-0.5px)]" />
          ) : null}
          <span aria-hidden="true" className={cn('relative mt-1.5 size-3 justify-self-center rounded-full border-2', nodeClasses[actor])} />
          <span className={cn('label justify-self-start rounded-full px-2.5 py-0.5 text-xs', actorClasses[actor])}>{t(`actors.${actor}`)}</span>
          <h3 className="col-start-2 mt-2 text-xl leading-tight font-bold tracking-tight wrap-long-words md:col-start-auto md:mt-0">{t(`steps.${key}.title`)}</h3>
          <p className={cn('col-start-2 mt-1.5 md:col-start-auto md:mt-0', actor === 'code' && 'text-muted-foreground')}>{t(`steps.${key}.body`)}</p>
        </li>
      ))}
    </ol>
  )
}
