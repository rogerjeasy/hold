import { describe, expect, it } from 'vitest'
import { createRekognitionFaces, noFaces } from './faces.ts'

describe('finding faces with Rekognition', () => {
  it('asks about the image itself and gives each face as a box inside the photograph', async () => {
    const sent: { name: string; input: object }[] = []
    const client = {
      send(command: { constructor: { name: string }; input: object }) {
        sent.push({ name: command.constructor.name, input: command.input })
        return Promise.resolve({ FaceDetails: [{ BoundingBox: { Left: 0.4, Top: 0.1, Width: 0.2, Height: 0.3 } }, { BoundingBox: { Left: 0.9, Top: -0.05, Width: 0.2, Height: 0.2 } }, {}] })
      },
    }
    const faces = await createRekognitionFaces({ region: 'us-east-1', client }).find(Buffer.from('image'))
    expect(sent[0]).toMatchObject({ name: 'DetectFacesCommand', input: { Image: { Bytes: Buffer.from('image') }, Attributes: ['DEFAULT'] } })
    // Fractions, compared to a millionth.
    const rounded = faces.map((face) => Object.fromEntries(Object.entries(face).map(([key, value]) => [key, Math.round(value * 1e6) / 1e6])))
    expect(rounded).toEqual([
      { x: 0.4, y: 0.1, width: 0.2, height: 0.3 },
      { x: 0.9, y: 0, width: 0.1, height: 0.15 },
    ])
  })

  it('finds none in the fake, for tests and the test environment', async () => {
    expect(await noFaces.find(Buffer.from('image'))).toEqual([])
  })
})
