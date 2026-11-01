import { useCallback } from 'react';
import { MISSED_VIEWS } from '@hold/domain';
import { useApi } from '@/api';
import type { Photo } from '@/components/camera';
import { actAsRenter, sendPhoto } from '@/features/renter-common';

export type MissedView = (typeof MISSED_VIEWS)[number];

// The next free view for a photograph of something staff missed, up to the last; one more replaces the last.
export const nextMissedView = (added: number): MissedView => MISSED_VIEWS[Math.min(added, MISSED_VIEWS.length - 1)] ?? 'missed-1';

// Uploads a photograph of something staff missed on one item, through the renter's own link.
export function useMissedUpload(token: string, itemId: string) {
  const api = useApi();
  return useCallback(
    (photo: Photo, view: string) => {
      const missed = missedViewNamed(view);
      return sendPhoto(photo, view, {
        request: (fields) => actAsRenter(api, token, 'request-missed-upload', { itemId, view: missed, sha256: fields.sha256, bytes: fields.bytes }),
        confirm: (fields) => actAsRenter(api, token, 'confirm-missed-upload', { ...fields, itemId, view: missed }),
      });
    },
    [api, token, itemId],
  );
}

const missedViewNamed = (view: string): MissedView => MISSED_VIEWS.find((missed) => missed === view) ?? 'missed-1';
