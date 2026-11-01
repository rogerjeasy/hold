import { useState } from 'react';
import * as Haptics from 'expo-haptics';
import type { TurnedOn } from '@/push/registration';
import type { PushProblem } from './push-card';

// Turning notifications on or off from a card: busy while it runs, and what went wrong, if anything.
export function usePushToggle() {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<PushProblem | undefined>(undefined);
  const run = async (work: () => Promise<TurnedOn | void>) => {
    if (busy) return;
    setBusy(true);
    setProblem(undefined);
    const outcome = await work();
    setBusy(false);
    if (outcome !== undefined && outcome !== 'on') setProblem(outcome);
    void Haptics.notificationAsync(outcome === undefined || outcome === 'on' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
  };
  return { busy, problem, run };
}
