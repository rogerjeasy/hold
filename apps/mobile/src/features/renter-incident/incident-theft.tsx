import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import type { RenterIncidentView } from '@hold/mobile-api';
import { Button, Field, Text } from '@/components/ui';
import { ActionFailure, useRenterAction } from '@/features/renter-common';

const FIELDS = ['where', 'when', 'lockAndKeys'] as const;
const LIMIT = 300;

type Details = RenterIncidentView['incident']['theftDetails'];

// The fixed steps of a theft or loss: where, when, the lock and keys, then a police report number, which may come
// later. Given once; what the renter wrote is kept as they wrote it.
export function IncidentTheft({ token, incidentId, details, refresh }: { token: string; incidentId: string; details: Details; refresh: () => void }) {
  return details === null ? <TheftForm token={token} incidentId={incidentId} refresh={refresh} /> : <TheftGiven token={token} incidentId={incidentId} details={details} refresh={refresh} />;
}

function TheftForm({ token, incidentId, refresh }: { token: string; incidentId: string; refresh: () => void }) {
  const t = useTranslations('incident.theft');
  const give = useRenterAction(token, 'give-theft-details');
  const [values, setValues] = useState({ where: '', when: '', lockAndKeys: '', policeReport: '' });
  const [checked, setChecked] = useState(false);
  const missing = (field: (typeof FIELDS)[number]) => checked && values[field].trim() === '';
  const submit = async () => {
    setChecked(true);
    if (FIELDS.some((field) => values[field].trim() === '')) return;
    const police = values.policeReport.trim();
    const answer = await give.run({ incidentId, where: values.where.trim(), when: values.when.trim(), lockAndKeys: values.lockAndKeys.trim(), ...(police === '' ? {} : { policeReport: police }) });
    if (answer?.ok) refresh();
  };
  return (
    <View className="gap-4">
      {FIELDS.map((field) => (
        <Field key={field} label={t(field)} value={values[field]} onChangeText={(text) => setValues((now) => ({ ...now, [field]: text }))} maxLength={LIMIT} error={missing(field) ? t('required') : undefined} multiline={field === 'lockAndKeys'} />
      ))}
      <Field label={t('policeReport')} hint={t('policeLater')} value={values.policeReport} onChangeText={(text) => setValues((now) => ({ ...now, policeReport: text }))} maxLength={LIMIT} autoCapitalize="characters" />
      <Button label={t('send')} onPress={() => void submit()} loading={give.pending} />
      <ActionFailure failed={give.failed} />
    </View>
  );
}

function TheftGiven({ token, incidentId, details, refresh }: { token: string; incidentId: string; details: NonNullable<Details>; refresh: () => void }) {
  const t = useTranslations('incident.theft');
  const report = useRenterAction(token, 'give-police-report');
  const [police, setPolice] = useState('');
  const submit = async () => {
    const answer = await report.run({ incidentId, policeReport: police.trim() });
    if (answer?.ok) refresh();
  };
  return (
    <View className="gap-4">
      {[...FIELDS, 'policeReport' as const].map((field) => (
        <View key={field} className="gap-0.5">
          <Text variant="small" tone="muted">
            {t(field)}
          </Text>
          <Text selectable tone={details[field] === '' ? 'muted' : 'default'}>
            {details[field] === '' ? t('notGiven') : details[field]}
          </Text>
        </View>
      ))}
      {details.policeReport === '' ? (
        <View className="gap-3 border-t border-border pt-4">
          <Field label={t('policeReport')} value={police} onChangeText={setPolice} maxLength={LIMIT} autoCapitalize="characters" />
          <Button label={t('addPolice')} onPress={() => void submit()} loading={report.pending} disabled={police.trim() === ''} />
          <ActionFailure failed={report.failed} />
        </View>
      ) : null}
    </View>
  );
}
