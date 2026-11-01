import { useRef, useState } from 'react';
import type { CameraView } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { downscale, type Photo } from './downscale';

// aiming → taking → reviewing → preparing → (handed over) → aiming. A failed shot returns to aiming and says so.
type Stage = { readonly name: 'aiming'; readonly failed: boolean } | { readonly name: 'taking' } | { readonly name: 'reviewing'; readonly photo: Photo } | { readonly name: 'preparing'; readonly photo: Photo };

export function useCapture(onAccept: (photo: Photo) => void | Promise<void>) {
  const camera = useRef<CameraView>(null);
  const [stage, setStage] = useState<Stage>({ name: 'aiming', failed: false });

  const take = async () => {
    if (stage.name !== 'aiming' || camera.current === null) return;
    setStage({ name: 'taking' });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const picture = await camera.current.takePictureAsync({ quality: 1, exif: false });
      setStage({ name: 'reviewing', photo: { uri: picture.uri, width: picture.width, height: picture.height } });
    } catch {
      setStage({ name: 'aiming', failed: true });
    }
  };

  const retake = () => setStage({ name: 'aiming', failed: false });

  const use = async () => {
    if (stage.name !== 'reviewing') return;
    setStage({ name: 'preparing', photo: stage.photo });
    try {
      await onAccept(await downscale(stage.photo));
      setStage({ name: 'aiming', failed: false });
    } catch {
      setStage({ name: 'aiming', failed: true });
    }
  };

  return { camera, stage, take, retake, use };
}
