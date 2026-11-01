import { uploadPhoto, type PhotoUploadSteps } from './upload-photo';

const file = { uri: 'file:///photo.jpg', bytes: 2048, sha256: 'a'.repeat(64) };
const measures = { sharpness: 120, shadows: 12, highlights: 240, filled: 0.9 };
const link = { key: 'evidence/key', url: 'https://store.example/put', headers: { 'content-type': 'image/jpeg' } };

function steps(overrides: Partial<PhotoUploadSteps> = {}): PhotoUploadSteps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    request: jest.fn(async (fields) => {
      calls.push(`request ${fields.view} ${fields.sha256.length} ${fields.bytes}`);
      return { ok: true as const, value: link };
    }),
    put: jest.fn(async () => {
      calls.push('put');
      return true;
    }),
    confirm: jest.fn(async (fields) => {
      calls.push(`confirm ${fields.view} ${fields.key} ${fields.sharpness}`);
      return { ok: true as const, value: { photoId: 'photo-1' } };
    }),
    wait: jest.fn(async () => undefined),
    ...overrides,
  };
}

describe('uploadPhoto', () => {
  it('asks for a link signed to the photograph, puts it, then records what was measured', async () => {
    const taken = steps();
    await expect(uploadPhoto({ file, view: 'front', measures }, taken)).resolves.toEqual({ ok: true, photoId: 'photo-1' });
    expect(taken.calls).toEqual(['request front 64 2048', 'put', 'confirm front evidence/key 120']);
    expect(taken.put).toHaveBeenCalledWith(link, file);
  });

  it('tries the store three times on a weak signal, waiting longer each time', async () => {
    const put = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const taken = steps({ put });
    await expect(uploadPhoto({ file, view: 'front', measures }, taken)).resolves.toEqual({ ok: true, photoId: 'photo-1' });
    expect(put).toHaveBeenCalledTimes(3);
    expect(taken.wait).toHaveBeenNthCalledWith(1, 1000);
    expect(taken.wait).toHaveBeenNthCalledWith(2, 2000);
  });

  it('records nothing when the store never took the photograph', async () => {
    const taken = steps({ put: jest.fn(async () => false) });
    await expect(uploadPhoto({ file, view: 'front', measures }, taken)).resolves.toEqual({ ok: false, reason: 'upload_failed' });
    expect(taken.confirm).not.toHaveBeenCalled();
  });

  it("passes on Hold's refusal of the link by its reason, and puts nothing", async () => {
    const taken = steps({ request: jest.fn(async () => ({ ok: false as const, failure: 'refused' as const, reason: 'session_sealed' })) });
    await expect(uploadPhoto({ file, view: 'front', measures }, taken)).resolves.toEqual({ ok: false, reason: 'session_sealed' });
    expect(taken.put).not.toHaveBeenCalled();
  });

  it('names a failure that is not a refusal by its failure', async () => {
    const taken = steps({ confirm: jest.fn(async () => ({ ok: false as const, failure: 'offline' as const })) });
    await expect(uploadPhoto({ file, view: 'front', measures }, taken)).resolves.toEqual({ ok: false, reason: 'offline' });
  });
});
