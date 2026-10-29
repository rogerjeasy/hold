'use client'

import { useLocale } from 'next-intl'
import type { UploadTaken } from '@/features/handover/photo-taker'
import { putWithProgress } from '@/features/handover/put-with-progress'
import { uploadPhoto, wait } from '@/features/handover/upload-photo'
import { confirmIncidentUpload, requestIncidentUpload } from './renter-actions'

// Uploads a photograph of what happened, through the renter's own link, into the report's locked session.
export function useIncidentUpload(token: string, incidentId: string, view: string): UploadTaken {
  const locale = useLocale()
  return (blob, measures, onProgress) => uploadPhoto({ target: { token, incidentId }, view, blob, measures, locale, onProgress }, { request: requestIncidentUpload, confirm: confirmIncidentUpload, put: putWithProgress, wait })
}
