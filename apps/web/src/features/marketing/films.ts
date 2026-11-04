// The films behind the public pages' stages. Each is Hold's own render (public/images/CREDITS.md), cut twice: wide
// for a screen from lg up, tall for the window at the top of the stage below it. The still is one frame of the film,
// for a person who asks for less motion and for the moment before the film plays.
export type Film = {
  readonly wide: string
  readonly tall: string
  readonly still: { readonly wide: string; readonly tall: string }
}

// Where each moment of the How it works film begins, in seconds of its 39.5-second loop: the booking through Hold's
// MCP server, then the four moments of the rental, PayPal's calls shown as they are made.
export const HOW_IT_WORKS_CHAPTERS = [
  { key: 'book', start: 0 },
  { key: 'reserve', start: 7 },
  { key: 'handOver', start: 14 },
  { key: 'return', start: 20.4 },
  { key: 'settle', start: 26.2 },
] as const

export const films = {
  // A city bike and an e-scooter scanned by a sheet of light, and brackets that close on a chip in the paint.
  home: { wide: '/video/hero-wide.mp4', tall: '/video/hero-tall.mp4', still: { wide: '/images/hero/hero-wide-still.webp', tall: '/images/hero/hero-tall-still.webp' } },
  // Priya's assistant books through Hold's MCP server; then Priya, Jonas and Tomás take the rental through its hold, six
  // photographs, comparison and settlement, with each call to PayPal travelling to a PayPal record that fills as it goes.
  howItWorks: { wide: '/video/how-wide.mp4', tall: '/video/how-tall.mp4', still: { wide: '/images/hero/how-wide-still.webp', tall: '/images/hero/how-tall-still.webp' } },
} as const satisfies Record<string, Film>
