import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslations } from 'use-intl';
import { captureSessionSchema, type CaptureSessionView } from '@hold/mobile-api';
import { useAnswer } from '@/api';
import { Button, Field, Icon, LoadState, Notice, Screen, Text } from '@/components/ui';
import { RefusalNotice } from '@/features/shop-session/refusal';
import { staffRead } from '@/features/shop-session/staff-request';
import { useSessionKey } from '@/features/shop-session/use-session-key';
import { useStaffAction } from '@/features/shop-session/use-staff-action';
import { useTheme } from '@/theme';
import { DEFAULT_BOX, type Region } from './mark-region';
import { PhotoMarks } from './photo-marks';

const DESCRIPTION_MAX = 200;

// The marks on one view at the handover (architecture.md section 9.4): the item's known marks, which staff confirm are
// still there, and new ones they box on the photograph and describe. A mark recorded here is never charged to this
// renter.
export function MarksScreen() {
  const { sessionId, view } = useLocalSearchParams<{ sessionId: string; view: string }>();
  const path = `shop/sessions/${encodeURIComponent(sessionId)}`;
  const { state, retry } = useAnswer(`${path}:${useSessionKey()}`, (api) => staffRead(api, path, captureSessionSchema));
  return (
    <Screen>
      <LoadState state={state} onRetry={retry} empty={{ title: '', body: '' }}>
        {(session) => <Marks session={session} viewKey={view} onChanged={retry} />}
      </LoadState>
    </Screen>
  );
}

function Marks({ session, viewKey, onChanged }: { session: CaptureSessionView; viewKey: string; onChanged: () => void }) {
  const t = useTranslations('shop');
  const view = session.plan.find((each) => each.key === viewKey);
  const label = view?.label ?? viewKey;
  const photo = session.photos.find((each) => each.view === viewKey);
  const marks = session.marks.filter((mark) => mark.view === viewKey);
  const editable = session.canAct && !session.sealed;
  const [draft, setDraft] = useState<Region | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  return (
    <>
      <Stack.Screen options={{ title: label }} />
      <Text tone="muted">{editable ? t('marks.lead') : t('marks.readOnly')}</Text>
      {photo?.url ? (
        <PhotoMarks url={photo.url} label={t('capture.photo', { view: label })} marks={marks} draft={draft} onDraft={draft ? setDraft : undefined} />
      ) : (
        <Notice title={label} body={photo ? t('capture.preparing') : t('marks.noPhoto')} />
      )}
      <MarkList session={session} marks={marks} editable={editable} onChanged={onChanged} />
      {saved && draft === undefined ? <Notice tone="success" announced title={t('marks.title')} body={t('marks.saved')} /> : null}
      {editable && photo?.url ? (
        draft ? (
          <NewMark
            sessionId={session.id}
            view={viewKey}
            region={draft}
            onCancel={() => setDraft(undefined)}
            onSaved={() => {
              setDraft(undefined);
              setSaved(true);
              onChanged();
            }}
          />
        ) : (
          <Button
            variant="secondary"
            icon="mark"
            label={t('marks.add')}
            onPress={() => {
              setSaved(false);
              setDraft(DEFAULT_BOX);
            }}
            className="self-start"
          />
        )
      ) : null}
    </>
  );
}

function MarkList({ session, marks, editable, onChanged }: { session: CaptureSessionView; marks: CaptureSessionView['marks']; editable: boolean; onChanged: () => void }) {
  const t = useTranslations('shop.marks');
  const { act, pending, refusal } = useStaffAction();
  if (marks.length === 0) return null;
  return (
    <View className="gap-2">
      <View className="border-y border-border bg-card">
        {marks.map((mark, index) => (
          <View key={mark.id} className={`min-h-touch flex-row flex-wrap items-center gap-3 px-4 py-3 ${index === 0 ? '' : 'border-t border-border'}`}>
            <View className="h-6 min-w-6 items-center justify-center bg-mark px-1">
              <Text variant="tag" tone="inherit" className="text-mark-foreground">
                {String(index + 1)}
              </Text>
            </View>
            <Text className="min-w-0 flex-1" selectable>
              {mark.description}
            </Text>
            {mark.confirmed || mark.new || !editable ? (
              <Text variant="small" tone="muted">
                {mark.new ? t('added') : mark.confirmed ? t('confirmed') : t('known')}
              </Text>
            ) : (
              <StillThere
                description={mark.description}
                busy={pending === mark.id}
                onPress={async () => {
                  const answer = await act('confirm-known-marks', { sessionId: session.id, markId: [mark.id] }, mark.id);
                  if (answer.ok) {
                    void Haptics.selectionAsync();
                    onChanged();
                  }
                }}
              />
            )}
          </View>
        ))}
      </View>
      {refusal ? <RefusalNotice refusal={refusal} /> : null}
    </View>
  );
}

// "Still there" is short on screen, beside the mark it is about; its accessible name says which mark.
function StillThere({ description, busy, onPress }: { description: string; busy: boolean; onPress: () => void }) {
  const t = useTranslations('shop.marks');
  const { color } = useTheme();
  return (
    <Pressable
      role="button"
      aria-label={t('stillThereItem', { mark: description })}
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      onPress={onPress}
      className="min-h-touch flex-row items-center gap-1.5 rounded-lg border border-border-strong bg-card px-3 active:bg-accent"
    >
      {busy ? <ActivityIndicator color={color.foreground} /> : <Icon name="check" color={color.foreground} size={18} />}
      <Text variant="button">{t('stillThere')}</Text>
    </Pressable>
  );
}

function NewMark({ sessionId, view, region, onCancel, onSaved }: { sessionId: string; view: string; region: Region; onCancel: () => void; onSaved: () => void }) {
  const t = useTranslations('shop');
  const { act, pending, refusal } = useStaffAction();
  const [description, setDescription] = useState('');
  const [problem, setProblem] = useState(false);
  const save = async () => {
    const text = description.trim();
    const bad = text === '' || text.length > DESCRIPTION_MAX;
    setProblem(bad);
    if (bad) return;
    const answer = await act('add-handover-mark', { sessionId, view, ...region, description: text });
    if (!answer.ok) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSaved();
  };
  return (
    <View className="gap-3">
      <Text variant="small" tone="muted">
        {t('marks.howTo')}
      </Text>
      <Field
        label={t('marks.description')}
        hint={t('marks.descriptionHint')}
        value={description}
        onChangeText={setDescription}
        maxLength={DESCRIPTION_MAX}
        error={problem ? t('refusal.reasons.description_invalid') : undefined}
        returnKeyType="done"
        onSubmitEditing={() => void save()}
      />
      {refusal ? <RefusalNotice refusal={refusal} /> : null}
      <View className="flex-row flex-wrap gap-3">
        <Button label={t('marks.save')} icon="check" onPress={() => void save()} loading={pending !== undefined} />
        <Button variant="secondary" label={t('marks.cancel')} onPress={onCancel} />
      </View>
    </View>
  );
}
