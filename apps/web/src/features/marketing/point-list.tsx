import { cn } from 'cn'
import { Check } from 'lucide-react'

export function PointList({ points, className }: { points: readonly string[]; className?: string }) {
  return (
    <ul className={cn('grid gap-3.5', className)}>
      {points.map((point) => (
        <li key={point} className="flex gap-3">
          <span aria-hidden="true" className="mt-0.5 grid size-5.5 shrink-0 place-items-center rounded-full bg-success/12 text-success">
            <Check className="size-3.5" strokeWidth={3} />
          </span>
          <span className="min-w-0">{point}</span>
        </li>
      ))}
    </ul>
  )
}
