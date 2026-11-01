import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import { useApi } from './api-context';
import type { Answer, ApiClient, ClientFailure } from './client';

// What a screen that reads from Hold shows: loading the first time, the failure and a way to try again, or the value.
// Loading again keeps the value on screen, marked as refreshing, so nothing blinks.
export type Loadable<Value> =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly failure: ClientFailure; readonly reason?: string }
  | { readonly status: 'ready'; readonly value: Value; readonly refreshing: boolean };

type Settled<Value> = { readonly key: string; readonly attempt: number; readonly state: Loadable<Value> };

const settledState = <Value,>(answer: Answer<Value>): Loadable<Value> =>
  answer.ok
    ? { status: 'ready', value: answer.value, refreshing: false }
    : { status: 'failed', failure: answer.failure, ...(answer.reason === undefined ? {} : { reason: answer.reason }) };

// Loads when the screen opens, again whenever `key` changes (another rental's token), and again on retry.
export function useAnswer<Value>(key: string, load: (api: ApiClient) => Promise<Answer<Value>>) {
  const api = useApi();
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled<Value> | undefined>(undefined);
  const ask = useEffectEvent((client: ApiClient) => load(client));

  useEffect(() => {
    // An answer that arrives after the screen asked again, or closed, is dropped.
    let wanted = true;
    void ask(api).then((answer) => {
      if (wanted) setSettled({ key, attempt, state: settledState(answer) });
    });
    return () => {
      wanted = false;
    };
  }, [api, key, attempt]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  // Until this key's answer for this attempt is in: loading, or the last value marked as refreshing.
  const state: Loadable<Value> =
    settled === undefined || settled.key !== key
      ? { status: 'loading' }
      : settled.attempt === attempt
        ? settled.state
        : settled.state.status === 'ready'
          ? { ...settled.state, refreshing: true }
          : { status: 'loading' };

  return { state, retry };
}
