import { cn } from 'cn'
import { ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { routes } from '@/lib/routes'
import type { Tone } from './section'

// The way from a page that mentions a contest to the advocates' recorded run.
export function AdvocatesPointer({ tone = 'page' }: { tone?: Tone }) {
  const t = useTranslations('advocatesBand')

  return (
    <Link
      href={routes.advocates}
      className={cn('group inline-flex min-h-11 items-center gap-2 justify-self-start font-semibold underline-offset-4 hover:underline', tone === 'band' && 'text-band-accent')}
    >
      {t('pointer')}
      <ArrowRight aria-hidden="true" className="size-4 shrink-0 transition-transform duration-300 ease-spring group-hover:translate-x-0.5" />
    </Link>
  )
}
