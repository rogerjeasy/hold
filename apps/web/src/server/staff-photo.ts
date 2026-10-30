import 'server-only'
import { randomUUID } from 'node:crypto'
import { captureSession, recordPhoto } from '@hold/db'
import { MAX_PHOTO_BYTES } from '@hold/evidence'
import { z } from 'zod'
import { sendMediaMessage } from './media'
import { getServices } from './services'
import { Refusal, shopAction, withLocale } from './shop-access'

export const CAPTURE_STAFF = ['owner', 'manager', 'counter_staff'] as const
const photoFields = { sessionId: z.uuid(), view: z.string().min(1).max(64) }

// Staff's handover, return and repair use the same upload contract and evidence store. The action binds the session kind;
// changing the id can never turn a return photograph into a handover baseline.
export function staffPhotoActions(kind: 'handover' | 'return' | 'repair') {
  const request = shopAction({ name: `${kind}.upload_requested`, roles: CAPTURE_STAFF, needsPasskey: false, input: withLocale({ ...photoFields, sha256: z.string().regex(/^[0-9a-f]{64}$/), bytes: z.coerce.number().int().min(1).max(MAX_PHOTO_BYTES) }) },
    async (context, input, transaction) => {
      const session = await captureSession(transaction, input.sessionId)
      if (session?.kind !== kind) return new Refusal('not_found')
      if (session.sealedAt !== null) return new Refusal('sealed')
      if (!session.plan.some((view) => view.key === input.view)) return new Refusal('unknown_view')
      const { evidence } = await getServices()
      if (evidence === undefined) return new Refusal('storage_unavailable')
      const key = `${context.shop.id}/${input.sessionId}/${input.view}/${randomUUID()}.jpg`
      const link = await evidence.uploadLink({ key, sha256: input.sha256, bytes: input.bytes })
      return { key, url: link.url, headers: link.headers }
    })
  const confirm = shopAction({ name: `${kind}.photo_recorded`, roles: CAPTURE_STAFF, needsPasskey: false, input: withLocale({ ...photoFields, key: z.string().min(1).max(300), sharpness: z.coerce.number().min(0).max(1_000_000), shadows: z.coerce.number().min(0).max(255), highlights: z.coerce.number().min(0).max(255), filled: z.coerce.number().min(0).max(1) }) },
    async (context, input, transaction) => {
      const session = await captureSession(transaction, input.sessionId)
      if (session?.kind !== kind) return new Refusal('not_found')
      if (session.sealedAt !== null) return new Refusal('sealed')
      if (!input.key.startsWith(`${context.shop.id}/${input.sessionId}/${input.view}/`)) return new Refusal('key_mismatch')
      const { evidence } = await getServices()
      if (evidence === undefined) return new Refusal('storage_unavailable')
      const stored = await evidence.stored(input.key)
      if (stored === undefined) return new Refusal('not_uploaded')
      if (stored.bytes > MAX_PHOTO_BYTES) return new Refusal('too_large')
      const recorded = await recordPhoto(transaction, input.sessionId, { view: input.view, evidenceKey: input.key, sha256: stored.sha256, quality: { sharpness: input.sharpness, shadows: input.shadows, highlights: input.highlights, filled: input.filled } }, new Date())
      return recorded.ok ? { photoId: recorded.photoId, sessionId: input.sessionId } : new Refusal(recorded.reason)
    }, (context, output) => sendMediaMessage(context.shop.id, output.sessionId, output.photoId))
  return { request, confirm }
}
