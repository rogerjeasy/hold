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

export function AudiencePanel({ label, title, points, action, image, emphasis }: AudiencePanelProps) {
  const labelId = useId()

  return (
    <section
      aria-labelledby={labelId}
      className={cn('flex flex-col overflow-hidden border border-t-[3px] bg-card', emphasis === 'primary' ? 'border-t-primary' : 'border-t-contrast')}
    >
      <div className="relative aspect-video bg-photo">
        <Image src={image.src} alt={image.alt} fill sizes="(min-width: 80rem) 39rem, (min-width: 48rem) 50vw, 100vw" className="object-cover" />
      </div>
      <div className="flex flex-1 flex-col gap-5 px-4 py-6 md:p-8">
        <p id={labelId} className="label text-muted-foreground">
          {label}
        </p>
        <h2 className="text-title text-balance wrap-long-words">{title}</h2>
        <PointList points={points} />
        <Button asChild variant={emphasis === 'primary' ? 'default' : 'contrast'} className="mt-auto self-start">
          <Link href={action.href}>
            {action.label}
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  )
}
