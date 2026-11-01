import { useCallback, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import type { RenterActionInput, RenterActionName, RenterActionOutput } from '@hold/mobile-api';
import { useApi, type Answer } from '@/api';
import { actAsRenter } from './renter-api';

export type ActionFailed = Extract<Answer<unknown>, { ok: false }>;

type ActionState<Value> = { readonly status: 'idle' } | { readonly status: 'pending' } | { readonly status: 'done'; readonly value: Value } | { readonly status: 'failed'; readonly failed: ActionFailed };

// One thing a renter does through their link: pending while it runs (and never sent twice at once), then done with
// Hold's answer, or failed with why. Success and refusal are felt as well as shown.
export function useRenterAction<Name extends RenterActionName>(token: string, name: Name) {
  const api = useApi();
  const [state, setState] = useState<ActionState<RenterActionOutput<Name>>>({ status: 'idle' });
  const running = useRef(false);

  const run = useCallback(
    async (input: RenterActionInput<Name>): Promise<Answer<RenterActionOutput<Name>> | undefined> => {
      if (running.current) return undefined;
      running.current = true;
      setState({ status: 'pending' });
      const answer = await actAsRenter(api, token, name, input);
      running.current = false;
      setState(answer.ok ? { status: 'done', value: answer.value } : { status: 'failed', failed: answer });
      void Haptics.notificationAsync(answer.ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
      return answer;
    },
    [api, token, name],
  );

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return {
    run,
    reset,
    pending: state.status === 'pending',
    done: state.status === 'done' ? state.value : undefined,
    failed: state.status === 'failed' ? state.failed : undefined,
  };
}
