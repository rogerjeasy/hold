import type { ReactNode } from 'react';
import type { Loadable } from '@/api';
import { LoadState, Screen } from '@/components/ui';

type LoadedScreenProps<Value> = {
  state: Loadable<Value>;
  onRetry: () => void;
  empty: { title: string; body: string; action?: ReactNode };
  isEmpty?: (value: Value) => boolean;
  // The screen once its answer is in. It draws its own <Screen>, so its main action can sit in the footer.
  children: (value: Value) => ReactNode;
};

// A renter screen's four states. Loading, a failure and nothing-yet each fill a plain screen; the answer itself is
// drawn by the screen, which keeps its form state while the answer is read again.
export function LoadedScreen<Value>({ state, onRetry, empty, isEmpty, children }: LoadedScreenProps<Value>) {
  if (state.status === 'ready' && !(isEmpty?.(state.value) ?? false)) return <>{children(state.value)}</>;
  return (
    <Screen>
      <LoadState state={state} onRetry={onRetry} empty={empty} isEmpty={isEmpty}>
        {() => null}
      </LoadState>
    </Screen>
  );
}
