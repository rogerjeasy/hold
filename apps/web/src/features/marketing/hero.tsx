import { useTranslations } from 'next-intl'
import { AudienceDoors } from './audience-doors'
import { EvidenceViewer } from './evidence-viewer'
import { HeroFilm } from './hero-film'

// The first thing anyone sees: a dark stage where a bike and a scooter are scanned and a chip in the paint is found,
// with the claim and the two ways in over it; then the photograph that proves it. The words arrive one after another.
export function Hero() {
  const t = useTranslations('hero')

  return (
    <section className="relative isolate">
      <div className="px-2 pt-2 md:px-3 md:pt-3">
        <div className="relative isolate flex min-h-[calc(100dvh-4.25rem)] overflow-clip rounded-[1.75rem] bg-band text-band-foreground shadow-raised ring-1 ring-band-border/70 lg:min-h-[min(52rem,calc(100dvh-5.5rem))] lg:rounded-[2rem]">
          <HeroFilm />
          <div className="mx-auto flex w-full max-w-page flex-col justify-end px-4 pt-[min(calc((100vw-1rem)*0.8),30rem)] pb-20 md:px-8 lg:justify-center lg:px-10 lg:py-24">
            <div className="max-w-2xl min-w-0 lg:max-w-[31rem] xl:max-w-[36rem] 2xl:max-w-[40rem]">
              <p className="label inline-flex max-w-full animate-rise items-center gap-2 rounded-full bg-band-foreground/10 px-3 py-1.5 text-xs text-band-foreground/85 ring-1 ring-band-foreground/15 backdrop-blur-md">
                <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-band-accent" />
                <span className="min-w-0 wrap-long-words">{t('eyebrow')}</span>
              </p>
              <h1 className="mt-5 animate-rise text-display text-band-foreground wrap-long-words [animation-delay:80ms]">{t('title')}</h1>
              <p className="mt-6 max-w-prose animate-rise text-lead text-pretty text-band-foreground/80 [animation-delay:160ms]">{t('lead')}</p>
              <AudienceDoors tone="stage" className="mt-8 max-w-xl animate-rise [animation-delay:240ms]" />
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-page px-4 pb-6 md:px-8 lg:px-10">
        <EvidenceViewer className="mt-6 animate-rise [animation-delay:320ms] md:mt-10 lg:mt-12" />
      </div>
    </section>
  )
}
