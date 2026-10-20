'use client'

import { useLocale } from 'next-intl'
import { confirmPhotoUpload, requestPhotoUpload } from './actions'
import type { UploadTaken } from './photo-taker'
import { putWithProgress } from './put-with-progress'
import { uploadPhoto, wait } from './upload-photo'


// Uploads a view's photograph into staff's handover session.
export function useStaffUpload(sessionId: string, view: string): UploadTaken {
  const locale = useLocale()
  return (blob, measures, onProgress, simulated) => uploadPhoto({ target: { sessionId }, view, blob, measures, locale, onProgress, simulated }, { request: requestPhotoUpload, confirm: confirmPhotoUpload, put: putWithProgress, wait })
}
