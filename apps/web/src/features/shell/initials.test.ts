import { describe, expect, it } from 'vitest'
import { initials } from './initials'

describe('initials', () => {
  it.each([
    ['Ribeira Bikes', 'RB'],
    ['Tomás', 'T'],
    ['  ana   maria  ribeiro ', 'AR'],
    ['Élodie Durand', 'ÉD'],
    ['', '?'],
  ])('of %j are %s', (name, expected) => {
    expect(initials(name)).toBe(expected)
  })
})
