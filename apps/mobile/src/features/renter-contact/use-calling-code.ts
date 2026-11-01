import { useLocales } from 'expo-localization';
import { callingCodeFor } from '@hold/domain';

// The country code a number typed on this phone most likely starts with, from the phone's own region, so a tourist
// writes only their number. Empty where the region is unknown or Hold does not text there.
export function useCallingCode(): string {
  const region = useLocales()
    .map((locale) => locale.regionCode)
    .find((each) => each != null);
  const code = region == null ? undefined : callingCodeFor(region);
  return code === undefined ? '' : `+${code} `;
}
