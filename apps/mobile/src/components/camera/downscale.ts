import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

// A condition photograph is evidence: big enough to show a scratch, small enough to upload from the counter on a weak
// signal. The long edge is capped here; the evidence store refuses anything over its byte limit (MAX_PHOTO_BYTES).
export const PHOTO_LONG_EDGE = 2560;
const JPEG_QUALITY = 0.9;

export type Photo = { readonly uri: string; readonly width: number; readonly height: number };

// The resize that brings the long edge down to the limit, keeping the shape; nothing when it is already within it.
export function resizeFor(size: { width: number; height: number }, longEdge: number): { width: number } | { height: number } | undefined {
  if (Math.max(size.width, size.height) <= longEdge) return undefined;
  return size.height >= size.width ? { height: longEdge } : { width: longEdge };
}

export async function downscale(photo: Photo): Promise<Photo> {
  const context = ImageManipulator.manipulate(photo.uri);
  const resize = resizeFor(photo, PHOTO_LONG_EDGE);
  if (resize) context.resize(resize);
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}
