import { useState } from 'react';
import { Share } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as WebBrowser from 'expo-web-browser';
import { useApi } from '@/api';
import { actAsRenter, type ActionFailed } from '@/features/renter-common';

type Kind = 'pdf' | 'manifest';
type Busy = `${'open' | 'share'}-${Kind}`;

// A record file reaches the phone through a short-lived signed link Hold gives on request. Open shows it in the system's
// in-app viewer, which reads a PDF and has its own share button. Share saves a copy in the phone's cache and hands the
// file itself to the share sheet on iOS; Android's share sheet takes only text, so it gets the link.
export function useRecordFile(token: string, packId: string) {
  const api = useApi();
  const [busy, setBusy] = useState<Busy | undefined>(undefined);
  const [failed, setFailed] = useState<ActionFailed | undefined>(undefined);

  const link = async (kind: Kind) => {
    setFailed(undefined);
    const answer = await actAsRenter(api, token, 'download-renter-record', { packId, kind });
    if (!answer.ok) setFailed(answer);
    return answer.ok ? answer.value : undefined;
  };

  const run = async (name: Busy, task: () => Promise<void>) => {
    setBusy(name);
    try {
      await task();
    } catch {
      setFailed({ ok: false, failure: 'unexpected' });
    } finally {
      setBusy(undefined);
    }
  };

  const open = (kind: Kind) =>
    run(`open-${kind}`, async () => {
      const file = await link(kind);
      if (file) await WebBrowser.openBrowserAsync(file.url, { dismissButtonStyle: 'done', enableBarCollapsing: true });
    });

  const share = (kind: Kind) =>
    run(`share-${kind}`, async () => {
      const file = await link(kind);
      if (file === undefined) return;
      if (process.env.EXPO_OS === 'ios') {
        const saved = await File.downloadFileAsync(file.url, new File(Paths.cache, file.filename), { idempotent: true });
        await Share.share({ url: saved.uri, title: file.filename });
      } else {
        await Share.share({ message: file.url, title: file.filename });
      }
    });

  return { open, share, busy, failed };
}
