import { PhotoWithMarks } from '@/components/photo-with-marks'
import { PhotoProvenance } from './photo-provenance'
import type { ProvenanceView } from './photo-provenance'

// One evidence photograph with its caption above and, under it, where it came from and its seal.
export function EvidencePhoto({ caption, url, provenance, timeZone }: { caption: string; url: string; provenance: ProvenanceView | null; timeZone: string }) {
  return (
    <figure className="grid min-w-0 content-start gap-2">
      <figcaption className="font-semibold">{caption}</figcaption>
      <PhotoWithMarks src={url} alt={caption} marks={[]} />
      {provenance === null ? null : <PhotoProvenance provenance={provenance} timeZone={timeZone} />}
    </figure>
  )
}
