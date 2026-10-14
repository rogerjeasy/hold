import { describe, expect, it } from 'vitest'
import { routes } from './routes'

describe('routes', () => {
  it.each(Object.entries(routes))('%s is a page path, never an in-page anchor', (_name, path) => {
    expect(path.startsWith('/')).toBe(true)
    expect(path).not.toContain('#')
  })

  it('gives every page its own path', () => {
    const paths = Object.values(routes)
    expect(new Set(paths).size).toBe(paths.length)
  })
})
