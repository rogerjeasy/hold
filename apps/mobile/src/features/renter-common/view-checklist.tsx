import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { useTranslations } from 'use-intl';
import { aspect } from '@hold/design-tokens';
import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/theme';

export type ChecklistView = {
  readonly key: string;
  readonly label: string;
  // The photograph taken of this view, once there is one; null while Hold prepares its display copy.
  readonly photo: { readonly url: string | null } | undefined;
  readonly required: boolean;
};

// The views to photograph, as rows: what each is, whether it is taken (in words and with its thumbnail), and a tap to
// take it, or take it again. The words say where each stands, so the tick is never alone.
export function ViewChecklist({ views, onTake }: { views: readonly ChecklistView[]; onTake: (key: string) => void }) {
  const t = useTranslations('renterAction.photo');
  const { color } = useTheme();
  return (
    <View className="border-y border-border bg-card">
      {views.map((view, index) => {
        const taken = view.photo !== undefined;
        const standing = taken ? t('taken') : view.required ? t('toTake') : t('optional');
        return (
          <Pressable
            key={view.key}
            role="button"
            aria-label={`${view.label}, ${standing}`}
            accessibilityHint={taken ? t('retakeHint') : t('takeHint')}
            onPress={() => onTake(view.key)}
            className={`min-h-touch flex-row items-center gap-3 px-4 py-3 active:bg-accent ${index === 0 ? '' : 'border-t border-border'}`}
          >
            <View className="w-16 overflow-hidden bg-muted" style={{ aspectRatio: aspect.thumbnail }}>
              {view.photo?.url ? (
                <Image source={{ uri: view.photo.url }} contentFit="cover" className="flex-1" aria-hidden accessibilityIgnoresInvertColors />
              ) : (
                <View className="flex-1 items-center justify-center">
                  <Icon name="camera" color={color.mutedForeground} size={20} />
                </View>
              )}
            </View>
            <View className="min-w-0 flex-1 gap-0.5">
              <Text variant="bodyStrong">{view.label}</Text>
              <Text variant="small" tone={taken ? 'success' : 'muted'}>
                {standing}
              </Text>
            </View>
            <Icon name={taken ? 'retake' : 'forward'} color={color.mutedForeground} size={18} />
          </Pressable>
        );
      })}
    </View>
  );
}
