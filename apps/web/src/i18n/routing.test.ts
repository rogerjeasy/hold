import { describe, expect, it } from 'vitest'
import { routing } from './routing'

describe('routing', () => {
  it('serves English by default', () => {
    expect(routing.defaultLocale).toBe('en')
  })

  it('offers English, Spanish, French and German', () => {
    expect(routing.locales).toEqual(['en', 'es', 'fr', 'de'])
  })

  it('keeps the default language at the bare path', () => {
    expect(routing.localePrefix).toBe('as-needed')
  })
})
