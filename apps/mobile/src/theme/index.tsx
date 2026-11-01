import type { ReactNode } from 'react';
import { useColorScheme, View } from 'react-native';
import { vars } from 'nativewind';
import { ThemeProvider as NavigationThemeProvider, type Theme } from 'expo-router/react-navigation';
import { color, cssVariables, font, type ColorScheme, type Palette } from '@hold/design-tokens';

// Built once: each theme's colours as the CSS variables every `bg-*` and `text-*` class reads.
const THEME_VARIABLES: Readonly<Record<ColorScheme, ReturnType<typeof vars>>> = {
  light: vars(cssVariables('light')),
  dark: vars(cssVariables('dark')),
};

// The phone's light or dark setting, and its colours, for the few places that need a raw colour: a native header,
// a spinner, the status bar, a camera overlay. Everything else uses a class.
export function useTheme(): { scheme: ColorScheme; color: Palette } {
  const scheme: ColorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return { scheme, color: color[scheme] };
}

// Sets the theme's colour variables for everything below it. Mounted at the root, and again inside anything drawn
// outside the root tree, such as a Modal.
export function ThemeScope({ children, className = 'flex-1' }: { children: ReactNode; className?: string }) {
  const { scheme } = useTheme();
  return (
    <View style={THEME_VARIABLES[scheme]} className={className}>
      {children}
    </View>
  );
}

function navigationTheme(scheme: ColorScheme, palette: Palette): Theme {
  return {
    dark: scheme === 'dark',
    colors: {
      primary: palette.primary,
      background: palette.background,
      card: palette.background,
      text: palette.foreground,
      border: palette.border,
      notification: palette.primary,
    },
    fonts: {
      regular: { fontFamily: font.body, fontWeight: 'normal' },
      medium: { fontFamily: font.bodyMedium, fontWeight: 'normal' },
      bold: { fontFamily: font.bodyBold, fontWeight: 'normal' },
      heavy: { fontFamily: font.display, fontWeight: 'normal' },
    },
  };
}

// The app's root theme: the colour variables, the screen background, and the native headers and tabs in Hold's
// colours and type.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { scheme, color: palette } = useTheme();
  return (
    <NavigationThemeProvider value={navigationTheme(scheme, palette)}>
      <ThemeScope className="flex-1 bg-background">{children}</ThemeScope>
    </NavigationThemeProvider>
  );
}
