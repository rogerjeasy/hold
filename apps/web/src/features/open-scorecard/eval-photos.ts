import { z } from 'zod'

// Where the gate half's display copies are served from, under public/. scripts/copy-eval-photos.ts writes them at
// build time from eval/set; they are not committed.
export const EVAL_PHOTO_PATH = 'eval'

// Where the evaluation set's photographs come from (eval/raw/SOURCES.md). The set is CC BY-SA 4.0, so every page that
// shows it credits the authors and the licences of the photographs it is made from.
export const EVAL_PHOTO_CREDITS = {
  urwahn: 'https://commons.wikimedia.org/wiki/File:Urwahn_E-Bike_%E2%80%9EPlatzhirsch%E2%80%9C.jpg',
  rm: 'https://commons.wikimedia.org/wiki/File:Riese_und_M%C3%BCller_New_Charger_S-Pedelec_rechts.jpg',
  licence: 'https://creativecommons.org/licenses/by-sa/4.0/',
  // The photographs of real damage pasted on synthetic pairs (eval/raw/damage/sources.json), and their own licences.
  scratches: 'https://commons.wikimedia.org/wiki/File:Scratches_(14779773577).jpg',
  gouge: 'https://commons.wikimedia.org/wiki/File:Tense_bird_on_blue_sm.jpg',
  rust: 'https://commons.wikimedia.org/wiki/File:Didcot_Railway_Centre_UK.jpg',
  chip: 'https://commons.wikimedia.org/wiki/File:Stahltr%C3%A4ger_Farbe_abgeplatzt_W.jpg',
  by20: 'https://creativecommons.org/licenses/by/2.0/',
  bysa30: 'https://creativecommons.org/licenses/by-sa/3.0/',
} as const

// Only what this needs of the evaluation set's manifest (eval/src/manifest.ts holds the whole format). A path must stay
// inside its half's own folder, so the copy can never reach outside the set.
const manifestSchema = z.object({
  cases: z.array(z.object({ half: z.enum(['tuning', 'gate']), before: z.string(), after: z.string() })),
})
const insideHalf = (half: string, path: string) => path.startsWith(`${half}/`) && !path.includes('..')

// Every handover and return photograph of the gate half, once each, in the manifest's order.
export function galleryPhotos(manifest: unknown): string[] {
  const { cases } = manifestSchema.parse(manifest)
  const photos = cases.filter((each) => each.half === 'gate').flatMap((each) => [each.before, each.after])
  const outside = photos.find((path) => !insideHalf('gate', path))
  if (outside !== undefined) throw new Error(`The manifest names a photograph outside the gate half: ${outside}`)
  return [...new Set(photos)]
}

// The address of one photograph as a case names it. A path that is already an address, which only the test
// environment's fixture run uses, is kept as it is.
export function evalPhotoUrl(path: string): string {
  return path.startsWith('/') ? path : `/${EVAL_PHOTO_PATH}/${path}`
}
