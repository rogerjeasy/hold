import { useState } from 'react';
import * as Haptics from 'expo-haptics';
import { useLocale } from 'use-intl';
import type { CaptureSessionView } from '@hold/mobile-api';
import { useApi } from '@/api';
import { photoFile, putPhoto, uploadPhoto } from '@/features/photos';
import { staffAct } from '@/features/shop-session/staff-request';

// Each view's photograph on its way to the evidence store, while the next one is being taken: uploading, uploaded,
// or not uploaded with the reason and the photograph, so it can be sent again without taking it again.
export type Upload = { readonly status: 'uploading' } | { readonly status: 'done' } | { readonly status: 'failed'; readonly reason: string; readonly uri: string };

// The phone cannot measure a photograph's pixels yet, so it sends the web's "not measured", which Hold accepts.
const UNMEASURED = { sharpness: 0, shadows: 0, highlights: 0, filled: 0 } as const;

const ACTIONS = {
  handover: { request: 'request-handover-photo', record: 'record-handover-photo' },
  return: { request: 'request-return-photo', record: 'record-return-photo' },
} as const;

const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export function useUploads(session: Pick<CaptureSessionView, 'id' | 'kind'>, onUploaded: () => void) {
  const api = useApi();
  const locale = useLocale();
  const [uploads, setUploads] = useState<Readonly<Record<string, Upload>>>({});
  const set = (view: string, upload: Upload) => setUploads((current) => ({ ...current, [view]: upload }));
  const names = ACTIONS[session.kind];

  const upload = async (view: string, uri: string) => {
    set(view, { status: 'uploading' });
    const file = await photoFile(uri).catch(() => undefined);
    if (file === undefined) return set(view, { status: 'failed', reason: 'unreadable', uri });
    const sent = await uploadPhoto(
      { file, view, measures: UNMEASURED },
      {
        request: (fields) => staffAct(api, names.request, { sessionId: session.id, ...fields }, locale),
        put: (link, photo) => putPhoto(link, photo),
        confirm: (fields) => staffAct(api, names.record, { sessionId: session.id, ...fields }, locale),
        wait,
      },
    );
    if (!sent.ok) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return set(view, { status: 'failed', reason: sent.reason, uri });
    }
    set(view, { status: 'done' });
    onUploaded();
  };

  const retry = (view: string) => {
    const failed = uploads[view];
    if (failed?.status === 'failed') void upload(view, failed.uri);
  };

  return { uploads, upload: (view: string, uri: string) => void upload(view, uri), retry };
}
