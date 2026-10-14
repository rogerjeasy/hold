import type { ReactNode } from 'react'

// The shared frame for the not-found and failure pages: one headline, one sentence, one way out.
export function StatusView({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return (
    <section>
      <div className="mx-auto flex min-h-[60dvh] max-w-page flex-col justify-center px-4 py-14 md:px-8 md:py-18 lg:px-10 lg:py-24">
        <h1 className="text-headline text-balance wrap-long-words">{title}</h1>
        <p className="mt-6 max-w-prose text-lead text-muted-foreground">{body}</p>
        <div className="mt-6">{children}</div>
      </div>
    </section>
  )
}
