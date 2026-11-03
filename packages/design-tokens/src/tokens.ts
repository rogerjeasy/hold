// Hold's look, "Evidence": near-black ink on warm paper, one orange accent, photographs first, on soft rounded cards. The web app's stylesheet
// (apps/web/src/app/globals.css) decided every value here; tokens.test.ts fails when the two drift apart. The phone
// app reads only this file, never a hex value of its own.

const light = {
  background: '#f4f2ed',
  foreground: '#141412',
  card: '#ffffff',
  cardForeground: '#141412',
  popover: '#ffffff',
  popoverForeground: '#141412',
  primary: '#b93f08',
  primaryForeground: '#ffffff',
  secondary: '#ebe8e0',
  secondaryForeground: '#141412',
  muted: '#eeebe4',
  mutedForeground: '#5c5952',
  accent: '#ebe8e0',
  accentForeground: '#141412',
  destructive: '#a32a1a',
  success: '#1b6b45',
  border: '#e2ded5',
  borderStrong: '#b4afa3',
  input: '#b4afa3',
  ring: '#b93f08',
  // An ink-coloured surface that flips with the theme.
  contrast: '#141412',
  contrastForeground: '#f4f2ed',
  // The dark band stays dark in both themes.
  band: '#141412',
  bandForeground: '#f2efe8',
  bandMuted: '#a6a298',
  bandBorder: '#34342f',
  bandAccent: '#ff6a2b',
  bandHover: '#1f1f1c',
  bandActive: '#2a2a26',
  bandSuccess: '#6fcf9d',
  warning: '#8a5a00',
  // Anything drawn on top of a photograph keeps one set of colours in both themes.
  photo: '#17191a',
  photoForeground: '#f2efe8',
  photoScrim: 'rgba(10, 10, 9, 0.78)',
  mark: '#ff6a2b',
  markForeground: '#1c0d04',
} as const

export type ColorToken = keyof typeof light
export type Palette = Readonly<Record<ColorToken, string>>

const dark: Palette = {
  ...light,
  background: '#0e0e0d',
  foreground: '#f2efe8',
  card: '#171715',
  cardForeground: '#f2efe8',
  popover: '#1b1b19',
  popoverForeground: '#f2efe8',
  primary: '#ff6a2b',
  primaryForeground: '#1c0d04',
  secondary: '#23231f',
  secondaryForeground: '#f2efe8',
  muted: '#1c1c1a',
  mutedForeground: '#a6a298',
  accent: '#23231f',
  accentForeground: '#f2efe8',
  destructive: '#ff8a75',
  success: '#6fcf9d',
  border: '#292926',
  borderStrong: '#47473f',
  input: '#47473f',
  ring: '#ff6a2b',
  contrast: '#f2efe8',
  contrastForeground: '#0e0e0d',
  band: '#181816',
  bandHover: '#22221f',
  bandActive: '#2e2e29',
  warning: '#e6b450',
}

export const COLOR_SCHEMES = ['light', 'dark'] as const
export type ColorScheme = (typeof COLOR_SCHEMES)[number]

export const color: Readonly<Record<ColorScheme, Palette>> = { light, dark }

// The web sets Archivo and JetBrains Mono as variable fonts. A phone loads one file per weight, named here, because
// Android ignores a weight given to a custom font.
export const font = {
  body: 'Archivo_400Regular',
  bodyMedium: 'Archivo_500Medium',
  bodySemibold: 'Archivo_600SemiBold',
  bodyBold: 'Archivo_700Bold',
  // Headlines and the wordmark.
  display: 'Archivo_800ExtraBold',
  // Figures: amounts, codes and dates in columns.
  figure: 'JetBrainsMono_400Regular',
  // The small uppercase label.
  label: 'JetBrainsMono_500Medium',
} as const

export type FontToken = keyof typeof font

type TextStyleToken = {
  readonly font: (typeof font)[FontToken]
  // In points at the default text size; the phone's text size setting scales it.
  readonly size: number
  // A multiple of the size, as in CSS.
  readonly lineHeight: number
  // In em, as in CSS.
  readonly letterSpacing?: number
  readonly uppercase?: boolean
  // A --text-* size in the stylesheet, checked against it. The others are the sizes the web writes in its components.
  readonly fromStylesheet: boolean
}

// A size the web scales with the window (clamp) is its smallest end here: the width of a phone.
export const type = {
  display: { font: font.display, size: 54, lineHeight: 0.9, letterSpacing: -0.05, fromStylesheet: true },
  headline: { font: font.display, size: 38, lineHeight: 0.96, letterSpacing: -0.045, fromStylesheet: true },
  pageTitle: { font: font.display, size: 32, lineHeight: 1, letterSpacing: -0.045, fromStylesheet: true },
  title: { font: font.display, size: 28, lineHeight: 1, letterSpacing: -0.04, fromStylesheet: true },
  figure: { font: font.display, size: 26, lineHeight: 1.1, letterSpacing: -0.04, fromStylesheet: true },
  lead: { font: font.body, size: 18, lineHeight: 1.55, fromStylesheet: true },
  // A panel's heading (web: 1.0625rem, extrabold, tight).
  heading: { font: font.display, size: 17, lineHeight: 1.25, letterSpacing: -0.025, fromStylesheet: false },
  body: { font: font.body, size: 16, lineHeight: 1.55, fromStylesheet: false },
  bodyStrong: { font: font.bodySemibold, size: 16, lineHeight: 1.55, fromStylesheet: false },
  button: { font: font.bodySemibold, size: 15, lineHeight: 1.3, fromStylesheet: false },
  small: { font: font.body, size: 13, lineHeight: 1.45, fromStylesheet: false },
  label: { font: font.label, size: 14, lineHeight: 1.4, letterSpacing: 0.05, uppercase: true, fromStylesheet: false },
  // The sample tag beside anything simulated (web: label at 0.625rem).
  tag: { font: font.label, size: 10, lineHeight: 1.5, letterSpacing: 0.05, uppercase: true, fromStylesheet: false },
  // One digit of a one-time code, and an amount in a column.
  code: { font: font.figure, size: 24, lineHeight: 1.2, fromStylesheet: false },
} as const satisfies Record<string, TextStyleToken>

export type TypeToken = keyof typeof type

// The web's `label` utility.
export const label = type.label

// Corner radii in points, from the stylesheet's --radius (0.625rem): soft, never pill-round except where a part says so.
export const radius = {
  sm: 6,
  md: 8,
  lg: 10,
  xl: 14,
  '2xl': 18,
  '3xl': 22,
  '4xl': 26,
} as const

// Photograph frames, width over height.
export const aspect = {
  evidence: 21 / 9,
  evidenceTall: 4 / 5,
  thumbnail: 4 / 3,
} as const

// The logo is the name in lowercase, Archivo 800, with the inside of the o filled orange. A disc sits behind the o,
// larger than its counter and smaller than its bowl, so only the counter shows it. Sizes are in em.
export const wordmark = {
  text: 'hold',
  tracking: -0.045,
  disc: { width: 0.36, height: 0.42, lift: -0.053 },
} as const

// Sizes the phone needs that the web stylesheet does not have.
export const size = {
  // AGENTS.md section 9: every control is at least 44 points square.
  minTouchTarget: 44,
  // The widest a column of text grows on a tablet (web: --container-prose, 34rem).
  proseMaxWidth: 544,
  // A screen's content on a tablet (web: --container-half-page, 40rem).
  contentMaxWidth: 640,
} as const
