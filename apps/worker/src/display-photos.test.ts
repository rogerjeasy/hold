import { GetObjectCommand } from '@aws-sdk/client-s3'
import { SAMPLE_PHOTOS } from '@hold/db'
import { describe, expect, it } from 'vitest'
import { displayPhotoReader } from './display-photos.ts'

describe('the advocates’ photographs', () => {
  it('reads a display copy from the display bucket as a JPEG image, and gives nothing for one that cannot be read', async () => {
    const asked: GetObjectCommand[] = []
    const reader = displayPhotoReader({ region: 'us-east-1', bucket: 'hold-display', client: { send: (command) => { asked.push(command); return command.input.Key === 'missing.jpg' ? Promise.reject(Object.assign(new Error('gone'), { name: 'NoSuchKey' })) : Promise.resolve({ Body: { transformToByteArray: () => Promise.resolve(new Uint8Array([0xff, 0xd8, 0xff])) } }) } } })
    expect(await reader('display/one.jpg')).toEqual({ mediaType: 'image/jpeg', data: '/9j/' })
    expect(await reader('missing.jpg')).toBeNull()
    expect(asked.map((command) => command.input)).toEqual([{ Bucket: 'hold-display', Key: 'display/one.jpg' }, { Bucket: 'hold-display', Key: 'missing.jpg' }])
  })

  it('reads a sample rental\'s photograph from the demonstration\'s own file beside the code, which no bucket holds', async () => {
    const files: string[] = []
    const reader = displayPhotoReader({ region: 'us-east-1', bucket: 'hold-display', client: { send: () => Promise.reject(new Error('A sample is not in the bucket.')) }, readSample: (file) => { files.push(file); return Promise.resolve(Buffer.from([0xff, 0xd8, 0xff])) } })
    expect(await reader(SAMPLE_PHOTOS.damage)).toEqual({ mediaType: 'image/jpeg', data: '/9j/' })
    expect(files).toEqual(['sample-return-damage.jpg'])
  })
})
