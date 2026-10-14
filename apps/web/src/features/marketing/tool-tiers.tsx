import { cn } from 'cn'
import { CircleCheck, CircleX } from 'lucide-react'
import { useTranslations } from 'next-intl'

// The gateway's tiers from docs/extensions.md section 4.4. The last row is the tier that does not exist.
const tierKeys = ['read', 'draft', 'propose', 'notify', 'mandate', 'charge'] as const

export function ToolTiers() {
  const t = useTranslations('pages.ai.agents')

  return (
    <figure className="border bg-card">
      <figcaption className="label border-b px-4 py-3 text-xs text-muted-foreground md:px-6">{t('caption')}</figcaption>
      <ul role="list" className="px-4 md:px-6">
        {tierKeys.map((key) => {
          const missing = key === 'charge'
          const Icon = missing ? CircleX : CircleCheck
          return (
            <li key={key} className="flex gap-3 border-b py-3.5 last:border-b-0">
              <Icon aria-hidden="true" className={cn('mt-1 size-5 shrink-0', missing ? 'text-destructive' : 'text-success')} />
              <div className="min-w-0">
                <p className={cn('text-[1.0625rem] font-bold', missing && 'line-through decoration-destructive decoration-2')}>{t(`tiers.${key}.name`)}</p>
                <p className={cn('mt-0.5', missing ? 'font-medium' : 'text-muted-foreground')}>{t(`tiers.${key}.body`)}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </figure>
  )
}
