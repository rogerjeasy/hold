'use client'

import { useLocale } from 'next-intl'
import type { UploadTaken } from '@/features/handover/photo-taker'
import { putWithProgress } from '@/features/handover/put-with-progress'
import { uploadPhoto, wait } from '@/features/handover/upload-photo'
import { confirmSelfReturnUpload, requestSelfReturnUpload } from './renter-actions'

// Uploads a photograph of the returned item, through the renter's own link, into their return's locked session.
export function useSelfReturnUpload(token: string, sessionId: string, view: string): UploadTaken {
  const locale = useLocale()
  return (blob, measures, onProgress, simulated) => uploadPhoto({ target: { token, sessionId }, view, blob, measures, locale, onProgress, simulated }, { request: requestSelfReturnUpload, confirm: confirmSelfReturnUpload, put: putWithProgress, wait })
}
