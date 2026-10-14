import { cn } from 'cn'
import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { outcomeKeys, type OutcomeKey } from './example-rental'

type OutcomeToggleProps = {
  value: OutcomeKey
  onChange: (value: OutcomeKey) => void
  className?: string
}

export function OutcomeToggle({ value, onChange, className }: OutcomeToggleProps) {
  const t = useTranslations('evidence')

  return (
    <div role="group" aria-label={t('outcome')} className={cn('flex gap-0.5 bg-photo-scrim p-0.75', className)}>
      {outcomeKeys.map((key) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => {
            onChange(key)
          }}
          className="figures inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 px-3 text-center text-sm leading-tight font-medium text-photo-foreground aria-pressed:bg-photo-foreground aria-pressed:text-photo sm:whitespace-nowrap"
        >
          {value === key ? <Check aria-hidden="true" className="size-4 shrink-0" /> : null}
          {t(key)}
        </button>
      ))}
    </div>
  )
}
