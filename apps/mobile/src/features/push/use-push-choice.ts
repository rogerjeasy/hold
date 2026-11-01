import { useEffect, useState } from 'react';
import { pushStore } from '@/push/push-store';

// What the person chose for notifications, read from this phone's store and kept current as it changes. Undefined
// while the store is first read; 'offer' while they have not chosen.
export function usePushChoice(read: () => Promise<'on' | 'off' | undefined>): 'offer' | 'on' | 'off' | undefined {
  const [choice, setChoice] = useState<'offer' | 'on' | 'off' | undefined>(undefined);
  useEffect(() => {
    let open = true;
    const load = () => void read().then((value) => open && setChoice(value ?? 'offer'));
    load();
    const stop = pushStore.subscribe(load);
    return () => {
      open = false;
      stop();
    };
  }, [read]);
  return choice;
}
