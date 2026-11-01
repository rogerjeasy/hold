import type { ReactElement } from 'react';
import { render } from '@testing-library/react-native';
import { AppProviders } from '@/components/app-providers';
import { createFakeApi, type FakeApi } from '@/test/fake-api';

// Renders a component or screen the way the app does: theme, language (English unless a test mocks useLocales),
// safe areas, the keyboard, and a fake Hold API the test can prepare and read back.
export async function renderWithProviders(ui: ReactElement, { api = createFakeApi() }: { api?: FakeApi } = {}) {
  const view = await render(<AppProviders api={api}>{ui}</AppProviders>);
  return Object.assign(view, { api });
}
