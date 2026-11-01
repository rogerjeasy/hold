import { useCallback } from 'react';
import { useApi } from '@/api';
import type { Photo } from '@/components/camera';
import { actAsRenter, sendPhoto } from '@/features/renter-common';

// Uploads a photograph of what happened, through the renter's own link, into the report's locked session.
export function useIncidentUpload(token: string, incidentId: string) {
  const api = useApi();
  return useCallback(
    (photo: Photo, view: string) =>
      sendPhoto(photo, view, {
        request: (fields) => actAsRenter(api, token, 'request-incident-upload', { incidentId, ...fields }),
        confirm: (fields) => actAsRenter(api, token, 'confirm-incident-upload', { incidentId, ...fields }),
      }),
    [api, token, incidentId],
  );
}
