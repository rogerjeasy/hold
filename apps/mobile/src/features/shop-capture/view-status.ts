import type { CaptureSessionView } from '@hold/mobile-api';
import type { Upload } from './use-uploads';

// Where one view stands: Hold's record first (photographed, with its display copy or while that is made), then what
// this phone is sending, then whether the plan needs it.
export type ViewStatus =
  | { readonly name: 'photographed'; readonly url: string }
  | { readonly name: 'preparing' }
  | { readonly name: 'uploading' }
  | { readonly name: 'sent' }
  | { readonly name: 'failed'; readonly reason: string }
  | { readonly name: 'needed' }
  | { readonly name: 'optional' };

export function viewStatus(session: CaptureSessionView, uploads: Readonly<Record<string, Upload>>, view: CaptureSessionView['plan'][number]): ViewStatus {
  const upload = uploads[view.key];
  // A photograph being sent again replaces the one Hold has.
  if (upload?.status === 'uploading') return { name: 'uploading' };
  if (upload?.status === 'failed') return { name: 'failed', reason: upload.reason };
  const photo = session.photos.find((each) => each.view === view.key);
  if (photo) return photo.url === null ? { name: 'preparing' } : { name: 'photographed', url: photo.url };
  if (upload?.status === 'done') return { name: 'sent' };
  return view.required ? { name: 'needed' } : { name: 'optional' };
}

// The needed views no photograph is on its way for, in the plan's order: what the camera asks for next.
export function stillToTake(session: CaptureSessionView, uploads: Readonly<Record<string, Upload>>): string[] {
  return session.plan.filter((view) => session.missing.includes(view.key) && uploads[view.key] === undefined).map((view) => view.key);
}

// Reasons a photograph cannot be sent again as it is, and must be taken again.
const RETAKE = ['not_uploaded', 'key_mismatch', 'too_large', 'unreadable'];
export const needsRetake = (reason: string) => RETAKE.includes(reason);
