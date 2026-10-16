import { z } from 'zod'

// What the media queue carries: a photograph whose display copy is to be made.
export const mediaMessageSchema = z.object({ shopId: z.uuid(), photoId: z.uuid() })
