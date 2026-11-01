import { useLocalSearchParams } from 'expo-router';
import { ClaimScreen } from '@/features/renter-claim/claim-screen';

export default function ClaimRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <ClaimScreen token={token} />;
}
