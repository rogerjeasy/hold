import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { IntroBackdrop } from '@/features/marketing/intro-backdrop'

// The shared frame for the not-found and failure pages: one headline, one sentence, one way out, centred and calm.
export function StatusView({ icon: Icon, title, body, children }: { icon: LucideIcon; title: string; body: string; children: ReactNode }) {
  return (
    <section className="relative isolate">
      <IntroBackdrop />
      <div className="mx-auto flex min-h-[64dvh] max-w-3xl flex-col items-center justify-center px-4 py-16 text-center md:px-8 md:py-24">
        <span aria-hidden="true" className="grid size-14 animate-pop place-items-center rounded-2xl border bg-card text-primary shadow-raised">
          <Icon className="size-6" />
        </span>
        <h1 className="mt-8 animate-rise text-headline text-balance wrap-long-words">{title}</h1>
        <p className="mt-5 max-w-prose animate-rise text-lead text-muted-foreground [animation-delay:100ms]">{body}</p>
        <div className="mt-8 animate-rise [animation-delay:180ms]">{children}</div>
      </div>
    </section>
  )
}
