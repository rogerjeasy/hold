import { DetectFacesCommand, RekognitionClient } from '@aws-sdk/client-rekognition'
import type { Region } from '@hold/domain'

// Finding the faces in a photograph, so the display copy can blur them (architecture.md section 9.3).
export type FaceFinder = { find(image: Buffer): Promise<readonly Region[]> }

type Client = { send: (command: DetectFacesCommand) => Promise<{ readonly FaceDetails?: readonly { readonly BoundingBox?: { readonly Left?: number; readonly Top?: number; readonly Width?: number; readonly Height?: number } }[] }> }

const clamp = (value: number) => Math.min(1, Math.max(0, value))

// Amazon Rekognition, given the image itself, at most 5 MB, so the downscaled copy is what it is sent. A box that runs
// off the photograph is cut to its edge.
export function createRekognitionFaces(options: { readonly region: string; readonly client?: Client }): FaceFinder {
  const client: Client = options.client ?? new RekognitionClient({ region: options.region })
  return {
    async find(image) {
      const reply = await client.send(new DetectFacesCommand({ Image: { Bytes: image }, Attributes: ['DEFAULT'] }))
      return (reply.FaceDetails ?? []).flatMap((face) => {
        const box = face.BoundingBox
        if (box?.Left === undefined || box.Top === undefined || box.Width === undefined || box.Height === undefined) return []
        const x = clamp(box.Left)
        const y = clamp(box.Top)
        return [{ x, y, width: clamp(box.Left + box.Width) - x, height: clamp(box.Top + box.Height) - y }]
      })
    },
  }
}

export const noFaces: FaceFinder = { find: () => Promise.resolve([]) }
