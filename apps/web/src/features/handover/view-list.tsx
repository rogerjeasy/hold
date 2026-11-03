import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from 'cn'

type ListedView = { readonly key: string; readonly label: string; readonly required: boolean; readonly done: boolean }

// The plan's views in the order the camera asks for them, each marked done, needed or optional in words. Choosing one
// opens it. On a phone they follow the camera, which comes first at the counter; from lg, a list beside it.
export function ViewList({ views, current, onChoose }: { views: readonly ListedView[]; current: string; onChoose: (key: string) => void }) {
  const t = useTranslations('shop.handover.views')
  return (
    <ol aria-label={t('label')} className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
      {views.map((view, index) => {
        const chosen = view.key === current
        return (
          <li key={view.key} className="min-w-0">
            <button
              type="button"
              aria-current={chosen ? 'step' : undefined}
              onClick={() => {
                onChoose(view.key)
              }}
              className={cn(
                'flex min-h-12 w-full min-w-0 items-center gap-3 rounded-xl border px-3 py-2 text-left transition-[background-color,border-color,box-shadow] duration-200 ease-swift',
                chosen ? 'border-primary bg-primary/6 ring-3 ring-primary/15' : 'border-border/70 bg-card hover:border-border-strong',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold',
                  view.done ? 'bg-success text-background' : chosen ? 'border-2 border-primary text-primary' : 'border-2 border-dashed border-border-strong text-muted-foreground',
                )}
              >
                {view.done ? <Check className="size-3.5 stroke-3" /> : index + 1}
              </span>
              <span className="grid min-w-0 flex-1">
                <span className="font-semibold wrap-long-words">{view.label}</span>
                <span className={cn('text-[0.8125rem]', view.done ? 'text-success' : view.required ? 'text-foreground/70' : 'text-muted-foreground')}>{view.done ? t('done') : view.required ? t('needed') : t('optional')}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
