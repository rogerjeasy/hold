import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslations } from 'use-intl';
import { ConditionCapture, type Photo } from '@/components/camera';
import { Icon } from '@/components/ui';
import type { PhotoUploaded } from '@/features/photos';
import { ThemeScope, useTheme } from '@/theme';
import { useFailureWords } from './action-failure';

export type CaptureTarget = {
  readonly view: string;
  readonly label: string;
  // The handover photograph of the same view, shown faintly behind the camera to match the angle.
  readonly guide?: string;
  // What to photograph, when the view needs more than its name (where the item was left).
  readonly hint?: string;
};

type CaptureSheetProps = {
  target: CaptureTarget | undefined;
  upload: (photo: Photo, view: string) => Promise<PhotoUploaded>;
  onTaken: (view: string) => void;
  onClose: () => void;
};

// The camera over the whole screen, for one view of a report or a return. The photograph is uploaded before the sheet
// closes; if Hold refuses it (a photograph used before, a report already sent), the camera stays open and says why, so
// the renter takes another at once.
export function CaptureSheet({ target, upload, onTaken, onClose }: CaptureSheetProps) {
  return (
    <Modal visible={target !== undefined} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose} statusBarTranslucent>
      <ThemeScope>{target === undefined ? null : <Capture key={target.view} target={target} upload={upload} onTaken={onTaken} onClose={onClose} />}</ThemeScope>
    </Modal>
  );
}

function Capture({ target, upload, onTaken, onClose }: CaptureSheetProps & { target: CaptureTarget }) {
  const t = useTranslations('renterAction.photo');
  const words = useFailureWords({ upload_failed: t('uploadFailed') });
  const { color } = useTheme();
  const insets = useSafeAreaInsets();
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const accept = async (photo: Photo) => {
    setProblem(undefined);
    const uploaded = await upload(photo, target.view);
    if (uploaded.ok) onTaken(target.view);
    else setProblem(words({ ok: false, failure: 'refused', reason: uploaded.reason }));
  };
  return (
    <View className="flex-1 bg-photo">
      <ConditionCapture ghost={target.guide === undefined ? undefined : { uri: target.guide, view: target.label }} hint={problem ?? target.hint ?? target.label} onAccept={accept} />
      <Pressable
        role="button"
        aria-label={t('close')}
        onPress={onClose}
        className="absolute min-h-touch min-w-touch items-center justify-center rounded-full bg-photo active:opacity-70"
        style={{ top: insets.top + 8, right: insets.right + 12 }}
      >
        <Icon name="close" color={color.photoForeground} size={22} />
      </Pressable>
    </View>
  );
}
