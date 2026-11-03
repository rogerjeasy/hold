import Image from 'next/image'
import type { ReactNode } from 'react'
import { IntroBackdrop } from '@/features/marketing/intro-backdrop'
import { Link } from '@/i18n/navigation'
import type { RoutePath } from '@/lib/routes'
import { AccountNotes } from './account-notes'

type AuthShellProps = {
  title: string
  lead: string
  form: ReactNode
  // A card of its own above the form, such as the demo shop's one-tap start.
  preface?: ReactNode
  // The way to the other page: a question and the link that answers it.
  other: { question: string; action: string; href: RoutePath }
  // What sits on the dark half: what signing in, or signing up, leads to.
  // The title's id lets what follows be named by it.
  aside: { title: string; titleId?: string; lead?: string; children: ReactNode }
}

// The frame the sign-in, sign-up and invitation pages share. The form comes first on every screen, on a calm card. On
// wide screens a photograph of a shop fills the other half, dimmed under the dark band; on a phone it follows below.
export function AuthShell({ title, lead, form, preface, other, aside }: AuthShellProps) {
  return (
    <div className="relative isolate grid lg:min-h-[calc(100dvh-4.5rem)] lg:grid-cols-2">
      <IntroBackdrop />
      <div className="flex justify-center px-4 pt-10 pb-14 md:px-8 md:pt-16 lg:py-16 lg:pr-10 lg:pl-10">
        <div className="w-full max-w-md min-w-0">
          <div className="animate-rise">
            <h1 className="text-headline text-balance wrap-long-words">{title}</h1>
            <p className="mt-5 text-lead text-muted-foreground wrap-long-words">{lead}</p>
          </div>
          {preface === undefined ? null : <div className="mt-8 animate-rise [animation-delay:100ms]">{preface}</div>}
          <div className="surface mt-6 animate-rise p-5 [animation-delay:160ms] md:p-7">{form}</div>
          <p className="mt-6 flex flex-wrap items-center justify-center gap-x-2 text-center">
            <span className="text-muted-foreground">{other.question}</span>
            <Link href={other.href} className="inline-flex min-h-11 items-center font-semibold underline decoration-primary/50 decoration-2 underline-offset-4 transition-colors hover:decoration-primary">
              {other.action}
            </Link>
          </p>
          <div className="mt-8">
            <AccountNotes />
          </div>
        </div>
      </div>
      <aside className="lg:p-4 lg:pl-0">
        <div className="relative isolate overflow-clip bg-band text-band-foreground lg:sticky lg:top-22 lg:min-h-[calc(100dvh-6.5rem)] lg:rounded-3xl lg:shadow-overlay">
          <div aria-hidden="true" className="absolute inset-0 -z-10">
            <Image src="/images/shop.jpg" alt="" fill sizes="(min-width: 64rem) 50vw, 100vw" className="object-cover opacity-60" />
          </div>
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-linear-to-b from-band/90 via-band/80 to-band/35" />
          <div className="mx-auto w-full max-w-half-page px-4 py-14 md:px-8 lg:px-12 lg:py-16">
            <h2 id={aside.titleId} className="text-title text-balance wrap-long-words">
              {aside.title}
            </h2>
            {aside.lead === undefined ? null : <p className="mt-4 max-w-prose text-lead text-band-muted">{aside.lead}</p>}
            {aside.children === null ? null : <div className="mt-8">{aside.children}</div>}
          </div>
        </div>
      </aside>
    </div>
  )
}
