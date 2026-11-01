import { useLocalSearchParams } from 'expo-router';
import { ExtendScreen } from '@/features/renter-extend/extend-screen';

export default function ExtendRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <ExtendScreen token={token} />;
}
