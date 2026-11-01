import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { aspect, color, COLOR_SCHEMES, cssVariables, font, kebab, label, radius, size, tailwindColors, type, wordmark, type ColorToken } from './index.ts'

// The web app's stylesheet is where Hold's look was decided. These tests fail when a value here drifts from it, so the
// phone app and the web app never show two versions of one colour.
const css = readFileSync(new URL('../../../apps/web/src/app/globals.css', import.meta.url), 'utf8')

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`globals.css has no ${selector} block`)
  return css.slice(start, css.indexOf('\n}', start))
}

function declarations(selector: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const match of block(selector).matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gm)) {
    const [, name, value] = match
    if (name !== undefined && value !== undefined) found.set(name, value.trim())
  }
  return found
}

// Reads #rgb, #rrggbb and rgb()/rgba() in either syntax into one comparable form.
function rgba(value: string): readonly [number, number, number, number] {
  const hex = /^#([0-9a-f]{6})$/i.exec(value)?.[1]
  if (hex !== undefined) return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), 1]
  const parts = /^rgba?\(([^)]+)\)$/.exec(value)?.[1]?.split(/[\s,/]+/).filter(Boolean).map(Number)
  if (parts?.length === 3 || parts?.length === 4) return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1]
  throw new Error(`Not a colour: ${value}`)
}

const rem = (value: string) => Number(/^([\d.]+)rem$/.exec(value)?.[1]) * 16

const root = declarations(':root')
const dark = declarations('.dark')
const theme = declarations('@theme inline')

describe('colours', () => {
  const cssColors = [...root.keys()].filter((name) => name !== '--radius')

  it('has a token for every colour in the stylesheet, and no other', () => {
    expect(Object.keys(color.light).map((token) => `--${kebab(token)}`).sort()).toEqual(cssColors.sort())
  })

  it.each(cssColors)('%s matches the light theme', (name) => {
    expect(rgba(cssVariables('light')[name] ?? '')).toEqual(rgba(root.get(name) ?? ''))
  })

  // The dark theme only restates the colours that change; the rest carry over from the light theme.
  it.each(cssColors)('%s matches the dark theme', (name) => {
    expect(rgba(cssVariables('dark')[name] ?? '')).toEqual(rgba(dark.get(name) ?? root.get(name) ?? ''))
  })

  it('gives both themes the same tokens', () => {
    expect(Object.keys(color.dark).sort()).toEqual(Object.keys(color.light).sort())
  })

  it('points every Tailwind colour at its variable, so one class works in both themes', () => {
    expect(tailwindColors()['muted-foreground']).toBe('var(--muted-foreground)')
    expect(Object.keys(tailwindColors())).toHaveLength(Object.keys(color.light).length)
  })
})

// Text must stay readable on the surface it sits on, in both themes (WCAG AA, 4.5:1).
const READABLE: readonly (readonly [ColorToken, ColorToken])[] = [
  ['foreground', 'background'],
  ['mutedForeground', 'background'],
  ['mutedForeground', 'card'],
  ['cardForeground', 'card'],
  ['primaryForeground', 'primary'],
  ['primary', 'background'],
  ['destructive', 'background'],
  ['contrastForeground', 'contrast'],
  ['bandForeground', 'band'],
  ['bandMuted', 'band'],
  ['photoForeground', 'photo'],
  ['markForeground', 'mark'],
]

function luminance(value: string): number {
  const [r, g, b] = rgba(value).map((channel) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
}

function contrast(a: string, b: string): number {
  const [light, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((light ?? 0) + 0.05) / ((darker ?? 0) + 0.05)
}

describe.each(COLOR_SCHEMES)('%s theme contrast', (scheme) => {
  it.each(READABLE)('%s on %s reaches 4.5:1', (text, surface) => {
    expect(contrast(color[scheme][text], color[scheme][surface])).toBeGreaterThanOrEqual(4.5)
  })
})

describe('type', () => {
  it('uses the stylesheet fonts', () => {
    expect(theme.get('--font-sans')).toContain('--font-archivo')
    expect(theme.get('--font-mono')).toContain('--font-jetbrains-mono')
    expect(Object.values(font).every((name) => name.startsWith('Archivo_') || name.startsWith('JetBrainsMono_'))).toBe(true)
  })

  // A size the web scales with the window is the phone's smallest end of that range.
  it.each(Object.entries(type).filter(([, style]) => style.fromStylesheet))('%s matches its --text-* size', (token, style) => {
    const name = `--text-${kebab(token)}`
    const range = theme.get(name) ?? ''
    expect(style.size).toBe(rem(/^clamp\(([^,]+),/.exec(range)?.[1]?.trim() ?? range))
    const lineHeight = theme.get(`${name}--line-height`)
    if (lineHeight !== undefined) expect(style.lineHeight).toBe(Number(lineHeight))
    const tracking = theme.get(`${name}--letter-spacing`)
    if (tracking !== undefined) expect('letterSpacing' in style ? style.letterSpacing : undefined).toBe(Number(tracking.replace('em', '')))
    const weight = theme.get(`${name}--font-weight`)
    if (weight !== undefined) expect(style.font).toBe(font.display)
  })

  it('sets the small uppercase label like the stylesheet', () => {
    const utility = css.slice(css.indexOf('@utility label {'), css.indexOf('}', css.indexOf('@utility label {')))
    expect(utility).toContain(`font-size: ${String(label.size / 16)}rem`)
    expect(utility).toContain(`line-height: ${String(label.lineHeight)}`)
    expect(utility).toContain(`letter-spacing: ${String(label.letterSpacing)}em`)
    expect(utility).toContain('text-transform: uppercase')
  })
})

describe('shapes', () => {
  it('derives the radii from --radius', () => {
    const base = rem(root.get('--radius') ?? '')
    for (const [token, value] of Object.entries(radius)) {
      const rule = theme.get(`--radius-${kebab(token)}`) ?? ''
      const factor = /\* ([\d.]+)\)/.exec(rule)?.[1]
      expect([token, value]).toEqual([token, rule.startsWith('calc') ? base * Number(factor) : rule === 'var(--radius)' ? base : rem(rule)])
    }
  })

  it('keeps the photograph frames', () => {
    for (const [token, value] of Object.entries(aspect)) {
      const [width, height] = (theme.get(`--aspect-${kebab(token)}`) ?? '').split('/').map(Number)
      expect([token, value]).toEqual([token, (width ?? 0) / (height ?? 1)])
    }
  })

  it('keeps a tablet column as wide as the web page column', () => {
    expect(size.proseMaxWidth).toBe(rem(theme.get('--container-prose') ?? ''))
    expect(size.contentMaxWidth).toBe(rem(theme.get('--container-half-page') ?? ''))
  })

  it('draws the wordmark the way the stylesheet does', () => {
    const utility = (name: string) => css.slice(css.indexOf(`@utility ${name} {`), css.indexOf('\n}', css.indexOf(`@utility ${name} {`)))
    expect(utility('wordmark')).toContain(`--wordmark-tracking: ${String(wordmark.tracking)}em`)
    expect(utility('held-o')).toContain(`width: ${String(wordmark.disc.width)}em`)
    expect(utility('held-o')).toContain(`height: ${String(wordmark.disc.height)}em`)
    expect(utility('held-o')).toContain(`${String(wordmark.disc.lift)}em)`)
  })
})
