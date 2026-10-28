// Copies the gate half's photographs from eval/set to public/eval as display copies, where the open scorecard shows
// each pair (src/features/open-scorecard). It runs before every build and development server, like the Bryntum copy.
// The copies are not committed; a set with no photographs yet copies nothing.
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { EVAL_PHOTO_PATH, galleryPhotos } from '../src/features/open-scorecard/eval-photos.ts'

const set = fileURLToPath(new URL('../../../eval/set', import.meta.url))
const to = join(fileURLToPath(new URL('../public', import.meta.url)), EVAL_PHOTO_PATH)
// Wide enough to see a chip in the paint on a laptop, small enough for a phone.
const DISPLAY_WIDTH = 1600

const photos = galleryPhotos(JSON.parse(readFileSync(join(set, 'manifest.json'), 'utf8')))
for (const path of photos) {
  const source = join(set, path)
  const target = join(to, path)
  if (existsSync(target) && statSync(target).mtimeMs >= statSync(source).mtimeMs) continue
  mkdirSync(dirname(target), { recursive: true })
  await sharp(source).rotate().resize({ width: DISPLAY_WIDTH, withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(target)
}
