import * as SecureStore from 'expo-secure-store';
import type { z } from 'zod';

// Values kept in the phone's keychain or keystore, readable only on this device once it has been unlocked. A value
// that no longer matches its schema, or a store the phone cannot open (after a restore to a new phone, say), reads as
// nothing: the person signs in or opens the link again.
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

export async function readSecureJson<Value>(key: string, schema: z.ZodType<Value>): Promise<Value | undefined> {
  try {
    const stored = await SecureStore.getItemAsync(key, OPTIONS);
    if (stored === null) return undefined;
    const parsed = schema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : undefined;
  } catch (error) {
    if (__DEV__) console.warn(`The secure store could not read ${key}; reading it as empty.`, error);
    return undefined;
  }
}

export async function writeSecureJson(key: string, value: unknown): Promise<void> {
  await SecureStore.setItemAsync(key, JSON.stringify(value), OPTIONS);
}

export async function deleteSecure(key: string): Promise<void> {
  await SecureStore.deleteItemAsync(key, OPTIONS);
}

// A store a screen can follow: it hears of every change made through it.
export function createListeners() {
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    notify(): void {
      for (const listener of listeners) listener();
    },
  };
}
