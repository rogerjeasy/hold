import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslations } from 'use-intl';
import type { CaptureSessionView } from '@hold/mobile-api';
import { Button, Notice, QrCode, Text } from '@/components/ui';
import { RefusalNotice } from '@/features/shop-session/refusal';
import type { Sealed, useSeal } from './use-seal';
import type { Upload } from './use-uploads';
import { stillToTake } from './view-status';

type SealPanelProps = { session: CaptureSessionView; uploads: Readonly<Record<string, Upload>>; seal: ReturnType<typeof useSeal>; onPhotograph: (view: string) => void };

// The next step, in reach of the thumb: the next needed view, then sealing once every one is taken and uploaded.
export function SealPanel({ session, uploads, seal, onPhotograph }: SealPanelProps) {
  const t = useTranslations('shop.capture');
  if (session.sealed || !session.canAct) {
    return (
      <View className="gap-3">
        {session.sealed ? <Text tone="muted">{session.kind === 'handover' ? t('seal.sealedHandover') : t('seal.sealedReturn')}</Text> : null}
        <Button variant="secondary" label={t('seal.back')} onPress={() => router.back()} />
      </View>
    );
  }
  const next = stillToTake(session, uploads)[0];
  const nextLabel = session.plan.find((view) => view.key === next)?.label;
  const uploading = Object.values(uploads).some((upload) => upload.status === 'uploading');
  const missing = session.missing.filter((view) => uploads[view]?.status !== 'done').length;
  if (next !== undefined && nextLabel !== undefined) {
    return (
      <View className="gap-2">
        <Text variant="small" tone="muted">
          {t('seal.missing', { count: missing })}
        </Text>
        <Button icon="camera" label={t('photograph', { view: nextLabel })} onPress={() => onPhotograph(next)} />
      </View>
    );
  }
  return (
    <View className="gap-2">
      <Text variant="small" tone="muted">
        {uploading ? t('seal.waiting') : missing > 0 ? t('seal.missing', { count: missing }) : t('seal.ready')}
      </Text>
      {seal.refusal ? <RefusalNotice refusal={seal.refusal} /> : null}
      <Button icon="check" label={session.kind === 'handover' ? t('seal.handover') : t('seal.return')} onPress={() => void seal.seal()} loading={seal.sealing} disabled={uploading || missing > 0} />
    </View>
  );
}

// What sealing did: the rental is out and the renter's condition report shown as a code, or the return is being
// compared and a person can note what they saw.
export function SealResult({ sealed }: { sealed: Sealed }) {
  const t = useTranslations('shop');
  if (sealed.kind === 'handover') {
    const link = sealed.value.conditionLink;
    return (
      <View className="gap-4">
        <Notice tone="success" announced title={sealed.value.rentalOut ? t('capture.seal.out') : t('capture.seal.next')} body={link ? (link.sent === 'text' ? t('capture.seal.texted') : link.sent === 'email' ? t('capture.seal.emailed') : t('capture.seal.show')) : t('capture.seal.sealedHandover')} />
        {link ? (
          <View className="w-full max-w-96 gap-2 self-center">
            <View className="border border-border-strong bg-band-foreground p-3">
              <QrCode value={link.url} label={t('link.code', { url: link.url })} />
            </View>
            <Text variant="small" tone="muted" className="text-center">
              {t('link.condition')}
            </Text>
          </View>
        ) : null}
      </View>
    );
  }
  return <Notice tone="success" announced title={t('capture.return')} body={sealed.value.rentalReturned ? t('capture.seal.returned') : t('capture.seal.returnedNext')} />;
}

// After sealing: back to the rental, and at a return, noting what was seen.
export function SealedActions({ sealed }: { sealed: Sealed }) {
  const t = useTranslations('shop.capture.seal');
  const comparisonId = sealed.kind === 'return' ? sealed.value.comparisonId : null;
  return (
    <View className="gap-3">
      {comparisonId ? <Button icon="document" label={t('review')} onPress={() => router.push(`/shop/review/${comparisonId}`)} /> : null}
      <Button variant={comparisonId ? 'secondary' : 'primary'} label={t('back')} onPress={() => router.back()} />
    </View>
  );
}
