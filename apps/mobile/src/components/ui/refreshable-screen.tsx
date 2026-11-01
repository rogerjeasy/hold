import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';

// A screen of things that change while it is open (the day at the counter, a list of rentals): pulled down, it reads
// again. Under a native header, with the same margins and tablet column as Screen. No keyboard handling: a screen
// with a form uses Screen.
export function RefreshableScreen({ children, refreshing, onRefresh }: { children: ReactNode; refreshing: boolean; onRefresh: () => void }) {
  const insets = useSafeAreaInsets();
  const { color } = useTheme();
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.mutedForeground} colors={[color.primary]} />}
      contentContainerStyle={{ paddingTop: 16, paddingBottom: insets.bottom + 24, paddingLeft: insets.left + 16, paddingRight: insets.right + 16, flexGrow: 1 }}
    >
      <View className="w-full max-w-content flex-1 gap-6 self-center">{children}</View>
    </ScrollView>
  );
}
