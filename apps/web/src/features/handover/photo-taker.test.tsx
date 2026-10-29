import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { PhotoTaker } from './photo-taker'

const check = vi.fn()
const upload = vi.fn()
vi.mock('./use-quality-check', () => ({ useQualityCheck: () => check }))
// jsdom has no camera: unless a test turns it on, the screen is as on a device without one.
const camera = { state: 'unavailable' as 'live' | 'unavailable' }
vi.mock('./use-camera', () => ({ useCamera: () => ({ video: { current: null }, state: camera.state }) }))
vi.mock('./read-image', () => ({ readImage: () => Promise.resolve({ blob: new Blob(['jpeg'], { type: 'image/jpeg' }), pixels: { data: new Uint8ClampedArray(4), width: 1, height: 1 } }) }))

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(new Blob(['jpeg'], { type: 'image/jpeg' })))))
})

afterEach(() => {
  camera.state = 'unavailable'
  vi.unstubAllGlobals()
  check.mockReset()
  upload.mockReset()
})

const view = { key: 'left-side', label: 'Left side', outline: 'whole_side' as const, required: true }

describe('taking a view’s photograph', () => {
  it('checks the photograph, uploads it when it is good, and says so', async () => {
    check.mockResolvedValue({ sharpness: 150, shadows: 20, highlights: 220, filled: 0.6 })
    upload.mockResolvedValue({ ok: true, photoId: 'photo-1' })
    const taken = vi.fn()
    renderWithIntl(<PhotoTaker view={view} upload={upload} onTaken={taken} />)
    await userEvent.click(screen.getByRole('button', { name: 'Use the sample photograph' }))
    await waitFor(() => {
      expect(taken).toHaveBeenCalled()
    })
    expect(upload.mock.calls[0]?.[1]).toMatchObject({ sharpness: 150 })
    expect(upload.mock.calls[0]?.[3]).toBe(true)
  })

  // The return offers two more samples of the same frame: one with a chip in the paint, to show damage, and one where the
  // faint scuff seen at the handover has grown into a scratch, to show a claim the renter contests.
  it.each([
    ['Use the sample with damage', '/images/sample-return-damage.jpg'],
    ['Use the sample for a contested claim', '/images/sample-return-contested.jpg'],
  ])('offers “%s” only where return samples are asked for, and uploads it as a sample', async (name, source) => {
    check.mockResolvedValue({ sharpness: 150, shadows: 20, highlights: 220, filled: 0.6 })
    upload.mockResolvedValue({ ok: true, photoId: 'photo-1' })
    const { unmount } = renderWithIntl(<PhotoTaker view={view} upload={upload} onTaken={vi.fn()} />)
    expect(screen.queryByRole('button', { name })).toBeNull()
    unmount()
    const taken = vi.fn()
    renderWithIntl(<PhotoTaker view={view} upload={upload} onTaken={taken} returnSamples />)
    await userEvent.click(screen.getByRole('button', { name }))
    await waitFor(() => {
      expect(taken).toHaveBeenCalled()
    })
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(source)
    expect(upload.mock.calls[0]?.[3]).toBe(true)
  })

  it('asks for a retake of a blurred or dark photograph, says why, and uploads nothing', async () => {
    check.mockResolvedValue({ sharpness: 5, shadows: 2, highlights: 30, filled: 0.6 })
    renderWithIntl(<PhotoTaker view={view} upload={upload} onTaken={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Use the sample photograph' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('blurred')
    expect(alert).toHaveTextContent('too dark')
    expect(upload).not.toHaveBeenCalled()
  })

  it('says plainly when the upload failed, so it can be tried again', async () => {
    check.mockResolvedValue({ sharpness: 150, shadows: 20, highlights: 220, filled: 0.6 })
    upload.mockResolvedValue({ ok: false, reason: 'upload_failed' })
    renderWithIntl(<PhotoTaker view={view} upload={upload} onTaken={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Use the sample photograph' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('did not upload')
  })

  it('asks for a new photograph, without blame, when it repeats earlier evidence', async () => {
    check.mockResolvedValue({ sharpness: 150, shadows: 20, highlights: 220, filled: 0.6 })
    upload.mockResolvedValue({ ok: false, reason: 'photo_reused' })
    renderWithIntl(<PhotoTaker view={view} upload={upload} onTaken={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Use the sample photograph' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This photograph was used before. Take a new one of the item as it is now.')
  })
})

// architecture.md section 9.1: in a return session the camera also shows the handover photograph faintly, to match the angle.
describe('the handover ghost at a return', () => {
  const guide = '/images/sample-handover.jpg'

  it('lays the handover photograph faintly over the live camera, and lets staff hide it or change how strongly it shows', async () => {
    camera.state = 'live'
    renderWithIntl(<PhotoTaker view={view} upload={upload} onTaken={vi.fn()} guide={guide} returnSamples />)
    const ghost = screen.getByRole('img', { name: 'Handover guide: Left side' })
    expect(ghost).toHaveStyle({ opacity: '0.4' })
    const strength = screen.getByRole('slider', { name: 'How strongly the handover photograph shows' })
    expect(strength).toHaveAttribute('aria-valuetext', '40%')
    fireEvent.change(strength, { target: { value: '70' } })
    expect(ghost).toHaveStyle({ opacity: '0.7' })
    expect(screen.getByText('70%')).toBeInTheDocument()
    const shown = screen.getByRole('checkbox', { name: 'Show the handover photograph over the camera' })
    expect(shown).toBeChecked()
    await userEvent.click(shown)
    expect(screen.queryByRole('img', { name: 'Handover guide: Left side' })).toBeNull()
    expect(strength).toBeDisabled()
    await userEvent.click(shown)
    expect(screen.getByRole('img', { name: 'Handover guide: Left side' })).toHaveStyle({ opacity: '0.7' })
  })

  it('shows the handover photograph whole as the framing guide when there is no camera to lay it over', () => {
    renderWithIntl(<PhotoTaker view={view} upload={upload} onTaken={vi.fn()} guide={guide} returnSamples />)
    expect(screen.getByRole('img', { name: 'Handover guide: Left side' })).toHaveStyle({ opacity: '1' })
    expect(screen.getByText('The handover photograph of this view. Take the return photograph from the same angle.')).toBeInTheDocument()
    expect(screen.queryByRole('slider')).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('shows no ghost and no controls at the handover, which has nothing earlier to match', () => {
    camera.state = 'live'
    renderWithIntl(<PhotoTaker view={view} upload={upload} onTaken={vi.fn()} />)
    expect(screen.queryByRole('img', { name: /Handover guide/ })).toBeNull()
    expect(screen.queryByRole('slider')).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })
})
