import { expect, it } from 'vitest'
import { photoReused } from './reuse.ts'

const photo = (sha256: string, perceptualHash: string | null) => ({ sha256, perceptualHash })

it('catches a return photograph that is a copy of earlier evidence, exactly or to the eye', () => {
  expect(photoReused(photo('a', null), [photo('a', 'p1')])).toBe(true)
  expect(photoReused(photo('b', 'p1'), [photo('a', 'p1')])).toBe(true)
  expect(photoReused(photo('b', 'p2'), [photo('a', 'p1')])).toBe(false)
  expect(photoReused(photo('b', null), [photo('a', null)])).toBe(false)
})
