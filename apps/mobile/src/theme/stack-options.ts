import type { ComponentProps } from 'react';
import type { Stack } from 'expo-router';
import { font } from '@hold/design-tokens';
import { useTheme } from './index';

type StackOptions = NonNullable<ComponentProps<typeof Stack>['screenOptions']>;

// Every stack's native header in Hold's type and colours: Archivo headlines, no shadow line, the back button as the
// platform draws it. One home, so the renter's and the shop's stacks look the same.
export function useStackOptions(): StackOptions {
  const { color } = useTheme();
  return {
    headerTitleStyle: { fontFamily: font.display, color: color.foreground },
    headerLargeTitleStyle: { fontFamily: font.display, color: color.foreground },
    headerStyle: { backgroundColor: color.background },
    headerTintColor: color.foreground,
    headerShadowVisible: false,
    headerBackButtonDisplayMode: 'minimal',
    contentStyle: { backgroundColor: color.background },
  };
}
