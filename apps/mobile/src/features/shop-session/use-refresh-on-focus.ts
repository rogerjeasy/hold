import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';

// Reads a screen again when the person comes back to it, from a handover or a sheet, so it shows what they just did.
export function useRefreshOnFocus(refresh: () => void) {
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      refresh();
    }, [refresh]),
  );
}
