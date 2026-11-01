import { useLocalSearchParams } from 'expo-router';
import { RentalScreen } from '@/features/renter-rental/rental-screen';

export default function RentalRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <RentalScreen token={token} />;
}
