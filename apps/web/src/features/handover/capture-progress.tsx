import { Camera } from 'lucide-react'
import { useTranslations } from 'next-intl'

// How far a capture has come: the views photographed out of those planned, as words and as a bar.
export function CaptureProgress({ done, total }: { done: number; total: number }) {
  const t = useTranslations('shop.handover')
  const share = total === 0 ? 0 : Math.min(1, done / total)
  return (
    <div className="flex min-w-0 items-center gap-3.5">
      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Camera className="size-4.5" />
      </span>
      <div className="grid min-w-0 flex-1 gap-2">
        <p className="text-sm font-semibold">{t('progress', { done, total })}</p>
        <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full origin-left rounded-full bg-primary transition-transform duration-500 ease-spring" style={{ transform: `scaleX(${String(share)})` }} />
        </div>
      </div>
    </div>
  )
}
