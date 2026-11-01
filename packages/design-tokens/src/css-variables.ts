import { color, type ColorScheme, type ColorToken } from './tokens.ts'

// `mutedForeground` → `muted-foreground`: a token's name in CSS and in Tailwind classes.
export function kebab(token: string): string {
  return token.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

// Every colour as the CSS variable the web stylesheet names it with, for one theme. The phone app hands these to
// NativeWind, so the same variable names hold the same colours on both.
export function cssVariables(scheme: ColorScheme): Readonly<Record<string, string>> {
  const palette = color[scheme]
  return Object.fromEntries((Object.keys(palette) as ColorToken[]).map((token) => [`--${kebab(token)}`, palette[token]]))
}

// Tailwind's colours: each class reads its variable, so one class works in both themes.
export function tailwindColors(): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.keys(color.light).map((token) => [kebab(token), `var(--${kebab(token)})`]))
}
