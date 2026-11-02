import type { DeclaredPhotoSource, PhotoMeasures } from '@hold/domain';
import type { Answer } from '@/api/client';

// One photograph from the phone to the locked evidence store, the way the web app sends it (architecture.md section
// 9.1): its fingerprint is signed into the upload link, so the store refuses any other file; the upload is tried
// again on weak shop wifi; then Hold reads back what arrived and records it. Who the photograph belongs to (a staff
// session, a renter's item, an incident, a self-return) is bound into `request` and `confirm` by the caller.

export type PhotoFile = { readonly uri: string; readonly bytes: number; readonly sha256: string };
export type UploadLink = { readonly key: string; readonly url: string; readonly headers: Readonly<Record<string, string>> };

export type PhotoUploadSteps = {
  request(fields: { readonly view: string; readonly sha256: string; readonly bytes: number }): Promise<Answer<UploadLink>>;
  // True once the store took the photograph.
  put(link: UploadLink, file: PhotoFile): Promise<boolean>;
  confirm(fields: { readonly view: string; readonly key: string; readonly source: DeclaredPhotoSource } & PhotoMeasures): Promise<Answer<{ readonly photoId: string }>>;
  wait(milliseconds: number): Promise<void>;
};

export type PhotoUpload = { readonly file: PhotoFile; readonly view: string; readonly measures: PhotoMeasures };
export type PhotoUploaded = { readonly ok: true; readonly photoId: string } | { readonly ok: false; readonly reason: string };

const TRIES = 3;

const reasonOf = (failed: Extract<Answer<unknown>, { ok: false }>) => (failed.failure === 'refused' ? (failed.reason ?? 'refused') : failed.failure);

export async function uploadPhoto({ file, view, measures }: PhotoUpload, steps: PhotoUploadSteps): Promise<PhotoUploaded> {
  const link = await steps.request({ view, sha256: file.sha256, bytes: file.bytes });
  if (!link.ok) return { ok: false, reason: reasonOf(link) };
  let stored = false;
  for (let attempt = 1; attempt <= TRIES && !stored; attempt += 1) {
    stored = await steps.put(link.value, file);
    if (!stored && attempt < TRIES) await steps.wait(attempt * 1000);
  }
  if (!stored) return { ok: false, reason: 'upload_failed' };
  // The phone takes evidence with its live camera only, never from the photo library.
  const confirmed = await steps.confirm({ view, key: link.value.key, source: 'camera', ...measures });
  return confirmed.ok ? { ok: true, photoId: confirmed.value.photoId } : { ok: false, reason: reasonOf(confirmed) };
}
