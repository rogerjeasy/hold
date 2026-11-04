'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState, type RefObject } from 'react'

export type FilmChapter = { readonly key: string; readonly start: number; readonly title: string; readonly who: string }

// Which chapter a moment of the film falls in, and how far through it.
function placeIn(chapters: readonly FilmChapter[], length: number, now: number) {
  let index = 0
  chapters.forEach((chapter, at) => { if (chapter.start <= now) index = at })
  return chapters.map((chapter, at) => {
    const end = chapters[at + 1]?.start ?? length
    return { current: at === index, progress: at < index ? 1 : at > index ? 0 : Math.min(1, Math.max(0, (now - chapter.start) / (end - chapter.start))) }
  })
}

// Under the film, one line for each moment: its name, who acts in it, and a thread that fills as it plays. Choosing
// one plays the film from there. The threads are drawn from the film's own clock each frame, without a render.
export function FilmChapters({ video, chapters, onSeek }: { video: RefObject<HTMLVideoElement | null>; chapters: readonly FilmChapter[]; onSeek: (seconds: number) => void }) {
  const t = useTranslations('hero.film')
  const rail = useRef<HTMLOListElement>(null)
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    let frame = 0
    const draw = () => {
      const film = video.current
      const list = rail.current
      if (film !== null && list !== null && Number.isFinite(film.duration) && film.duration > 0) {
        const places = placeIn(chapters, film.duration, film.currentTime)
        places.forEach((place, at) => {
          const item = list.children.item(at)
          if (item instanceof HTMLElement) item.style.setProperty('--progress', place.progress.toFixed(4))
        })
        setCurrent(places.findIndex((place) => place.current))
      }
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(frame) }
  }, [video, chapters])

  return (
    <ol ref={rail} style={{ gridTemplateColumns: `repeat(${String(chapters.length)}, minmax(0, 1fr))` }} className="absolute inset-x-0 bottom-0 z-10 mx-auto grid max-w-page gap-2 px-4 pb-4 sm:gap-4 md:px-8 md:pb-6 lg:px-10 lg:pb-8">
      {chapters.map((chapter, at) => (
        <li key={chapter.key} className="min-w-0">
          <button
            type="button"
            aria-label={t('playFrom', { step: chapter.title })}
            aria-current={at === current ? 'step' : undefined}
            onClick={() => { onSeek(chapter.start) }}
            className="group grid min-h-11 w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5 rounded-lg pt-3 pb-1 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-band-accent"
          >
            <span aria-hidden="true" className="relative h-0.5 overflow-hidden rounded-full bg-band-foreground/15">
              <span className="absolute inset-0 origin-left bg-band-accent [transform:scaleX(var(--progress,0))]" />
            </span>
            <span className="truncate text-xs font-semibold sm:text-sm text-band-foreground/55 transition-colors group-hover:text-band-foreground/85 group-aria-[current=step]:text-band-foreground">{chapter.title}</span>
            <span className="hidden truncate text-xs text-band-foreground/45 transition-colors group-aria-[current=step]:text-band-foreground/70 sm:block">{chapter.who}</span>
          </button>
        </li>
      ))}
    </ol>
  )
}
