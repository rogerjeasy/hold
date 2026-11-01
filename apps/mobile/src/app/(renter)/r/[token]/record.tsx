import { useLocalSearchParams } from 'expo-router';
import { RecordScreen } from '@/features/renter-record/record-screen';

export default function RecordRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <RecordScreen token={token} />;
}
