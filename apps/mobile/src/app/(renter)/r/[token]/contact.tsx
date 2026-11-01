import { useLocalSearchParams } from 'expo-router';
import { ContactScreen } from '@/features/renter-contact/contact-screen';

// How Hold reaches the renter. The web shows it as a panel on the rental and the hold; here it is its own page.
export default function ContactRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <ContactScreen token={token} />;
}
