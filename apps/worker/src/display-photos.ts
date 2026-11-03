import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { sampleFileOf } from '@hold/db'
import type { PhotoReader } from '@hold/negotiate'

type Client = { send: (command: GetObjectCommand) => Promise<{ readonly Body?: { transformToByteArray: () => Promise<Uint8Array> } }> }

// The display copies of a claim's photographs, for the advocates to look at (extensions.md section 9.13). Read only,
// from the display bucket alone; a copy that is missing is no photograph, never an error that stops the move. A sample
// rental's photographs are the demonstration's own images, in no bucket, so they are read from the files beside the code.
export function displayPhotoReader(options: { readonly region: string; readonly bucket: string; readonly client?: Client; readonly readSample?: (file: string) => Promise<Buffer> }): PhotoReader {
  const client: Client = options.client ?? new S3Client({ region: options.region })
  return async (key) => {
    try {
      const file = sampleFileOf(key)
      if (file !== undefined && options.readSample !== undefined) return { mediaType: 'image/jpeg', data: (await options.readSample(file)).toString('base64') }
      const object = await client.send(new GetObjectCommand({ Bucket: options.bucket, Key: key }))
      const bytes = await object.Body?.transformToByteArray()
      return bytes === undefined ? null : { mediaType: 'image/jpeg', data: Buffer.from(bytes).toString('base64') }
    } catch {
      return null
    }
  }
}
