import { CircleCheck, CircleDashed } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from 'cn'

type ListedView = { readonly key: string; readonly label: string; readonly required: boolean; readonly done: boolean }

// The plan's views in the order the camera asks for them, each marked done, needed or optional. Choosing one opens it.
export function ViewList({ views, current, onChoose }: { views: readonly ListedView[]; current: string; onChoose: (key: string) => void }) {
  const t = useTranslations('shop.handover.views')
  return (
    <ol aria-label={t('label')} className="grid gap-1 sm:grid-cols-2 lg:grid-cols-1">
      {views.map((view) => {
        const Icon = view.done ? CircleCheck : CircleDashed
        return (
          <li key={view.key}>
            <button
              type="button"
              aria-current={view.key === current ? 'step' : undefined}
              onClick={() => {
                onChoose(view.key)
              }}
              className={cn('flex min-h-11 w-full min-w-0 items-center gap-2 border px-3 py-2 text-left', view.key === current ? 'border-primary bg-accent' : 'border-transparent hover:bg-accent')}
            >
              <Icon aria-hidden="true" className={cn('size-4.5 shrink-0', view.done ? 'text-primary' : 'text-muted-foreground')} />
              <span className="min-w-0 flex-1 font-semibold wrap-long-words">{view.label}</span>
              <span className="shrink-0 text-[0.8125rem] text-muted-foreground">{view.done ? t('done') : view.required ? t('needed') : t('optional')}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
