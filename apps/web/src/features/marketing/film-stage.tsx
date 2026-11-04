import { cn } from 'cn'
import type { ReactNode } from 'react'
import type { FilmChapter } from './film-chapters'
import type { Film } from './films'
import { HeroFilm } from './hero-film'

// A dark stage across the full width at the top of a public page, in either theme, with a film behind its words. Below lg the
// film is a window at the top and the words follow it; from lg the words sit to its left. A film told in chapters
// leaves room for their rail.
export function FilmStage({ film, chapters, children }: { film: Film; chapters?: readonly FilmChapter[]; children: ReactNode }) {
  return (
    <div className="relative isolate flex min-h-[calc(100dvh-3.75rem)] overflow-clip bg-band text-band-foreground lg:min-h-[min(52rem,calc(100dvh-4.5rem))]">
      <HeroFilm film={film} chapters={chapters} />
      <div
        className={cn(
          'mx-auto flex w-full max-w-page flex-col justify-end px-4 md:px-8 lg:justify-center lg:px-10',
          chapters === undefined ? 'pt-[min(80vw,30rem)] pb-20 lg:py-24' : 'pt-[min(80vw,30rem)] pb-24 sm:pb-28 lg:pt-24 lg:pb-36',
        )}
      >
        {children}
      </div>
    </div>
  )
}

// The words on a stage: who it is for, the claim, the lead, and what follows them.
export function StageCopy({ eyebrow, title, lead, size = 'display', children }: { eyebrow: string; title: string; lead: string; size?: 'display' | 'headline'; children?: ReactNode }) {
  return (
    // A headline-sized stage has a short lead, so its words keep to a narrower column and leave the film more room.
    <div className={cn('max-w-2xl min-w-0', size === 'display' ? 'lg:max-w-[31rem] xl:max-w-[36rem] 2xl:max-w-[40rem]' : 'lg:max-w-[26rem] xl:max-w-[28rem]')}>
      <p className="label inline-flex max-w-full animate-rise items-center gap-2 rounded-full bg-band-foreground/10 px-3 py-1.5 text-xs text-band-foreground/85 ring-1 ring-band-foreground/15 backdrop-blur-md">
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-band-accent" />
        <span className="min-w-0 wrap-long-words">{eyebrow}</span>
      </p>
      <h1 className={cn('mt-5 animate-rise text-band-foreground wrap-long-words [animation-delay:80ms]', size === 'display' ? 'text-display' : 'text-headline text-balance')}>{title}</h1>
      <p className="mt-6 max-w-prose animate-rise text-lead text-pretty text-band-foreground/80 [animation-delay:160ms]">{lead}</p>
      {children}
    </div>
  )
}
