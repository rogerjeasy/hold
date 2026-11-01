import { Stack } from 'expo-router';
import { useTranslations } from 'use-intl';
import { useKeepOpenedRental } from '@/features/renter-entry/use-keep-opened-rental';
import { useStackOptions } from '@/theme/stack-options';

// The renter's side. Every rental screen is a route under r/[token], the same path as the web's renter link, so a
// link from outside opens the right one.
export default function RenterLayout() {
  const t = useTranslations();
  const options = useStackOptions();
  useKeepOpenedRental();
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="rentals" options={{ title: t('rentals.title'), headerLargeTitleEnabled: true }} />
      <Stack.Screen
        name="add-link"
        options={{ title: t('addLink.title'), presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true }}
      />
      <Stack.Screen name="scan" options={{ title: t('scan.title'), presentation: 'modal' }} />
      <Stack.Screen name="r/[token]/index" options={{ title: t('rental.title') }} />
      <Stack.Screen name="r/[token]/pay" options={{ title: t('pay.hold.title') }} />
      <Stack.Screen name="r/[token]/paid" options={{ title: t('pay.paid.title') }} />
      <Stack.Screen name="r/[token]/condition" options={{ title: t('condition.title') }} />
      <Stack.Screen name="r/[token]/extend" options={{ title: t('extend.title') }} />
      <Stack.Screen name="r/[token]/extended" options={{ title: t('extend.extended.title') }} />
      <Stack.Screen name="r/[token]/incident/index" options={{ title: t('incident.title') }} />
      <Stack.Screen name="r/[token]/incident/[incidentId]" options={{ title: t('incident.reportScreenTitle') }} />
      <Stack.Screen name="r/[token]/return" options={{ title: t('selfReturn.title') }} />
      <Stack.Screen name="r/[token]/claim" options={{ title: t('claim.title') }} />
      <Stack.Screen name="r/[token]/negotiation" options={{ title: t('negotiation.title') }} />
      <Stack.Screen name="r/[token]/record" options={{ title: t('record.title') }} />
      <Stack.Screen name="r/[token]/trust" options={{ title: t('trust.title') }} />
      <Stack.Screen name="r/[token]/assistant" options={{ title: t('assistant.title') }} />
      <Stack.Screen name="r/[token]/contact" options={{ title: t('contact.title') }} />
    </Stack>
  );
}
