'use client'

import { useLocale } from 'next-intl'
import { putWithProgress } from '@/features/handover/put-with-progress'
import { uploadPhoto, wait } from '@/features/handover/upload-photo'
import type { UploadTaken } from '@/features/handover/photo-taker'
import { confirmPhotoUpload, requestPhotoUpload } from './actions'

export function useReturnUpload(sessionId: string, view: string): UploadTaken {
  const locale = useLocale()
  return (blob, measures, onProgress, simulated) => uploadPhoto({ target: { sessionId }, view, blob, measures, locale, onProgress, simulated }, { request: requestPhotoUpload, confirm: confirmPhotoUpload, put: putWithProgress, wait })
}
