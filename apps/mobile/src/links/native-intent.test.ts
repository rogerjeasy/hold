import { redirectSystemPath } from '@/app/+native-intent';

jest.mock('@/api/hold', () => ({ ...jest.requireActual('@/api/hold'), holdLinkHosts: () => ['hold.example'] }));

const TOKEN = 'F'.repeat(65);

describe('a link the phone opens Hold with', () => {
  it("goes to the rental, from Hold's web address in any language", () => {
    expect(redirectSystemPath({ path: `https://hold.example/de/r/${TOKEN}/claim`, initial: true })).toBe(`/r/${TOKEN}/claim`);
  });

  it("goes to the rental from the app's own scheme", () => {
    expect(redirectSystemPath({ path: `hold://r/${TOKEN}`, initial: false })).toBe(`/r/${TOKEN}`);
  });

  // On Android the in-app browser session hands the app this address as a link too; the screen that opened PayPal
  // confirms the order itself, so the link goes nowhere while the app runs, and to the start when it opened the app.
  it("leaves PayPal's hand-back to the screen that opened PayPal", () => {
    expect(redirectSystemPath({ path: 'hold://paypal-return?kind=fee&order=ORDER-1', initial: false })).toBe('');
    expect(redirectSystemPath({ path: 'hold://paypal-return?kind=hold', initial: true })).toBe('/');
  });

  it('goes where it says when it is not a rental link', () => {
    expect(redirectSystemPath({ path: '/shop', initial: false })).toBe('/shop');
  });
});
