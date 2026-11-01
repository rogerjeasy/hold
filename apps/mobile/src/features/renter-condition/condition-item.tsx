import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import type { RenterView } from '@hold/mobile-api';
import { Button, Panel, Text } from '@/components/ui';
import { EvidencePhoto } from '@/features/renter-common';
import { MarkedPhoto } from './marked-photo';

export type ConditionItemView = RenterView<'condition'>['items'][number];

// One item as it left: its photographs with each mark boxed, the marks in words, what the renter added, and, while they
// add what staff missed, the camera for this item.
export function ConditionItem({ item, onPhotograph }: { item: ConditionItemView; onPhotograph?: () => void }) {
  const t = useTranslations('condition');
  return (
    <Panel title={item.label}>
      <View className="gap-4 p-4">
        {item.photos.map((photo) => (
          <View key={photo.view} className="gap-1.5">
            <MarkedPhoto url={photo.url} label={t('photoOf', { item: item.label, view: photo.label })} marks={item.marks.filter((mark) => mark.view === photo.view)} />
            <Text variant="small" tone="muted">
              {photo.label}
            </Text>
          </View>
        ))}
        {item.marks.length === 0 ? (
          <Text tone="muted">{t('noMarks')}</Text>
        ) : (
          <View className="gap-1.5">
            {item.marks.map((mark) => (
              <View key={mark.id} className="flex-row gap-2">
                <View className="mt-2.5 h-1.5 w-1.5 rounded-full bg-mark" aria-hidden />
                <Text selectable className="min-w-0 flex-1">
                  {mark.description}
                </Text>
              </View>
            ))}
          </View>
        )}
        {item.added.length === 0 ? null : (
          <View className="gap-2">
            <Text variant="bodyStrong">{t('addedCount', { count: item.added.length })}</Text>
            <View className="flex-row flex-wrap gap-2">
              {item.added.map((photo, index) => (
                <View key={photo.view} className="w-[48%]">
                  <EvidencePhoto url={photo.url} label={t('addedPhoto', { number: index + 1, item: item.label })} />
                </View>
              ))}
            </View>
          </View>
        )}
        {onPhotograph === undefined ? null : <Button label={t('photograph')} icon="camera" variant="secondary" onPress={onPhotograph} />}
      </View>
    </Panel>
  );
}
