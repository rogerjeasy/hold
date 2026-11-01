import { View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';
import { Button, Panel, StatusPill, Text } from '@/components/ui';
import { ActionFailure } from '@/features/renter-common';
import type { RenterRecord } from './record-screen';
import { useRecordFile } from './use-record-file';

type Version = RenterRecord['versions'][number];

// One prepared version: when, whether it is ready, its fingerprints to check a copy against, and its files to open in
// the phone's viewer or hand to the share sheet.
export function RecordVersion({ token, version }: { token: string; version: Version }) {
  const t = useTranslations('record');
  const format = useFormatter();
  const file = useRecordFile(token, version.id);
  const created = format.dateTime(new Date(version.createdAt), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
  return (
    <Panel title={t('version', { number: version.version })} aside={version.state === 'ready' ? <StatusPill label={t('readyTag')} tone="success" /> : undefined}>
      <View className="gap-4 p-4">
        <Text tone="muted">{t('created', { when: created })}</Text>
        {version.state === 'building' ? (
          <Text role="status">{t('building')}</Text>
        ) : version.state === 'failed' ? (
          <Text role="alert" tone="destructive">
            {t('buildFailed')}
          </Text>
        ) : version.state === 'ready' ? (
          <>
            <Fingerprint label={t('pdfHash')} value={version.pdfSha256 ?? t('unavailable')} />
            <Fingerprint label={t('manifestHash')} value={version.manifestFingerprint ?? t('unavailable')} />
            <View className="gap-3">
              <Button label={t('openPdf')} icon="document" onPress={() => void file.open('pdf')} loading={file.busy === 'open-pdf'} disabled={file.busy !== undefined} />
              <Button label={t('sharePdf')} icon="share" variant="secondary" onPress={() => void file.share('pdf')} loading={file.busy === 'share-pdf'} disabled={file.busy !== undefined} />
              <Button label={t('openManifest')} variant="secondary" onPress={() => void file.open('manifest')} loading={file.busy === 'open-manifest'} disabled={file.busy !== undefined} />
            </View>
            <ActionFailure failed={file.failed} />
          </>
        ) : (
          <Text>{t('unavailable')}</Text>
        )}
      </View>
    </Panel>
  );
}

function Fingerprint({ label, value }: { label: string; value: string }) {
  return (
    <View className="gap-1">
      <Text variant="small" tone="muted">
        {label}
      </Text>
      <Text variant="small" selectable className="font-figure">
        {value}
      </Text>
    </View>
  );
}
