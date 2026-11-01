import { useLocalSearchParams } from 'expo-router';
import { ConditionScreen } from '@/features/renter-condition/condition-screen';

export default function ConditionRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <ConditionScreen token={token} />;
}
