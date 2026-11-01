import { useEffect, useState } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { captureSessionSchema, type CaptureSessionView } from '@hold/mobile-api';
import { useAnswer } from '@/api';
import { LoadState, Screen } from '@/components/ui';
import { staffRead } from '@/features/shop-session/staff-request';
import { useRefreshOnFocus } from '@/features/shop-session/use-refresh-on-focus';
import { useSessionKey } from '@/features/shop-session/use-session-key';
import { CaptureCamera } from './capture-camera';
import { SessionOverview } from './session-overview';
import { useUploads } from './use-uploads';
import { stillToTake } from './view-status';

// Display copies are made by Hold's worker within seconds; until they are, the screen looks again this often.
const LOOK_AGAIN_MS = 3000;

// One item's handover or return (architecture.md section 11.2): each view photographed in turn, the camera moving on
// to the next while the last one uploads, then sealed. At a return, the handover's photograph shows faintly over the
// camera to match the angle.
export function SessionScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const path = `shop/sessions/${encodeURIComponent(sessionId)}`;
  const { state, retry } = useAnswer(`${path}:${useSessionKey()}`, (api) => staffRead(api, path, captureSessionSchema));
  useRefreshOnFocus(retry);
  const preparing = state.status === 'ready' && state.value.photos.some((photo) => photo.url === null);
  useEffect(() => {
    if (!preparing) return;
    const timer = setTimeout(retry, LOOK_AGAIN_MS);
    return () => clearTimeout(timer);
  }, [preparing, state, retry]);
  if (state.status !== 'ready') {
    return (
      <Screen>
        <LoadState state={state} onRetry={retry} empty={{ title: '', body: '' }}>
          {() => null}
        </LoadState>
      </Screen>
    );
  }
  return <Session session={state.value} reload={retry} />;
}

function Session({ session, reload }: { session: CaptureSessionView; reload: () => void }) {
  const { uploads, upload, retry } = useUploads(session, reload);
  const [camera, setCamera] = useState<string | undefined>(undefined);
  const accept = (view: string, uri: string) => {
    upload(view, uri);
    // On to the next needed view while this one uploads; back to the list once every one is taken.
    setCamera(stillToTake(session, { ...uploads, [view]: { status: 'uploading' } })[0]);
  };
  return (
    <>
      <Stack.Screen options={{ title: session.itemLabel, headerShown: camera === undefined }} />
      {camera === undefined ? (
        <SessionOverview session={session} uploads={uploads} onPhotograph={setCamera} onRetry={retry} />
      ) : (
        <CaptureCamera session={session} view={camera} onAccept={(uri) => accept(camera, uri)} onClose={() => setCamera(undefined)} />
      )}
    </>
  );
}
