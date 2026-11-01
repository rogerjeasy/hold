import { useState } from 'react';
import * as Haptics from 'expo-haptics';
import { useLocale } from 'use-intl';
import type { StaffActionInput, StaffActionName } from '@hold/mobile-api';
import { useApi } from '@/api';
import type { Refusal } from './refusal';
import { staffAct } from './staff-request';

// One of the counter's quick actions from a screen: which one is running, so its button shows it, and why the last
// one was refused, if it was. A refusal is felt as well as shown. Nothing is retried on its own.
export function useStaffAction() {
  const api = useApi();
  const locale = useLocale();
  const [pending, setPending] = useState<string | undefined>(undefined);
  const [refusal, setRefusal] = useState<Refusal | undefined>(undefined);
  const act = async <Name extends StaffActionName>(name: Name, input: StaffActionInput<Name>, tag: string = name) => {
    setPending(tag);
    setRefusal(undefined);
    const answer = await staffAct(api, name, input, locale);
    setPending(undefined);
    if (!answer.ok) {
      setRefusal(answer);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    return answer;
  };
  return { act, pending, refusal, clearRefusal: () => setRefusal(undefined) };
}
