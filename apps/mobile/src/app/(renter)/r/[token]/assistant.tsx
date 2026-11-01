import { useLocalSearchParams } from 'expo-router';
import { AssistantScreen } from '@/features/renter-assistant/assistant-screen';

export default function AssistantRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <AssistantScreen token={token} />;
}
