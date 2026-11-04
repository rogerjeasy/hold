import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
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

describe('the hero’s background film', () => {
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
    const { container } = renderWithIntl(<HeroFilm />)
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
    const { container } = renderWithIntl(<HeroFilm />)
    expect(container.querySelector('video')).toBeNull()
    expect(container.querySelector('img')).toHaveAttribute('src', '/images/hero/hero-wide-still.webp')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
