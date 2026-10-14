import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { routing } from './routing'

type Tree = { [key: string]: string | Tree }

const folder = join(import.meta.dirname, '../../messages')

function load(locale: string): Tree {
  return JSON.parse(readFileSync(join(folder, `${locale}.json`), 'utf8')) as Tree
}

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const entries = new Map<string, string>()
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix === '' ? key : `${prefix}.${key}`
    if (typeof value === 'string') entries.set(path, value)
    else for (const [childPath, childValue] of flatten(value, path)) entries.set(childPath, childValue)
  }
  return entries
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)/g)].map((match) => match[1] ?? '').sort()
}

const english = flatten(load(routing.defaultLocale))
const translations = routing.locales.filter((locale) => locale !== routing.defaultLocale)

describe.each(translations)('the %s messages', (locale) => {
  const translated = flatten(load(locale))

  it('have every key the English messages have, and no others', () => {
    expect([...translated.keys()].sort()).toEqual([...english.keys()].sort())
  })

  it('leave nothing empty', () => {
    expect([...translated].filter(([, text]) => text.trim() === '').map(([key]) => key)).toEqual([])
  })

  it('keep every placeholder the English text fills in', () => {
    const mismatched = [...english]
      .filter(([key, text]) => placeholders(text).join() !== placeholders(translated.get(key) ?? '').join())
      .map(([key]) => key)
    expect(mismatched).toEqual([])
  })

  it('keep the four language names in their own language', () => {
    for (const code of routing.locales) {
      expect(translated.get(`language.${code}`)).toBe(english.get(`language.${code}`))
    }
  })
})
