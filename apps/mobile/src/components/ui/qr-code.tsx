import { useMemo } from 'react';
import { View } from 'react-native';
import { create } from 'qrcode';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTheme } from '@/theme';

// The quiet margin a scanner needs around the code, in modules.
const QUIET = 4;

// One square per dark module, as a single path, so a long link stays one cheap shape to draw.
export function qrPath(text: string): { readonly size: number; readonly path: string } {
  const { modules } = create(text, { errorCorrectionLevel: 'M' });
  let path = '';
  for (let row = 0; row < modules.size; row += 1) {
    for (let column = 0; column < modules.size; column += 1) {
      if (modules.get(row, column)) path += `M${column + QUIET} ${row + QUIET}h1v1h-1z`;
    }
  }
  return { size: modules.size + QUIET * 2, path };
}

// A link drawn as a QR code for another phone to scan: dark on light in both themes, because scanners read it best,
// as large as its container allows and always square. `label` is what a screen reader hears.
export function QrCode({ value, label }: { value: string; label: string }) {
  const { color } = useTheme();
  const { size, path } = useMemo(() => qrPath(value), [value]);
  return (
    <View accessible role="img" aria-label={label} className="aspect-square w-full">
      <Svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`}>
        <Rect x={0} y={0} width={size} height={size} fill={color.bandForeground} />
        <Path d={path} fill={color.band} />
      </Svg>
    </View>
  );
}
