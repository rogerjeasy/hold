import { expect, it } from 'vitest'
import { photoReused } from './reuse.ts'

const photo = (sha256: string, perceptualHash: string | null) => ({ sha256, perceptualHash })

it('catches a return photograph that is a copy of earlier evidence, exactly or to the eye', () => {
  expect(photoReused(photo('a', null), [photo('a', '00000000000000ff')])).toBe(true)
  expect(photoReused(photo('b', '00000000000000ff'), [photo('a', '00000000000000ff')])).toBe(true)
  expect(photoReused(photo('b', 'ffffffff00000000'), [photo('a', '00000000000000ff')])).toBe(false)
  expect(photoReused(photo('b', null), [photo('a', null)])).toBe(false)
})

// Resizing a photograph and saving it again moves its fingerprint by a bit or a few (one to four, measured on the
// evaluation set's re-saved handover photographs), while a new photograph of the same view, taken with the handover
// overlay, moves it by three to twelve. A close fingerprint sends the return to a person; it never charges anyone.
it('catches a re-saved copy whose fingerprint moved by four bits or fewer, and lets a new photograph through', () => {
  expect(photoReused(photo('b', '000000000000000f'), [photo('a', '00000000000000ff')])).toBe(true)
  expect(photoReused(photo('b', '0000000000000007'), [photo('a', '00000000000000ff')])).toBe(false)
})
