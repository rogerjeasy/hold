import { cn } from 'cn'
import { ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { routes } from '@/lib/routes'

const doors = [
  { key: 'shops', href: routes.demo, surface: 'bg-primary text-primary-foreground' },
  { key: 'renters', href: routes.forRenters, surface: 'bg-contrast text-contrast-foreground' },
] as const

export function AudienceDoors({ className }: { className?: string }) {
  const t = useTranslations('doors')

  return (
    <div className={cn('grid gap-2.5 sm:grid-cols-2', className)}>
      {doors.map((door) => (
        <Link
          key={door.key}
          href={door.href}
          className={cn('group flex min-h-21 flex-col justify-between gap-4 rounded-lg p-3.5 sm:min-h-26', door.surface)}
        >
          <span className="label">{t(`${door.key}.label`)}</span>{' '}
          <span className="flex items-end justify-between gap-2 text-[1.0625rem] leading-tight font-semibold">
            {t(`${door.key}.action`)}
            <ArrowRight aria-hidden="true" className="size-4.5 shrink-0 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      ))}
    </div>
  )
}
