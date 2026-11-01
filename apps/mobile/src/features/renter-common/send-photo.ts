import type { Photo } from '@/components/camera';
import { photoFile, putPhoto, uploadPhoto, type PhotoUploaded, type PhotoUploadSteps } from '@/features/photos';

// The phone does not measure a renter's photograph before it sends it, as the web page does without a camera check:
// Hold records it as unmeasured and still refuses one that repeats earlier evidence.
const UNMEASURED = { sharpness: 0, shadows: 0, highlights: 0, filled: 0 };

const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

// One renter photograph to the locked evidence store. `request` and `confirm` are bound by the caller to the report or
// the return it belongs to.
export async function sendPhoto(photo: Photo, view: string, steps: Pick<PhotoUploadSteps, 'request' | 'confirm'>): Promise<PhotoUploaded> {
  const file = await photoFile(photo.uri);
  return uploadPhoto({ file, view, measures: UNMEASURED }, { ...steps, put: putPhoto, wait });
}
