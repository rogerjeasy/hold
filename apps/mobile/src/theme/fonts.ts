import type { FontSource } from 'expo-font';
import { font, type FontToken } from '@hold/design-tokens';
// One import per weight: the package root would bundle every file of the family.
import { Archivo_400Regular } from '@expo-google-fonts/archivo/400Regular';
import { Archivo_500Medium } from '@expo-google-fonts/archivo/500Medium';
import { Archivo_600SemiBold } from '@expo-google-fonts/archivo/600SemiBold';
import { Archivo_700Bold } from '@expo-google-fonts/archivo/700Bold';
import { Archivo_800ExtraBold } from '@expo-google-fonts/archivo/800ExtraBold';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono/400Regular';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono/500Medium';

// The files behind each font token, loaded once under the token's name before the splash screen hides.
const FILES: Readonly<Record<FontToken, FontSource>> = {
  body: Archivo_400Regular,
  bodyMedium: Archivo_500Medium,
  bodySemibold: Archivo_600SemiBold,
  bodyBold: Archivo_700Bold,
  display: Archivo_800ExtraBold,
  figure: JetBrainsMono_400Regular,
  label: JetBrainsMono_500Medium,
};

export const FONT_FILES: Readonly<Record<string, FontSource>> = Object.fromEntries(
  (Object.keys(FILES) as FontToken[]).map((token) => [font[token], FILES[token]]),
);
