import { cn } from 'cn'
import { ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { routes } from '@/lib/routes'

const doors = [
  { key: 'shops', href: routes.forShops, surface: 'bg-primary text-primary-foreground shadow-glow', disc: 'bg-primary-foreground/15' },
  { key: 'renters', href: routes.forRenters, surface: 'bg-contrast text-contrast-foreground shadow-raised', disc: 'bg-contrast-foreground/12' },
] as const

// Two doors, one for each side of a rental. Each is a whole card to press, and lifts a little under the pointer.
export function AudienceDoors({ className }: { className?: string }) {
  const t = useTranslations('doors')

  return (
    <div className={cn('grid gap-3 sm:grid-cols-2', className)}>
      {doors.map((door) => (
        <Link
          key={door.key}
          href={door.href}
          className={cn(
            'group flex min-h-22 flex-col justify-between gap-4 rounded-2xl p-4 transition-[transform,box-shadow] duration-300 ease-spring hover:-translate-y-0.5 active:translate-y-0 sm:min-h-28',
            door.surface,
          )}
        >
          <span className="label text-xs">{t(`${door.key}.label`)}</span>{' '}
          <span className="flex items-end justify-between gap-3 text-[1.0625rem] leading-tight font-semibold">
            <span className="min-w-0 wrap-long-words">{t(`${door.key}.action`)}</span>
            <span aria-hidden="true" className={cn('grid size-8 shrink-0 place-items-center rounded-full transition-transform duration-300 ease-spring group-hover:translate-x-0.5', door.disc)}>
              <ArrowRight className="size-4" />
            </span>
          </span>
        </Link>
      ))}
    </div>
  )
}
