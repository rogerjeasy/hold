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

// The names a message fills in: {name}, or {name, plural, ...}. The branches of a plural, such as "one {# item}", are
// text in the reader's language, read for the placeholders inside them. Messages that quote braces are not used.
function placeholders(text: string): string[] {
  const names = new Set<string>()
  let at = 0
  // Reads one message up to the brace that closes it, or to the end.
  function message(): void {
    while (at < text.length && text[at] !== '}') {
      if (text[at] === '{') argument()
      else at += 1
    }
  }
  // Reads {name} or {name, type, selector {message} ...}, from its opening brace to its closing one.
  function argument(): void {
    at += 1
    const end = text.slice(at).search(/[,}]/)
    names.add(text.slice(at, at + end).trim())
    at += end
    if (text[at] === ',') {
      while (at < text.length && text[at] !== '}') {
        if (text[at] === '{') {
          at += 1
          message()
        }
        at += 1
      }
    }
    at += 1
  }
  message()
  return [...names].sort()
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
