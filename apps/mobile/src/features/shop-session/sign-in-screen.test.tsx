import { fireEvent, screen } from '@testing-library/react-native';
import { staffSession } from '@/storage/staff-session';
import { createFakeApi } from '@/test/fake-api';
import { renderWithProviders } from '@/test/render';
import { demoStore } from './demo-store';
import { SignInScreen } from './sign-in-screen';
import { SHOP_ID } from './test-fixtures';

const ATTEMPT = { attempt: 'sealed-attempt', expiresAt: '2026-11-01T09:10:00.000Z' };
const TOKENS = { accessToken: 'access-1', refreshToken: 'refresh-1', expiresInSeconds: 3600 };

async function askForCode() {
  await fireEvent.changeText(screen.getByLabelText('Work email'), ' jonas@ribeira.example ');
  await fireEvent.press(screen.getByRole('button', { name: 'Email me a code' }));
}

describe('signing in with an emailed code', () => {
  it('emails a code, takes it and keeps the tokens on the phone', async () => {
    const api = createFakeApi({ 'session/start': { ok: true, value: ATTEMPT }, 'session/verify': { ok: true, value: TOKENS } });
    await renderWithProviders(<SignInScreen />, { api });
    await askForCode();
    expect(await screen.findByText('We sent a code to jonas@ribeira.example. It works once, within ten minutes.')).toBeOnTheScreen();
    expect(api.calls[0]?.options.body).toEqual({ email: 'jonas@ribeira.example', locale: 'en' });
    await fireEvent.changeText(screen.getByLabelText('One-time code'), '1234 5678');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(api.calls[1]?.options.body).toEqual({ attempt: 'sealed-attempt', code: '12345678' });
    await expect(staffSession.read()).resolves.toMatchObject({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  });

  it('says so when the code is wrong, and keeps the person on the code', async () => {
    const api = createFakeApi({ 'session/start': { ok: true, value: ATTEMPT }, 'session/verify': { ok: false, failure: 'refused', reason: 'wrong' } });
    await renderWithProviders(<SignInScreen />, { api });
    await askForCode();
    await fireEvent.changeText(await screen.findByLabelText('One-time code'), '12345678');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('That code is not right. Check it and try again.')).toBeOnTheScreen();
    await expect(staffSession.read()).resolves.toBeUndefined();
  });

  it('asks for the whole code before checking it', async () => {
    const api = createFakeApi({ 'session/start': { ok: true, value: ATTEMPT } });
    await renderWithProviders(<SignInScreen />, { api });
    await askForCode();
    await fireEvent.changeText(await screen.findByLabelText('One-time code'), '123');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('The code is the digits in the email. Check it and try again.')).toBeOnTheScreen();
    expect(api.calls).toHaveLength(1);
  });

  it('says to wait when there were too many tries', async () => {
    const api = createFakeApi({ 'session/start': { ok: false, failure: 'rate_limited' } });
    await renderWithProviders(<SignInScreen />, { api });
    await askForCode();
    expect(await screen.findByText('Too many attempts. Wait a few minutes, then try again.')).toBeOnTheScreen();
  });

  it('checks the address before sending anything', async () => {
    const api = createFakeApi();
    await renderWithProviders(<SignInScreen />, { api });
    await fireEvent.changeText(screen.getByLabelText('Work email'), 'jonas');
    await fireEvent.press(screen.getByRole('button', { name: 'Email me a code' }));
    expect(screen.getByText('That does not look like an email address. Check it and try again.')).toBeOnTheScreen();
    expect(api.calls).toEqual([]);
  });

  it('goes back to the address to use another one', async () => {
    const api = createFakeApi({ 'session/start': { ok: true, value: ATTEMPT } });
    await renderWithProviders(<SignInScreen />, { api });
    await askForCode();
    await fireEvent.press(await screen.findByRole('button', { name: 'Use a different email' }));
    expect(screen.getByLabelText('Work email')).toBeOnTheScreen();
  });
});

describe("the judges' one-tap demo", () => {
  const DEMO = { ...TOKENS, demo: 'sealed-demo', shopId: SHOP_ID };

  it('signs in as Jonas into his shop, and keeps the demo to come back to', async () => {
    const api = createFakeApi({ 'session/demo': { ok: true, value: DEMO } });
    await renderWithProviders(<SignInScreen />, { api });
    expect(screen.getByText('Sample')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Start a demo as Jonas, at the counter' }));
    expect(api.calls[0]?.options.body).toEqual({ account: 'staff' });
    await expect(staffSession.read()).resolves.toMatchObject({ accessToken: 'access-1', shopId: SHOP_ID });
    await expect(demoStore.read()).resolves.toEqual({ demo: 'sealed-demo', account: 'staff', shopId: SHOP_ID });
  });

  it('comes back to the demo this phone started, as either person', async () => {
    await demoStore.write({ demo: 'sealed-demo', account: 'staff', shopId: SHOP_ID });
    const api = createFakeApi({ 'session/demo': { ok: true, value: DEMO } });
    await renderWithProviders(<SignInScreen />, { api });
    await fireEvent.press(await screen.findByRole('button', { name: 'Continue as Tomás, the owner' }));
    expect(api.calls[0]?.options.body).toEqual({ account: 'owner', demo: 'sealed-demo' });
    await expect(demoStore.read()).resolves.toEqual({ demo: 'sealed-demo', account: 'owner', shopId: SHOP_ID });
  });

  it('starts a fresh demo when asked', async () => {
    await demoStore.write({ demo: 'sealed-demo', account: 'staff', shopId: SHOP_ID });
    const api = createFakeApi({ 'session/demo': { ok: true, value: { ...DEMO, demo: 'fresh-demo' } } });
    await renderWithProviders(<SignInScreen />, { api });
    await fireEvent.press(await screen.findByRole('button', { name: 'Start a fresh demo' }));
    expect(api.calls[0]?.options.body).toEqual({ account: 'owner' });
  });

  it('says so when the demo could not start', async () => {
    const api = createFakeApi({ 'session/demo': { ok: false, failure: 'rate_limited' } });
    await renderWithProviders(<SignInScreen />, { api });
    await fireEvent.press(screen.getByRole('button', { name: 'Start a demo as Tomás, the owner' }));
    expect(await screen.findByText('Wait a minute, then try again.')).toBeOnTheScreen();
    await expect(staffSession.read()).resolves.toBeUndefined();
  });
});
