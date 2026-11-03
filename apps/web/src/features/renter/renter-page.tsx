import { cn } from 'cn'
import type { LucideIcon } from 'lucide-react'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { SampleTag } from '@/components/ui/sample-tag'
import { Link } from '@/i18n/navigation'

// The column every page a renter opens from their link sits in: phone-width first, and on a wide screen a calm column
// in the middle, the way a wallet app reads.
export function RenterPage({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto grid w-full max-w-2xl content-start gap-6 px-4 pt-6 pb-16 md:gap-8 md:px-8 md:pt-10', className)}>{children}</div>
}

// The head of a renter's page: the shop it is with, the page's one heading, and a line under it when it needs one.
export function RenterHead({ shopName, simulated = false, title, lead, children }: { shopName: string; simulated?: boolean; title: string; lead?: string | undefined; children?: ReactNode }) {
  return (
    <header className="grid min-w-0 animate-rise gap-3">
      <p className="label flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 wrap-long-words">{shopName}</span>
        {simulated ? <SampleTag /> : null}
      </p>
      <h1 className="text-page-title text-balance wrap-long-words">{title}</h1>
      {lead === undefined ? null : <p className="max-w-prose text-lead text-pretty text-muted-foreground">{lead}</p>}
      {children}
    </header>
  )
}

// The way back to the rental, quiet and always in the same place: under the page, never competing with its action.
export function BackLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} referrerPolicy="no-referrer" className="group inline-flex min-h-11 items-center gap-2 justify-self-start rounded-xl pr-2 font-semibold text-muted-foreground transition-colors hover:text-foreground">
      <ArrowLeft aria-hidden="true" className="size-4 transition-transform duration-200 ease-swift group-hover:-translate-x-0.5" />
      {children}
    </Link>
  )
}

// A page with one thing to say, such as a link that cannot be used: an icon, the heading, a sentence and the way on.
export function RenterNote({ icon: Icon, title, body, quiet = false, children }: { icon: LucideIcon; title: string; body: string; quiet?: boolean; children?: ReactNode }) {
  return (
    <RenterPage className="max-w-xl md:pt-16">
      <section className="surface relative isolate grid animate-rise justify-items-center gap-4 overflow-hidden px-6 py-10 text-center md:px-10 md:py-12">
        <div aria-hidden="true" className="absolute inset-0 -z-10 dot-grid mask-radial-from-0% mask-radial-to-70% opacity-60" />
        <span aria-hidden="true" className={cn('grid size-14 place-items-center rounded-2xl border bg-card shadow-card', quiet ? 'text-muted-foreground' : 'text-primary')}>
          <Icon className="size-6" />
        </span>
        <h1 className="text-title text-balance wrap-long-words">{title}</h1>
        <p className="max-w-prose text-pretty text-muted-foreground">{body}</p>
        {children}
      </section>
    </RenterPage>
  )
}
