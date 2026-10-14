import { evidencePhoto } from './evidence-photo'

// The six views of an e-bike, in the order staff are led through them. docs/project-description.md section 5.
export const photoPlanKeys = ['frameLeft', 'frameRight', 'frontWheel', 'rearWheel', 'display', 'battery'] as const

export type PhotoPlanKey = (typeof photoPlanKeys)[number]

// The illustration stops at the third view: two are taken, one is in the viewfinder, three are still to come.
export const capturedViews: Partial<Record<PhotoPlanKey, { viewBox: string; mirrored: boolean }>> = {
  frameLeft: { viewBox: evidencePhoto.crops.frame, mirrored: false },
  frameRight: { viewBox: evidencePhoto.crops.frame, mirrored: true },
}

export const currentView: PhotoPlanKey = 'frontWheel'
