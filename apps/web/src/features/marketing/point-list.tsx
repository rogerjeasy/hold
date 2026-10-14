import { cn } from 'cn'
import { CircleCheck } from 'lucide-react'

export function PointList({ points, className }: { points: readonly string[]; className?: string }) {
  return (
    <ul className={className}>
      {points.map((point) => (
        <li key={point} className={cn('flex gap-3 border-t py-3')}>
          <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" />
          {point}
        </li>
      ))}
    </ul>
  )
}
