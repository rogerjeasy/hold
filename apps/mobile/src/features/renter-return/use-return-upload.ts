import { useCallback } from 'react';
import { useApi } from '@/api';
import type { Photo } from '@/components/camera';
import { actAsRenter, sendPhoto } from '@/features/renter-common';

// Uploads a photograph of the returned item, through the renter's own link, into their return's locked session.
export function useReturnUpload(token: string, sessionId: string) {
  const api = useApi();
  return useCallback(
    (photo: Photo, view: string) =>
      sendPhoto(photo, view, {
        request: (fields) => actAsRenter(api, token, 'request-self-return-upload', { sessionId, ...fields }),
        confirm: (fields) => actAsRenter(api, token, 'confirm-self-return-upload', { sessionId, ...fields }),
      }),
    [api, token, sessionId],
  );
}
