import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { PhotoTaker } from './photo-taker'

const check = vi.fn()
const upload = vi.fn()
vi.mock('./use-quality-check', () => ({ useQualityCheck: () => check }))
vi.mock('./read-image', () => ({ readImage: () => Promise.resolve({ blob: new Blob(['jpeg'], { type: 'image/jpeg' }), pixels: { data: new Uint8ClampedArray(4), width: 1, height: 1 } }) }))

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(new Blob(['jpeg'], { type: 'image/jpeg' })))))
})

afterEach(() => {
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
})
