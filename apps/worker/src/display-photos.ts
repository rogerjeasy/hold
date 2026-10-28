import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { PhotoReader } from '@hold/negotiate'

type Client = { send: (command: GetObjectCommand) => Promise<{ readonly Body?: { transformToByteArray: () => Promise<Uint8Array> } }> }

// The display copies of a claim's photographs, for the advocates to look at (extensions.md section 9.13). Read only,
// from the display bucket alone; a copy that is missing is no photograph, never an error that stops the move.
export function displayPhotoReader(options: { readonly region: string; readonly bucket: string; readonly client?: Client }): PhotoReader {
  const client: Client = options.client ?? new S3Client({ region: options.region })
  return async (key) => {
    try {
      const object = await client.send(new GetObjectCommand({ Bucket: options.bucket, Key: key }))
      const bytes = await object.Body?.transformToByteArray()
      return bytes === undefined ? null : { mediaType: 'image/jpeg', data: Buffer.from(bytes).toString('base64') }
    } catch {
      return null
    }
  }
}
