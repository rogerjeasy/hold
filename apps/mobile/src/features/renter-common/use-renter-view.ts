import { use, useEffect, useEffectEvent } from 'react';
import { NavigationContext } from 'expo-router/react-navigation';
import type { RenterViewName } from '@hold/mobile-api';
import { useAnswer, type Loadable } from '@/api';
import { readRenterIncident, readRenterView } from './renter-api';

// How often a screen looks again while it waits on something that changes by itself (a photograph being prepared, a
// price a person has not confirmed yet, PayPal settling), and for how long before it leaves that to a retry.
const LOOK_AGAIN_EVERY_MS = 5_000;
const LOOK_AGAIN_FOR_MS = 10 * 60_000;

// Reads again when the renter comes back to the screen, so a list shows the report they just made.
function useReadAgainOnReturn(retry: () => void) {
  const navigation = use(NavigationContext);
  const onReturn = useEffectEvent(retry);
  useEffect(() => {
    if (navigation === undefined) return undefined;
    // Only a return counts: the renter left this screen for another and came back.
    let away = false;
    const offBlur = navigation.addListener('blur', () => {
      away = true;
    });
    const offFocus = navigation.addListener('focus', () => {
      if (!away) return;
      away = false;
      onReturn();
    });
    return () => {
      offBlur();
      offFocus();
    };
  }, [navigation]);
}

// Reads again every few seconds while `waiting`, and stops after a while.
export function useLookAgain(waiting: boolean, retry: () => void) {
  const again = useEffectEvent(retry);
  useEffect(() => {
    if (!waiting) return undefined;
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > LOOK_AGAIN_FOR_MS) clearInterval(timer);
      else again();
    }, LOOK_AGAIN_EVERY_MS);
    return () => clearInterval(timer);
  }, [waiting]);
}

export function useRenterView<Name extends RenterViewName>(token: string, name: Name) {
  const loaded = useAnswer(`${name}:${token}`, (api) => readRenterView(api, token, name));
  useReadAgainOnReturn(loaded.retry);
  return loaded;
}

export function useRenterIncident(token: string, incidentId: string) {
  const loaded = useAnswer(`incident:${token}:${incidentId}`, (api) => readRenterIncident(api, token, incidentId));
  useReadAgainOnReturn(loaded.retry);
  return loaded;
}

// A view Hold answers not_found for means "not yet" (no claim yet, no advocate yet): the screen's empty state, not a
// broken link. The other failures stay failures.
export function notYetAsEmpty<Value>(state: Loadable<Value>, also: readonly string[] = []): Loadable<Value | null> {
  if (state.status === 'failed' && (state.failure === 'not_found' || also.includes(state.failure))) return { status: 'ready', value: null, refreshing: false };
  return state;
}
