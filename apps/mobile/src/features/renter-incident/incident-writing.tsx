import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import type { RenterIncidentView } from '@hold/mobile-api';
import { Button, ChoiceList, Notice, Screen, Text } from '@/components/ui';
import { ActionFailure, CaptureSheet, useRenterAction, ViewChecklist } from '@/features/renter-common';
import { DamageMark, type Box } from './damage-mark';
import { useIncidentUpload } from './use-incident-upload';

type WritingProps = { token: string; view: RenterIncidentView; top: ReactNode; refresh: () => void };

// The renter photographs what happened, view by view of the item's handover plan, with the handover photograph of that
// view faintly behind the camera (extensions.md section 10.4). Every view is optional, and so is the box around the
// damage. Sending closes the photographs.
export function IncidentWriting({ token, view, top, refresh }: WritingProps) {
  const t = useTranslations('incident');
  const { incident, capture } = view;
  const upload = useIncidentUpload(token, incident.id);
  const send = useRenterAction(token, 'send-incident-report');
  const [taking, setTaking] = useState<string | undefined>(undefined);
  const shown = capture.photos.filter((photo) => photo.url !== null);
  const [markedView, setMarkedView] = useState<string | undefined>(undefined);
  const [box, setBox] = useState<Box | undefined>(undefined);
  const marking = shown.find((photo) => photo.view === markedView) ?? shown[0];
  const labelOf = (key: string) => capture.views.find((each) => each.key === key)?.label ?? key;
  const target = capture.views.find((each) => each.key === taking);

  const submit = async () => {
    const answer = await send.run({ incidentId: incident.id, ...(box === undefined || marking === undefined ? {} : { view: marking.view, ...box }) });
    if (answer?.ok) refresh();
  };

  return (
    <Screen footer={<Button label={t('send.send')} icon="send" onPress={() => void submit()} loading={send.pending} />}>
      {top}
      <View className="gap-3">
        <Text variant="heading" role="heading">
          {t('capture.title')}
        </Text>
        <Text tone="muted">{t('capture.guidance')}</Text>
      </View>
      {capture.photos.some((photo) => photo.simulated) ? <Notice title={t('capture.sampleTitle')} body={t('capture.sampleBody')} /> : null}
      <ViewChecklist
        views={capture.views.map((each) => ({ key: each.key, label: each.label, required: false, photo: capture.photos.find((photo) => photo.view === each.key) }))}
        onTake={setTaking}
      />
      {marking === undefined ? (
        <Text tone="muted">{t('send.noPhotos')}</Text>
      ) : (
        <View className="gap-3">
          <Text variant="heading" role="heading">
            {t('send.markTitle')}
          </Text>
          <Text tone="muted">{t('send.howTo')}</Text>
          {shown.length > 1 ? (
            <ChoiceList
              label={t('send.whichPhoto')}
              value={marking.view}
              onChange={(key) => {
                setMarkedView(key);
                setBox(undefined);
              }}
              choices={shown.map((photo) => ({ value: photo.view, label: labelOf(photo.view) }))}
            />
          ) : null}
          <DamageMark url={marking.url ?? ''} label={labelOf(marking.view)} box={box} onMark={setBox} />
          {box === undefined ? null : <Button label={t('send.removeBox')} variant="secondary" icon="close" onPress={() => setBox(undefined)} className="self-start" />}
        </View>
      )}
      <ActionFailure failed={send.failed} />
      <CaptureSheet
        target={target === undefined ? undefined : { view: target.key, label: target.label, guide: capture.guides[target.key] }}
        upload={upload}
        onTaken={() => {
          setTaking(undefined);
          refresh();
        }}
        onClose={() => setTaking(undefined)}
      />
    </Screen>
  );
}
