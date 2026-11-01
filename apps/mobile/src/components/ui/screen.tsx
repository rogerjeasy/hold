import type { ReactNode } from 'react';
import { View } from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ScreenProps = {
  children: ReactNode;
  // The screen's main action, kept above the keyboard and the home indicator (AGENTS.md section 9).
  footer?: ReactNode;
  // A screen under a native header lets the header handle the top; one without it (the start screen) pads for the
  // status bar itself.
  header?: boolean;
};

// The scrolling body of a screen: safe areas on every side, the keyboard never covering the focused field or the main
// action, and on a tablet a centred column no wider than a page of text.
export function Screen({ children, footer, header = true }: ScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-background">
      <KeyboardAwareScrollView
        contentInsetAdjustmentBehavior={header ? 'automatic' : 'never'}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
        contentContainerStyle={{
          paddingTop: header ? 16 : insets.top + 24,
          paddingBottom: footer ? 24 : insets.bottom + 24,
          paddingLeft: insets.left + 16,
          paddingRight: insets.right + 16,
          flexGrow: 1,
        }}
      >
        <View className="w-full max-w-content flex-1 gap-6 self-center">{children}</View>
      </KeyboardAwareScrollView>
      {footer ? (
        <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
          <View
            className="border-t border-border bg-background pt-3"
            style={{ paddingBottom: insets.bottom + 12, paddingLeft: insets.left + 16, paddingRight: insets.right + 16 }}
          >
            <View className="w-full max-w-content gap-3 self-center">{footer}</View>
          </View>
        </KeyboardStickyView>
      ) : null}
    </View>
  );
}
