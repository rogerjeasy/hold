import { cn } from 'cn'
import type { ComponentProps, ReactNode } from 'react'
import motion from '@/features/site/motion.module.css'

export type Tone = 'page' | 'band'

// Sections are set apart by space, not rules. The dark band is the one change of ground.
export function Section({ tone = 'page', className, children, ...props }: ComponentProps<'section'> & { tone?: Tone }) {
  return (
    <section className={cn(tone === 'band' && 'relative overflow-clip bg-band text-band-foreground', className)} {...props}>
      {tone === 'band' ? (
        // A faint grid of dots in the band's own ink, fading out towards the bottom.
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(color-mix(in_oklab,var(--band-foreground)_10%,transparent)_1px,transparent_1px)] [mask-image:linear-gradient(to_bottom,black,transparent_70%)] bg-size-[18px_18px]"
        />
      ) : null}
      <div className="relative mx-auto max-w-page px-4 py-16 md:px-8 md:py-22 lg:px-10 lg:py-28">{children}</div>
    </section>
  )
}

type SectionHeadingProps = {
  id?: string
  title: string
  lead: string
  tone?: Tone
}

export function SectionHeading({ id, title, lead, tone = 'page' }: SectionHeadingProps) {
  return (
    <div className={cn('grid gap-6 lg:grid-cols-[7fr_5fr] lg:items-end lg:gap-12', motion.reveal)}>
      <h2 id={id} className="text-headline text-balance wrap-long-words">
        {title}
      </h2>
      <p className={cn('max-w-prose text-lead', tone === 'band' ? 'text-band-muted' : 'text-muted-foreground')}>{lead}</p>
    </div>
  )
}

type TitledSectionProps = {
  title: string
  lead: string
  tone?: Tone
  children: ReactNode
}

// A section that opens with a visible headline and lead.
export function TitledSection({ title, lead, tone = 'page', children }: TitledSectionProps) {
  return (
    <Section tone={tone}>
      <SectionHeading title={title} lead={lead} tone={tone} />
      <div className={cn('mt-10 md:mt-14', motion.reveal)}>{children}</div>
    </Section>
  )
}

// A section whose headline the page already shows. The heading stays for readers who navigate by headings.
export function UntitledSection({ hiddenTitle, children }: { hiddenTitle: string; children: ReactNode }) {
  return (
    <Section>
      <h2 className="sr-only">{hiddenTitle}</h2>
      {children}
    </Section>
  )
}

type SplitSectionProps = {
  title: string
  lead: string
  // What sits beside the words: an illustration, a list or a table.
  aside: ReactNode
  // Puts the aside first on wide screens, so two split sections in a row do not line up.
  asideFirst?: boolean
  children?: ReactNode
}

// A section with the words on one side and something to look at on the other. The words stay in view beside a tall
// illustration on wide screens.
export function SplitSection({ title, lead, aside, asideFirst = false, children }: SplitSectionProps) {
  return (
    <Section>
      <div className="grid gap-10 lg:grid-cols-2 lg:items-start lg:gap-16">
        <div className={cn('min-w-0 lg:sticky lg:top-28', motion.reveal, asideFirst && 'lg:order-last')}>
          <h2 className="text-headline text-balance wrap-long-words">{title}</h2>
          <p className="mt-6 max-w-prose text-lead text-muted-foreground">{lead}</p>
          {children ? <div className="mt-8">{children}</div> : null}
        </div>
        <div className={cn('min-w-0', motion.reveal)}>{aside}</div>
      </div>
    </Section>
  )
}
