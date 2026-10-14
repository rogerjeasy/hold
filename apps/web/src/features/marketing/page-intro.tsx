import { ArrowRight } from 'lucide-react'
import Image from 'next/image'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import type { RoutePath } from '@/lib/routes'

type PageAction = { href: RoutePath; label: string }

type PageIntroProps = {
  title: string
  lead: string
  action?: PageAction
  secondaryAction?: PageAction
  image?: { src: string; alt: string }
  // Shown under the headline, inside the same opening block.
  children?: ReactNode
}

export function PageIntro({ title, lead, action, secondaryAction, image, children }: PageIntroProps) {
  return (
    <section>
      <div className="mx-auto max-w-page px-4 pt-9 pb-14 md:px-8 md:pt-14 md:pb-18 lg:px-10 lg:pt-16 lg:pb-24">
        <div className="grid gap-6 lg:grid-cols-[7fr_5fr] lg:items-end lg:gap-12">
          <h1 className="text-headline text-balance wrap-long-words">{title}</h1>
          <div>
            <p className="max-w-prose text-lead text-muted-foreground">{lead}</p>
            {action ? (
              <div className="mt-6 flex flex-wrap gap-2.5">
                <Button asChild>
                  <Link href={action.href}>
                    {action.label}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
                {secondaryAction ? (
                  <Button asChild variant="outline">
                    <Link href={secondaryAction.href}>{secondaryAction.label}</Link>
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        {image ? (
          <div className="relative -mx-4 mt-10 aspect-video overflow-hidden bg-photo md:-mx-8 md:mt-14 md:aspect-evidence lg:-mx-10">
            <Image src={image.src} alt={image.alt} fill preload sizes="(min-width: 80rem) 80rem, 100vw" className="object-cover" />
          </div>
        ) : null}
        {children ? <div className="mt-10 md:mt-14">{children}</div> : null}
      </div>
    </section>
  )
}
