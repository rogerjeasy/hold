import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslations } from 'use-intl';
import { INCIDENT_HINTS, INCIDENT_LIMITS, type IncidentHint } from '@hold/domain';
import type { RenterView } from '@hold/mobile-api';
import { Button, ChoiceList, Field, Notice, Screen, Text } from '@/components/ui';
import { ActionFailure, LoadedScreen, ShopLine, useRenterAction, useRenterView } from '@/features/renter-common';
import { EarlierReports } from './earlier-reports';

type Incidents = RenterView<'incidents'>;

// "Something happened": the emergency number first, a new report while the renter has the items, and the reports
// they made before.
export function IncidentsScreen({ token }: { token: string }) {
  const t = useTranslations('incident');
  const { state, retry } = useRenterView(token, 'incidents');
  return (
    <LoadedScreen state={state} onRetry={retry} empty={{ title: t('title'), body: t('closed') }}>
      {(view) => <Reports token={token} view={view} />}
    </LoadedScreen>
  );
}

function Reports({ token, view }: { token: string; view: Incidents }) {
  const t = useTranslations('incident');
  const form = useStartForm(token, view);
  return (
    <Screen footer={view.open ? <Button label={t('start.continue')} onPress={form.submit} loading={form.pending} disabled={form.itemId === ''} /> : undefined}>
      <View className="gap-3">
        <ShopLine shopName={view.shopName} />
        <Text variant="lead" tone="muted">
          {t('lead')}
        </Text>
      </View>
      <Notice tone="destructive" title={t('emergencyTitle')} body={t('emergencyFirst')} />
      {view.open ? (
        <View className="gap-5">
          <Text variant="heading" role="heading">
            {t('newReport')}
          </Text>
          {view.items.length > 1 ? (
            <ChoiceList label={t('start.which')} value={form.itemId} onChange={form.setItemId} choices={view.items.map((item) => ({ value: item.itemId, label: item.label }))} />
          ) : null}
          <ChoiceList<IncidentHint> label={t('start.what')} value={form.hint} onChange={form.setHint} choices={INCIDENT_HINTS.map((hint) => ({ value: hint, label: t(`start.hints.${hint}`) }))} />
          <Field
            label={t('start.describe')}
            hint={t('start.describeHelp')}
            error={form.missingWords ? t('start.describeMissing') : undefined}
            value={form.description}
            onChangeText={form.setDescription}
            multiline
            maxLength={INCIDENT_LIMITS.descriptionLength}
            textAlignVertical="top"
          />
          <ActionFailure failed={form.failed} />
        </View>
      ) : (
        <Text>{t('closed')}</Text>
      )}
      <EarlierReports token={token} earlier={view.earlier} />
    </Screen>
  );
}

// The renter's words are stored before anything else, so nothing they wrote is lost if the photographs fail.
function useStartForm(token: string, view: Incidents) {
  const report = useRenterAction(token, 'report-incident');
  const [itemId, setItemId] = useState(view.items[0]?.itemId ?? '');
  const [hint, setHint] = useState<IncidentHint>(INCIDENT_HINTS[0]);
  const [description, setDescription] = useState('');
  const [missingWords, setMissingWords] = useState(false);
  const submit = async () => {
    if (description.trim() === '') {
      setMissingWords(true);
      return;
    }
    setMissingWords(false);
    const answer = await report.run({ itemId, hint, description: description.trim() });
    if (answer?.ok) router.push(`/r/${token}/incident/${answer.value.incidentId}`);
  };
  return { itemId, setItemId, hint, setHint, description, setDescription, missingWords, submit: () => void submit(), pending: report.pending, failed: report.failed };
}
