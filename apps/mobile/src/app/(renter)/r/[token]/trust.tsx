import { useLocalSearchParams } from 'expo-router';
import { TrustScreen } from '@/features/renter-trust/trust-screen';

export default function TrustRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <TrustScreen token={token} />;
}
