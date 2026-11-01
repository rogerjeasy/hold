import { Stack } from 'expo-router';
import { useStackOptions } from '@/theme/stack-options';
import { AccountButton } from './account-button';

// One tab of the counter: its own stack, so it has the platform's large title and the account button.
export function TabStack({ title }: { title: string }) {
  const options = useStackOptions();
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="index" options={{ title, headerLargeTitleEnabled: true, headerRight: () => <AccountButton /> }} />
    </Stack>
  );
}
