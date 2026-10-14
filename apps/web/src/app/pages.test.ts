import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { routes } from '@/lib/routes'

const localeFolder = join(import.meta.dirname, '[locale]')

describe('pages', () => {
  it.each(Object.entries(routes))('the %s route has a page of its own', (_name, path) => {
    expect(existsSync(join(localeFolder, path, 'page.tsx'))).toBe(true)
  })

  it('has a page for an address that does not exist', () => {
    expect(existsSync(join(localeFolder, 'not-found.tsx'))).toBe(true)
  })

  it('has a page for a failure', () => {
    expect(existsSync(join(localeFolder, 'error.tsx'))).toBe(true)
  })
})
