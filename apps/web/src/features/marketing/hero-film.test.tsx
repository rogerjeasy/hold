import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { films } from './films'
import { HeroFilm } from './hero-film'

// Which media queries match, as the browser would answer them.
function prefer(matching: readonly string[]) {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: matching.some((each) => query.includes(each)),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

const chapters = [
  { key: 'reserve', start: 0, title: 'Reserve', who: 'Priya, the renter' },
  { key: 'handOver', start: 7, title: 'Hand over', who: 'Jonas, at the counter' },
] as const

describe('a stage’s background film', () => {
  let play = vi.fn()
  let pause = vi.fn()
  beforeEach(() => {
    play = vi.fn().mockResolvedValue(undefined)
    pause = vi.fn()
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(pause)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('plays a muted loop, a phone’s own cut first, hidden from screen readers, and can be paused', async () => {
    prefer([])
    const { container } = renderWithIntl(<HeroFilm film={films.home} />)
    const video = container.querySelector('video')
    expect(video).not.toBeNull()
    expect(video).toHaveProperty('muted', true)
    expect(video).toHaveAttribute('loop')
    expect(video).toHaveAttribute('playsinline')
    expect(video?.closest('[aria-hidden="true"]')).not.toBeNull()
    expect([...(video?.querySelectorAll('source') ?? [])].map((source) => source.getAttribute('src'))).toEqual(['/video/hero-tall.mp4', '/video/hero-wide.mp4'])
    await userEvent.click(screen.getByRole('button', { name: 'Pause the background film' }))
    expect(pause).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Play the background film' }))
    expect(play).toHaveBeenCalled()
  })

  it('shows one still frame instead, with no film and no control, to a person who asks for less motion', () => {
    prefer(['prefers-reduced-motion'])
    const { container } = renderWithIntl(<HeroFilm film={films.home} chapters={chapters} />)
    expect(container.querySelector('video')).toBeNull()
    expect(container.querySelector('img')).toHaveAttribute('src', '/images/hero/hero-wide-still.webp')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('names each chapter and who acts in it, marks the one playing, and jumps to the one chosen', async () => {
    prefer([])
    const { container } = renderWithIntl(<HeroFilm film={films.howItWorks} chapters={chapters} />)
    expect([...container.querySelectorAll('video source')].map((source) => source.getAttribute('src'))).toEqual(['/video/how-tall.mp4', '/video/how-wide.mp4'])
    const reserve = screen.getByRole('button', { name: 'Play the film from Reserve' })
    expect(reserve).toHaveAttribute('aria-current', 'step')
    expect(reserve).toHaveTextContent('Priya, the renter')
    await userEvent.click(screen.getByRole('button', { name: 'Play the film from Hand over' }))
    expect(container.querySelector('video')?.currentTime).toBe(7)
  })
})
