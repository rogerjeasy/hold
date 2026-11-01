import { ActivityIndicator, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTranslations } from 'use-intl';
import type { CaptureSessionView } from '@hold/mobile-api';
import { Button, Icon, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { needsRetake, type ViewStatus } from './view-status';

type RowProps = {
  session: CaptureSessionView;
  view: CaptureSessionView['plan'][number];
  status: ViewStatus;
  first: boolean;
  editable: boolean;
  onPhotograph: () => void;
  onRetry: () => void;
};

// One view of the item: its photograph or a place for it, where it stands in words, and what can be done with it.
export function ViewRow({ session, view, status, first, editable, onPhotograph, onRetry }: RowProps) {
  const t = useTranslations('shop.capture');
  const marks = session.marks.filter((mark) => mark.view === view.key);
  const toCheck = marks.filter((mark) => !mark.confirmed && !mark.new).length;
  const taken = status.name === 'photographed' || status.name === 'preparing' || status.name === 'sent';
  return (
    <View className={`gap-3 px-4 py-3 ${first ? '' : 'border-t border-border'}`}>
      <Pressable
        role="button"
        aria-label={`${view.label}, ${statusWords(t, status).text}`}
        accessibilityHint={editable ? (taken ? t('retakeView', { view: view.label }) : t('photograph', { view: view.label })) : undefined}
        disabled={!editable || status.name === 'uploading'}
        onPress={onPhotograph}
        className="min-h-touch flex-row items-center gap-3 active:opacity-70"
      >
        <Thumbnail status={status} label={view.label} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text variant="bodyStrong">{view.label}</Text>
          <StatusText status={status} />
        </View>
        {editable && status.name !== 'uploading' ? <CameraGlyph /> : null}
      </Pressable>
      {status.name === 'failed' ? (
        <View className="gap-2">
          <Text variant="small" tone="destructive" role="alert">
            {t.has(`upload.${status.reason}` as 'upload.upload_failed') ? t(`upload.${status.reason}` as 'upload.upload_failed') : t('upload.upload_failed')}
          </Text>
          {needsRetake(status.reason) ? (
            <Button variant="secondary" icon="camera" label={t('retake')} onPress={onPhotograph} className="self-start" />
          ) : (
            <Button variant="secondary" icon="upload" label={t('retryItem', { view: view.label })} onPress={onRetry} className="self-start" />
          )}
        </View>
      ) : null}
      {session.kind === 'handover' && (status.name === 'photographed' || marks.length > 0) ? (
        <MarksLink sessionId={session.id} view={view} count={marks.length} toCheck={toCheck} />
      ) : null}
    </View>
  );
}

function CameraGlyph() {
  const { color } = useTheme();
  return <Icon name="camera" color={color.primary} size={22} />;
}

function Thumbnail({ status, label }: { status: ViewStatus; label: string }) {
  const t = useTranslations('shop.capture');
  const { color } = useTheme();
  return (
    <View className="h-12 w-16 items-center justify-center overflow-hidden border border-border bg-muted">
      {status.name === 'photographed' ? (
        <Image source={{ uri: status.url }} contentFit="cover" className="h-full w-full" accessible aria-label={t('photo', { view: label })} />
      ) : status.name === 'uploading' || status.name === 'preparing' ? (
        <ActivityIndicator color={color.mutedForeground} />
      ) : (
        <Icon name={status.name === 'failed' ? 'warning' : status.name === 'sent' ? 'success' : 'camera'} color={status.name === 'failed' ? color.destructive : color.mutedForeground} size={20} />
      )}
    </View>
  );
}

type CaptureText = ReturnType<typeof useTranslations<'shop.capture'>>;

function statusWords(t: CaptureText, status: ViewStatus) {
  const words = {
    photographed: { text: t('photographed'), tone: 'success' },
    sent: { text: t('photographed'), tone: 'success' },
    preparing: { text: t('preparing'), tone: 'muted' },
    uploading: { text: t('uploading'), tone: 'muted' },
    failed: { text: t('failed'), tone: 'destructive' },
    needed: { text: t('needed'), tone: 'primary' },
    optional: { text: t('optional'), tone: 'muted' },
  } as const;
  return words[status.name];
}

function StatusText({ status }: { status: ViewStatus }) {
  const t = useTranslations('shop.capture');
  const shown = statusWords(t, status);
  return (
    <Text variant="small" tone={shown.tone}>
      {shown.text}
    </Text>
  );
}

function MarksLink({ sessionId, view, count, toCheck }: { sessionId: string; view: { key: string; label: string }; count: number; toCheck: number }) {
  const t = useTranslations('shop.capture');
  const { color } = useTheme();
  return (
    <Pressable
      role="button"
      aria-label={t('marksItem', { view: view.label })}
      onPress={() => router.push({ pathname: '/shop/session/[sessionId]/marks', params: { sessionId, view: view.key } })}
      className="min-h-touch flex-row items-center gap-2 self-start active:opacity-60"
    >
      <Icon name="mark" color={toCheck > 0 ? color.warning : color.mutedForeground} size={18} />
      <Text variant="small" tone={toCheck > 0 ? 'warning' : 'muted'} className="underline">
        {toCheck > 0 ? t('toCheck', { count: toCheck }) : `${t('marks')} · ${t('marksCount', { count })}`}
      </Text>
    </Pressable>
  );
}
