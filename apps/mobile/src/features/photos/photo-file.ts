import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import { File } from 'expo-file-system';
import type { PhotoFile, UploadLink } from './upload-photo';

// The photograph on the phone, as the upload link needs it: its size and its SHA-256, which the store checks.
export async function photoFile(uri: string): Promise<PhotoFile> {
  const file = new File(uri);
  const hash = await digest(CryptoDigestAlgorithm.SHA256, await file.bytes());
  const sha256 = [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return { uri, bytes: file.size, sha256 };
}

// One try at the store. A refusal and a dropped connection both mean "not stored", so the caller may try again.
export async function putPhoto(link: UploadLink, file: PhotoFile, fetch: typeof globalThis.fetch = globalThis.fetch): Promise<boolean> {
  try {
    const answer = await fetch(link.url, { method: 'PUT', headers: link.headers, body: new File(file.uri) });
    return answer.ok;
  } catch {
    return false;
  }
}
