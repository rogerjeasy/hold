import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import type { RenterIncidentView } from '@hold/mobile-api';
import { Icon, MoneyText, Notice, Panel, SampleLabel, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { IncidentAgree } from './incident-agree';
import { outcomeOf } from './incident-outcome';
import { IncidentTheft } from './incident-theft';

type Incident = RenterIncidentView['incident'];

// The result of the sorting, as the renter sees it: a fixed message for each kind, the confirmed price and the way to
// agree it for small damage, the fixed steps for a theft. For anything unsafe or unclear, the fixed message alone.
export function IncidentOutcomePanel({ token, incident, refresh }: { token: string; incident: Incident; refresh: () => void }) {
  const t = useTranslations('incident.outcome');
  const { color } = useTheme();
  const outcome = outcomeOf(incident);
  if (outcome === 'unsafe') {
    return (
      <View role="alert" className="gap-3 border-2 border-destructive bg-card p-4">
        <View className="flex-row items-center gap-2">
          <Icon name="error" color={color.destructive} size={24} />
          <Text variant="heading" role="heading" className="min-w-0 flex-1">
            {t('unsafe.title')}
          </Text>
        </View>
        <Text>{t('unsafe.stop')}</Text>
        <Text>{t('unsafe.contact')}</Text>
        <Text variant="bodyStrong">{t('unsafe.emergency')}</Text>
      </View>
    );
  }
  const offer = incident.offer;
  return (
    <Panel title={t(`${outcome}.title`)}>
      <View className="gap-4 p-4">
        {incident.simulated ? (
          <View className="flex-row flex-wrap items-center gap-2">
            <SampleLabel />
            <Text variant="small" tone="muted" className="min-w-0 flex-1">
              {t('simulated')}
            </Text>
          </View>
        ) : null}
        {outcome === 'offer' && offer !== null ? (
          <View className="gap-1">
            <Text tone="muted">{t('offer.priceFor', { description: offer.description })}</Text>
            <MoneyText money={{ cents: offer.amountCents, currency: offer.currency }} variant="figure" />
            <Text>{t('offer.body')}</Text>
          </View>
        ) : (
          <Text>{t(`${outcome}.body`)}</Text>
        )}
        {outcome === 'pricing' && incident.confirmation !== null ? <Text selectable>{incident.confirmation}</Text> : null}
        {outcome === 'offer' && offer !== null ? <IncidentAgree token={token} incidentId={incident.id} price={{ cents: offer.amountCents, currency: offer.currency }} refresh={refresh} /> : null}
        {outcome === 'agreed' && incident.agreedCents !== null ? (
          <Notice tone="success" title={t('agreed.amountLabel')} body={t('agreed.notCharged')}>
            <MoneyText money={{ cents: incident.agreedCents, currency: incident.currency }} variant="figure" />
          </Notice>
        ) : null}
        {outcome === 'theft' ? <IncidentTheft token={token} incidentId={incident.id} details={incident.theftDetails} refresh={refresh} /> : null}
      </View>
    </Panel>
  );
}
