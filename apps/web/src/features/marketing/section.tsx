import { cn } from 'cn'
import type { ComponentProps, ReactNode } from 'react'

export type Tone = 'page' | 'band'

export function Section({ tone = 'page', className, children, ...props }: ComponentProps<'section'> & { tone?: Tone }) {
  return (
    <section className={cn('border-t', tone === 'band' && 'border-band bg-band text-band-foreground', className)} {...props}>
      <div className="mx-auto max-w-page px-4 py-14 md:px-8 md:py-18 lg:px-10 lg:py-24">{children}</div>
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
    <div className="grid gap-6 lg:grid-cols-[7fr_5fr] lg:items-end lg:gap-12">
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
      <div className="mt-10 md:mt-14">{children}</div>
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

// A section with the words on one side and something to look at on the other.
export function SplitSection({ title, lead, aside, asideFirst = false, children }: SplitSectionProps) {
  return (
    <Section>
      <div className="grid gap-10 lg:grid-cols-2 lg:items-start lg:gap-16">
        <div className={cn('min-w-0', asideFirst && 'lg:order-last')}>
          <h2 className="text-headline text-balance wrap-long-words">{title}</h2>
          <p className="mt-6 max-w-prose text-lead text-muted-foreground">{lead}</p>
          {children ? <div className="mt-8">{children}</div> : null}
        </div>
        <div className="min-w-0">{aside}</div>
      </div>
    </Section>
  )
}
