import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import type { RenterIncidentView } from '@hold/mobile-api';
import { Screen, Text } from '@/components/ui';
import { LoadedScreen, Quoted, ShopLine, useLookAgain, useRenterIncident } from '@/features/renter-common';
import { IncidentOutcomePanel } from './incident-outcome-panel';
import { IncidentWriting } from './incident-writing';

// One report during the rental: the renter's words, then the photographs while it is written, then what the sorting
// found and the next step.
export function IncidentScreen({ token, incidentId }: { token: string; incidentId: string }) {
  const t = useTranslations('incident');
  const { state, retry } = useRenterIncident(token, incidentId);
  return (
    <LoadedScreen state={state} onRetry={retry} empty={{ title: t('title'), body: t('closed') }}>
      {(view) => <Report token={token} view={view} refresh={retry} />}
    </LoadedScreen>
  );
}

function Report({ token, view, refresh }: { token: string; view: RenterIncidentView; refresh: () => void }) {
  const { incident } = view;
  const writing = incident.sentAt === null;
  // Photographs still being prepared, or a price a staff member has not confirmed yet: the screen looks again itself.
  useLookAgain(
    writing ? view.capture.photos.some((photo) => photo.url === null) : incident.state === 'reported' || (incident.state === 'triaged' && incident.offer === null),
    refresh,
  );
  const top = <ReportTop shopName={view.shopName} incident={incident} />;
  if (writing) return <IncidentWriting token={token} view={view} top={top} refresh={refresh} />;
  return (
    <Screen>
      {top}
      <IncidentOutcomePanel token={token} incident={incident} refresh={refresh} />
    </Screen>
  );
}

function ReportTop({ shopName, incident }: { shopName: string; incident: RenterIncidentView['incident'] }) {
  const t = useTranslations('incident');
  return (
    <View className="gap-4">
      <View className="gap-2">
        <ShopLine shopName={shopName} simulated={incident.simulated} />
        <Text variant="title" role="heading">
          {t('reportTitle', { item: incident.itemLabel })}
        </Text>
      </View>
      <Quoted caption={t('yourWords')} text={incident.description} />
    </View>
  );
}
