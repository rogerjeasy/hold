import { staffSession } from '@/storage/staff-session';

const session = { accessToken: 'access', refreshToken: 'refresh', expiresAt: '2026-11-01T10:00:00.000Z', shopId: '6f1c2c58-6a2e-4c55-9a35-0d2b2f8c1e11' };

describe("the staff member's session on this phone", () => {
  it('is empty until someone signs in', async () => {
    await expect(staffSession.read()).resolves.toBeUndefined();
  });

  it('is kept and read back', async () => {
    await staffSession.write(session);
    await expect(staffSession.read()).resolves.toEqual(session);
  });

  it('is gone after signing out', async () => {
    await staffSession.write(session);
    await staffSession.clear();
    await expect(staffSession.read()).resolves.toBeUndefined();
  });

  it('reads a damaged value as signed out', async () => {
    await staffSession.write({ ...session, accessToken: '' });
    await expect(staffSession.read()).resolves.toBeUndefined();
  });
});
