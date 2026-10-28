import { z } from 'zod'

// Where the gate half's display copies are served from, under public/. scripts/copy-eval-photos.ts writes them at
// build time from eval/set; they are not committed.
export const EVAL_PHOTO_PATH = 'eval'

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
