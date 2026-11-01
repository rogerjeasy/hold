import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from './text';

// A titled block of a screen, on a card: the web's Panel. Rows inside it are separated by hairlines, not boxed again.
export function Panel({ title, aside, children }: { title?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <View className="border border-border bg-card">
      {title === undefined ? null : (
        <View className="min-h-14 flex-row flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border px-4 py-3">
          <Text variant="heading" role="heading" className="shrink">
            {title}
          </Text>
          {aside}
        </View>
      )}
      {children}
    </View>
  );
}
