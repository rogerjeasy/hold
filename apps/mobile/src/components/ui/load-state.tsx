import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslations } from 'use-intl';
import type { ClientFailure, Loadable } from '@/api';
import { useTheme } from '@/theme';
import { Button } from './button';
import { Notice } from './notice';
import { Text } from './text';

// Failures that may pass by themselves. Trying again after any other refusal would only get the same answer.
const PASSING: ReadonlySet<ClientFailure> = new Set(['offline', 'timeout', 'unexpected', 'rate_limited']);

type LoadStateProps<Value> = {
  state: Loadable<Value>;
  onRetry: () => void;
  // What to say when the answer holds nothing to show, and what the person can do about it.
  empty: { title: string; body: string; action?: ReactNode };
  isEmpty?: (value: Value) => boolean;
  children: (value: Value) => ReactNode;
};

// The four states of a screen that reads from Hold: loading, failed, empty and ready. Never a blank screen, and never
// "nothing here" while the first answer is still on its way.
export function LoadState<Value>({ state, onRetry, empty, isEmpty, children }: LoadStateProps<Value>) {
  const t = useTranslations();
  const { color } = useTheme();
  if (state.status === 'loading') {
    return (
      <View className="items-center py-12">
        <ActivityIndicator color={color.mutedForeground} aria-label={t('common.loading')} />
      </View>
    );
  }
  if (state.status === 'failed') {
    return (
      <View className="gap-4">
        <Notice tone="warning" announced title={t(`loadState.${state.failure}.title`)} body={t(`loadState.${state.failure}.body`)} />
        {PASSING.has(state.failure) ? <Button variant="secondary" label={t('common.retry')} onPress={onRetry} className="self-start" /> : null}
      </View>
    );
  }
  if (isEmpty?.(state.value)) {
    return (
      <View className="gap-3 py-6">
        <Text variant="title" role="heading">
          {empty.title}
        </Text>
        <Text tone="muted">{empty.body}</Text>
        {empty.action}
      </View>
    );
  }
  return <>{children(state.value)}</>;
}
