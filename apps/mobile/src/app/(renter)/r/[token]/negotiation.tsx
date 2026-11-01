import { useLocalSearchParams } from 'expo-router';
import { NegotiationScreen } from '@/features/renter-negotiation/negotiation-screen';

export default function NegotiationRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <NegotiationScreen token={token} />;
}
