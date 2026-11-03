import { cn } from 'cn'
import { ArrowRight } from 'lucide-react'
import Image from 'next/image'
import { useId } from 'react'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import type { RoutePath } from '@/lib/routes'
import { PointList } from './point-list'

export type AudiencePanelProps = {
  label: string
  title: string
  points: readonly string[]
  action: { href: RoutePath; label: string }
  image: { src: string; alt: string }
  emphasis: 'primary' | 'contrast'
}

// One side of a rental on one card: their photograph, what Hold does for them, and the way to their page.
export function AudiencePanel({ label, title, points, action, image, emphasis }: AudiencePanelProps) {
  const labelId = useId()

  return (
    <section aria-labelledby={labelId} className="group surface flex flex-col overflow-clip transition-shadow duration-500 ease-spring hover:shadow-raised">
      <div className="relative aspect-video overflow-hidden bg-photo">
        <Image
          src={image.src}
          alt={image.alt}
          fill
          sizes="(min-width: 80rem) 39rem, (min-width: 48rem) 50vw, 100vw"
          className="object-cover transition-transform duration-700 ease-spring group-hover:scale-[1.03]"
        />
        <span
          id={labelId}
          className={cn(
            'label absolute top-4 left-4 rounded-full px-3 py-1 text-xs shadow-raised',
            emphasis === 'primary' ? 'bg-primary text-primary-foreground' : 'bg-contrast text-contrast-foreground',
          )}
        >
          {label}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-5 px-5 py-7 md:p-8">
        <h2 className="text-title text-balance wrap-long-words">{title}</h2>
        <PointList points={points} />
        <Button asChild variant={emphasis === 'primary' ? 'default' : 'contrast'} className="group/action mt-auto self-start">
          <Link href={action.href}>
            {action.label}
            <ArrowRight aria-hidden="true" className="transition-transform duration-300 ease-spring group-hover/action:translate-x-0.5" />
          </Link>
        </Button>
      </div>
    </section>
  )
}
