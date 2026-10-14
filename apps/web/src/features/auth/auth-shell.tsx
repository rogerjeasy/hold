import type { ReactNode } from 'react'
import { Link } from '@/i18n/navigation'
import type { RoutePath } from '@/lib/routes'
import { AccountNotes } from './account-notes'

type AuthShellProps = {
  title: string
  lead: string
  form: ReactNode
  // The way to the other page: a question and the link that answers it.
  other: { question: string; action: string; href: RoutePath }
  // What sits on the dark half: what signing in, or signing up, leads to.
  // The title's id lets what follows be named by it.
  aside: { title: string; titleId?: string; lead?: string; children: ReactNode }
}

// The frame both pages share. The form comes first on every screen. The dark half follows below it on a phone.
export function AuthShell({ title, lead, form, other, aside }: AuthShellProps) {
  return (
    <div className="grid lg:min-h-[calc(100dvh-4.5rem)] lg:grid-cols-2">
      <div className="mx-auto w-full max-w-half-page px-4 pt-9 pb-14 md:px-8 md:pt-14 lg:mr-0 lg:py-20 lg:pr-16 lg:pl-10">
        <div className="max-w-md">
          <h1 className="text-headline text-balance wrap-long-words">{title}</h1>
          <p className="mt-5 text-lead text-muted-foreground wrap-long-words">{lead}</p>
          <div className="mt-8">{form}</div>
          <p className="mt-6 flex flex-wrap items-center gap-x-2">
            <span className="text-muted-foreground">{other.question}</span>
            <Link href={other.href} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
              {other.action}
            </Link>
          </p>
          <div className="mt-8">
            <AccountNotes />
          </div>
        </div>
      </div>
      <aside className="bg-band text-band-foreground">
        <div className="mx-auto w-full max-w-half-page px-4 py-14 md:px-8 lg:ml-0 lg:py-20 lg:pr-10 lg:pl-16">
          <h2 id={aside.titleId} className="text-title text-balance wrap-long-words">
            {aside.title}
          </h2>
          {aside.lead === undefined ? null : <p className="mt-4 max-w-prose text-lead text-band-muted">{aside.lead}</p>}
          {aside.children === null ? null : <div className="mt-8">{aside.children}</div>}
        </div>
      </aside>
    </div>
  )
}
