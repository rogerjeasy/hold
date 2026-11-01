import { useLocalSearchParams } from 'expo-router';
import { IncidentScreen } from '@/features/renter-incident/incident-screen';

export default function IncidentRoute() {
  const { token, incidentId } = useLocalSearchParams<{ token: string; incidentId: string }>();
  return <IncidentScreen token={token} incidentId={incidentId} />;
}
