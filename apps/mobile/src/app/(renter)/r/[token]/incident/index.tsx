import { useLocalSearchParams } from 'expo-router';
import { IncidentsScreen } from '@/features/renter-incident/incidents-screen';

export default function IncidentsRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <IncidentsScreen token={token} />;
}
