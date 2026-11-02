'use client'

import { useLocale } from 'next-intl'
import { putWithProgress } from '@/features/handover/put-with-progress'
import type { UploadTaken } from '@/features/handover/photo-taker'
import { uploadPhoto, wait } from '@/features/handover/upload-photo'
import { confirmMissedUpload, requestMissedUpload } from './actions'

// Uploads a photograph of something staff missed, through the renter's own link.
export function useRenterUpload(token: string, itemId: string, view: string): UploadTaken {
  const locale = useLocale()
  return (blob, measures, source, onProgress) => uploadPhoto({ target: { token, itemId }, view, blob, measures, source, locale, onProgress }, { request: requestMissedUpload, confirm: confirmMissedUpload, put: putWithProgress, wait })
}
