import { ArrowRight } from 'lucide-react'
import Image from 'next/image'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import type { RoutePath } from '@/lib/routes'
import { IntroBackdrop } from './intro-backdrop'

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

// The opening of every page the header leads to: the headline, a lead, and what the page shows first.
// Each part arrives a moment after the one before it.
export function PageIntro({ title, lead, action, secondaryAction, image, children }: PageIntroProps) {
  return (
    <section className="relative isolate">
      <IntroBackdrop />
      <div className="mx-auto max-w-page px-4 pt-12 pb-4 md:px-8 md:pt-18 md:pb-6 lg:px-10 lg:pt-22 lg:pb-8">
        <div className="grid gap-6 lg:grid-cols-[7fr_5fr] lg:items-end lg:gap-12">
          <h1 className="animate-rise text-headline text-balance wrap-long-words">{title}</h1>
          <div className="animate-rise [animation-delay:120ms]">
            <p className="max-w-prose text-lead text-muted-foreground">{lead}</p>
            {action ? (
              <div className="mt-7 flex flex-wrap gap-2.5">
                <Button asChild className="group min-h-12 px-5">
                  <Link href={action.href}>
                    {action.label}
                    <ArrowRight aria-hidden="true" className="transition-transform duration-300 ease-spring group-hover:translate-x-0.5" />
                  </Link>
                </Button>
                {secondaryAction ? (
                  <Button asChild variant="outline" className="min-h-12 px-5">
                    <Link href={secondaryAction.href}>{secondaryAction.label}</Link>
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        {image ? (
          <div className="relative mt-10 aspect-video animate-rise overflow-hidden rounded-2xl bg-photo shadow-overlay ring-1 ring-foreground/10 [animation-delay:220ms] md:mt-14 md:aspect-evidence md:rounded-3xl">
            <Image src={image.src} alt={image.alt} fill preload sizes="(min-width: 80rem) 75rem, 100vw" className="object-cover" />
            <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-photo-foreground/10 ring-inset" />
          </div>
        ) : null}
        {children ? <div className="mt-10 animate-rise [animation-delay:220ms] md:mt-14">{children}</div> : null}
      </div>
    </section>
  )
}
