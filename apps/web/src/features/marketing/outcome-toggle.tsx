import { cn } from 'cn'
import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { outcomeKeys, type OutcomeKey } from './example-rental'

type OutcomeToggleProps = {
  value: OutcomeKey
  onChange: (value: OutcomeKey) => void
  className?: string
}

// Two pressed-or-not buttons on frosted glass, over a photograph or on the dark band.
export function OutcomeToggle({ value, onChange, className }: OutcomeToggleProps) {
  const t = useTranslations('evidence')

  return (
    <div
      role="group"
      aria-label={t('outcome')}
      className={cn('flex gap-1 rounded-full bg-photo-scrim p-1 shadow-raised ring-1 ring-photo-foreground/15 backdrop-blur-md', className)}
    >
      {outcomeKeys.map((key) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => {
            onChange(key)
          }}
          className="figures inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-2.5 text-center text-sm leading-tight font-medium text-photo-foreground transition-[background-color,color] duration-300 ease-swift hover:bg-photo-foreground/12 aria-pressed:bg-photo-foreground aria-pressed:text-photo sm:px-4 sm:whitespace-nowrap"
        >
          {value === key ? <Check aria-hidden="true" className="size-4 shrink-0 animate-pop" /> : null}
          {t(key)}
        </button>
      ))}
    </div>
  )
}
