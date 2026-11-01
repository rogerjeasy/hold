import { useLocalSearchParams } from 'expo-router';
import { ReturnScreen } from '@/features/renter-return/return-screen';

export default function ReturnRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <ReturnScreen token={token} />;
}
