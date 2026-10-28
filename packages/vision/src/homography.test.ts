import { describe, expect, it } from 'vitest'
import { homographyProblem, IDENTITY, mapPoint, mapRegion } from './homography.ts'
import type { Homography } from './homography.ts'

const turn = (degrees: number, scale = 1): Homography => {
  const angle = (degrees * Math.PI) / 180
  return [scale * Math.cos(angle), -scale * Math.sin(angle), 0, scale * Math.sin(angle), scale * Math.cos(angle), 0, 0, 0, 1]
}

const multiply = (first: Homography, second: Homography): Homography => {
  const cell = (row: number, column: number) => [0, 1, 2].reduce((sum, k) => sum + (first[row * 3 + k] ?? 0) * (second[k * 3 + column] ?? 0), 0)
  return [cell(0, 0), cell(0, 1), cell(0, 2), cell(1, 0), cell(1, 1), cell(1, 2), cell(2, 0), cell(2, 1), cell(2, 2)]
}

describe('mapping regions between the two photographs', () => {
  it('leaves a region where it is under the identity', () => {
    const region = mapRegion(IDENTITY, { x: 0.2, y: 0.3, width: 0.1, height: 0.2 })
    for (const [key, value] of Object.entries({ x: 0.2, y: 0.3, width: 0.1, height: 0.2 })) expect(region[key as keyof typeof region]).toBeCloseTo(value)
  })

  it('moves a region with a translation', () => {
    const region = mapRegion([1, 0, 0.05, 0, 1, -0.02, 0, 0, 1], { x: 0.2, y: 0.3, width: 0.1, height: 0.2 })
    expect(region.x).toBeCloseTo(0.25)
    expect(region.y).toBeCloseTo(0.28)
    expect(region.width).toBeCloseTo(0.1)
    expect(region.height).toBeCloseTo(0.2)
  })

  it('takes the box around the four mapped corners of a turned region', () => {
    // Turned 30 degrees about the origin, the square's corners (0.4, 0.2), (0.6, 0.2), (0.4, 0.4), (0.6, 0.4) span
    // x from 0.4·cos − 0.4·sin to 0.6·cos − 0.2·sin, and y from 0.4·sin + 0.2·cos to 0.6·sin + 0.4·cos.
    const cos = Math.cos(Math.PI / 6); const sin = Math.sin(Math.PI / 6)
    const region = mapRegion(turn(30), { x: 0.4, y: 0.2, width: 0.2, height: 0.2 })
    expect(region.x).toBeCloseTo(0.4 * cos - 0.4 * sin)
    expect(region.x + region.width).toBeCloseTo(0.6 * cos - 0.2 * sin)
    expect(region.y).toBeCloseTo(0.4 * sin + 0.2 * cos)
    expect(region.y + region.height).toBeCloseTo(0.6 * sin + 0.4 * cos)
  })

  it('keeps a mapped region inside the photograph', () => {
    const region = mapRegion([1, 0, -0.15, 0, 1, 0.15, 0, 0, 1], { x: 0.1, y: 0.8, width: 0.1, height: 0.1 })
    expect(region).toEqual({ x: 0, y: expect.closeTo(0.95) as number, width: expect.closeTo(0.05) as number, height: expect.closeTo(0.05) as number })
  })

  it('maps a point through the perspective division', () => {
    expect(mapPoint([2, 0, 0, 0, 2, 0, 0, 0, 2], { x: 0.3, y: 0.4 })).toEqual({ x: 0.3, y: 0.4 })
  })
})

describe('judging whether an estimated homography is a plausible camera move', () => {
  const size = { width: 1000, height: 750 }
  // The matrix applied about the frame's centre, as a camera turning on its view would.
  const about = (matrix: Homography) => multiply(multiply([1, 0, size.width / 2, 0, 1, size.height / 2, 0, 0, 1], matrix), [1, 0, -size.width / 2, 0, 1, -size.height / 2, 0, 0, 1])

  it('accepts a small turn, zoom and shift, and a light change of perspective', () => {
    expect(homographyProblem(IDENTITY, size)).toBeNull()
    expect(homographyProblem(about(turn(4, 1.05)), size)).toBeNull()
    expect(homographyProblem([1, 0, 30, 0, 1, -20, 0, 0, 1], size)).toBeNull()
    expect(homographyProblem(about([1, 0, 0, 0, 1, 0, 0.0001, 0, 1]), size)).toBeNull()
  })

  it('refuses a mirror image', () => {
    expect(homographyProblem([-1, 0, 1000, 0, 1, 0, 0, 0, 1], size)).toBe('flip')
  })

  it('refuses a zoom too far in or out to be the same view', () => {
    expect(homographyProblem(about(turn(0, 2)), size)).toBe('scale')
    expect(homographyProblem(about(turn(0, 0.4)), size)).toBe('scale')
  })

  it('refuses a stretch in one direction', () => {
    expect(homographyProblem(about([1.4, 0, 0, 0, 0.8, 0, 0, 0, 1]), size)).toBe('skew')
  })

  it('refuses a strong perspective change', () => {
    expect(homographyProblem(about([1, 0, 0, 0, 1, 0, 0.0008, 0, 1]), size)).toBe('perspective')
  })

  it('refuses a matrix that is not a homography at all', () => {
    expect(homographyProblem([0, 0, 0, 0, 0, 0, 0, 0, 0], size)).not.toBeNull()
    expect(homographyProblem([Number.NaN, 0, 0, 0, 1, 0, 0, 0, 1], size)).not.toBeNull()
  })
})
