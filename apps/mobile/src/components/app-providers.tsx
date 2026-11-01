import type { ReactNode } from 'react';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiProvider, holdApi, type ApiClient } from '@/api';
import { I18nProvider } from '@/i18n';
import { ThemeProvider } from '@/theme';

// Everything a screen needs around it, the same in the app and in its tests. A test passes a fake API.
export function AppProviders({ api, children }: { api?: ApiClient; children: ReactNode }) {
  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <I18nProvider>
          <ApiProvider api={api ?? holdApi()}>
            <ThemeProvider>{children}</ThemeProvider>
          </ApiProvider>
        </I18nProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
