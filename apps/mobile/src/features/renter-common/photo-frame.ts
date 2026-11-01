import { useState } from 'react';
import type { ImageLoadEventData } from 'expo-image';
import type { LayoutChangeEvent } from 'react-native';

type Size = { readonly width: number; readonly height: number };
export type Rect = { readonly left: number; readonly top: number; readonly width: number; readonly height: number };

// Where a photograph shown whole ("contain") sits inside its frame. A portrait photograph in a landscape frame has
// bands at its sides; a region given as shares of the photograph is placed on the photograph, not on the frame.
export function containedRect(frame: Size, photo: Size): Rect | undefined {
  if (frame.width <= 0 || frame.height <= 0 || photo.width <= 0 || photo.height <= 0) return undefined;
  const scale = Math.min(frame.width / photo.width, frame.height / photo.height);
  const width = photo.width * scale;
  const height = photo.height * scale;
  return { left: (frame.width - width) / 2, top: (frame.height - height) / 2, width, height };
}

// The frame's size from its layout and the photograph's from its load, and the photograph's place in the frame.
export function usePhotoFrame() {
  const [frame, setFrame] = useState<Size>({ width: 0, height: 0 });
  const [photo, setPhoto] = useState<Size>({ width: 0, height: 0 });
  return {
    rect: containedRect(frame, photo),
    onLayout: (event: LayoutChangeEvent) => setFrame({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height }),
    onLoad: (event: ImageLoadEventData) => setPhoto({ width: event.source.width, height: event.source.height }),
  };
}

// A region as shares of the photograph, in points within the frame.
export const regionIn = (rect: Rect, region: { x: number; y: number; width: number; height: number }) => ({
  left: rect.left + region.x * rect.width,
  top: rect.top + region.y * rect.height,
  width: region.width * rect.width,
  height: region.height * rect.height,
});
