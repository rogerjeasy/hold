import { photoFile, putPhoto } from './photo-file';

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri: string) => ({ uri, size: 3, bytes: async () => new Uint8Array([1, 2, 3]) })),
}));

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest: jest.fn(async () => new Uint8Array([0, 15, 255]).buffer),
}));

describe('photoFile', () => {
  it("reads the photograph's size and its SHA-256 as lowercase hex", async () => {
    await expect(photoFile('file:///photo.jpg')).resolves.toEqual({ uri: 'file:///photo.jpg', bytes: 3, sha256: '000fff' });
  });
});

describe('putPhoto', () => {
  const link = { key: 'k', url: 'https://store.example/put', headers: { 'content-type': 'image/jpeg' } };
  const file = { uri: 'file:///photo.jpg', bytes: 3, sha256: '000fff' };

  it('puts the file with the headers the link was signed with', async () => {
    const fetch = jest.fn(async () => new Response(null, { status: 200 }));
    await expect(putPhoto(link, file, fetch)).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledWith(link.url, expect.objectContaining({ method: 'PUT', headers: link.headers }));
  });

  it('counts a refused or failed put as not stored', async () => {
    await expect(putPhoto(link, file, jest.fn(async () => new Response(null, { status: 403 })))).resolves.toBe(false);
    await expect(putPhoto(link, file, jest.fn(async () => Promise.reject(new TypeError('Network request failed'))))).resolves.toBe(false);
  });
});
