'use client'

import { cn } from 'cn'
import { Pause, Play } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

// An original render: a city bike and an e-scooter on a dark floor, a sheet of light that scans them, and brackets
// that close on a chip in the paint while its finding rises. Twelve seconds that loop without a seam.
const FILM = { wide: '/video/hero-wide.mp4', tall: '/video/hero-tall.mp4' } as const
const STILL = { wide: '/images/hero/hero-wide-still.webp', tall: '/images/hero/hero-tall-still.webp' } as const
// Below lg the film is a window at the top of the stage, and gets the cut framed for it, the bike and the scooter
// near its top. The query matches the lg breakpoint, where the words move beside the film.
const TALL = '(max-width: 1023.98px)'
const LESS_MOTION = '(prefers-reduced-motion: reduce)'
const FINE_POINTER = '(pointer: fine)'

function useMediaQuery(query: string, onServer: boolean): boolean {
  const subscribe = useCallback((changed: () => void) => {
    const list = window.matchMedia(query)
    list.addEventListener('change', changed)
    return () => { list.removeEventListener('change', changed) }
  }, [query])
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => onServer)
}

// Behind the hero: the film, or for a person who asks for less motion one still frame of it, under the scrims that
// keep the words readable. The server sends the still, so the page paints at once; the film fades in over it once it
// plays. It plays only while it is on screen, and leans a little away from the pointer, so the stage reads as deep.
export function HeroFilm() {
  const t = useTranslations('hero.film')
  // Until the browser says otherwise the page assumes less motion, so nothing moves before it is allowed to.
  const lessMotion = useMediaQuery(LESS_MOTION, true)
  const finePointer = useMediaQuery(FINE_POINTER, false)
  const root = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const [showing, setShowing] = useState(false)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const film = video.current
    if (film === null || typeof IntersectionObserver === 'undefined') return
    const watcher = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting === true && !paused) void film.play().catch(() => undefined)
      else film.pause()
    })
    watcher.observe(film)
    return () => { watcher.disconnect() }
  }, [paused, lessMotion])

  useEffect(() => {
    const layer = root.current
    const stage = layer?.parentElement
    if (layer === null || stage === null || stage === undefined || lessMotion || !finePointer) return
    let frame = 0
    const lean = (event: PointerEvent) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const box = stage.getBoundingClientRect()
        layer.style.setProperty('--lean-x', ((event.clientX - box.left) / box.width - 0.5).toFixed(3))
        layer.style.setProperty('--lean-y', ((event.clientY - box.top) / box.height - 0.5).toFixed(3))
      })
    }
    const settle = () => {
      cancelAnimationFrame(frame)
      layer.style.setProperty('--lean-x', '0')
      layer.style.setProperty('--lean-y', '0')
    }
    stage.addEventListener('pointermove', lean)
    stage.addEventListener('pointerleave', settle)
    return () => {
      cancelAnimationFrame(frame)
      stage.removeEventListener('pointermove', lean)
      stage.removeEventListener('pointerleave', settle)
    }
  }, [lessMotion, finePointer])

  const toggle = () => {
    const film = video.current
    if (film === null) return
    if (paused) void film.play().catch(() => undefined)
    else film.pause()
    setPaused(!paused)
  }

  return (
    <>
      <div ref={root} aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-clip">
        <div className="absolute inset-x-0 top-0 h-[min(calc((100vw-1rem)*1.25),38rem)] overflow-clip lg:inset-0 lg:h-auto">
          <div className="absolute -inset-4 transition-transform duration-700 ease-out [transform:translate3d(calc(var(--lean-x,0)*-18px),calc(var(--lean-y,0)*-12px),0)_scale(1.03)]">
            <picture>
              <source media={TALL} srcSet={STILL.tall} />
              <img src={STILL.wide} alt="" fetchPriority="high" decoding="async" className="absolute inset-0 size-full object-cover object-top lg:object-center" />
            </picture>
            {lessMotion ? null : (
              <video
                ref={video}
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                disablePictureInPicture
                tabIndex={-1}
                onPlaying={() => { setShowing(true) }}
                className={cn('absolute inset-0 size-full object-cover object-top transition-opacity duration-1000 lg:object-center', showing ? 'opacity-100' : 'opacity-0')}
              >
                <source media={TALL} src={FILM.tall} type="video/mp4" />
                <source src={FILM.wide} type="video/mp4" />
              </video>
            )}
          </div>
          {/* Below lg the window fades into the stage, where the words begin; from lg they sit to the film's left. */}
          <div className="absolute inset-0 bg-linear-to-b from-transparent from-45% via-band/70 via-75% to-band lg:hidden" />
        </div>
        <div className="absolute inset-0 hidden bg-linear-to-r from-band from-15% via-band/80 via-45% to-transparent to-80% lg:block xl:from-10% xl:via-band/75 xl:via-40% xl:to-75%" />
        <div className="absolute inset-x-0 bottom-0 hidden h-1/3 bg-linear-to-t from-band/90 to-transparent lg:block" />
        <div className="absolute inset-x-0 top-0 hidden h-24 bg-linear-to-b from-band/60 to-transparent lg:block" />
      </div>
      {lessMotion ? null : (
        <button
          type="button"
          onClick={toggle}
          aria-label={paused ? t('play') : t('pause')}
          className="absolute top-3 right-3 z-10 grid size-11 place-items-center rounded-full bg-band-foreground/10 text-band-foreground ring-1 ring-band-foreground/20 backdrop-blur-md transition-colors hover:bg-band-foreground/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-band-accent md:top-5 md:right-5 lg:top-auto lg:bottom-5"
        >
          {paused ? <Play aria-hidden="true" className="size-4.5" /> : <Pause aria-hidden="true" className="size-4.5" />}
        </button>
      )}
    </>
  )
}
