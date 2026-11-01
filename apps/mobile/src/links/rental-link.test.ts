import { rentalPathFrom, rentalTokenFrom } from '@/links/rental-link';

// A token as Hold issues them (packages/auth renter-link.ts): 65 URL-safe characters.
const TOKEN = 'Q1w2E3r4T5y6U7i8O9p0A1s2D3f4G5h6J7k8L9z0X1c_V-b2N3m4Q5w6E7r8T9y0U';
const HOSTS = ['hold.example'];

describe('a rental link', () => {
  it.each([
    [`https://hold.example/r/${TOKEN}`],
    [`https://hold.example/fr/r/${TOKEN}`],
    [`https://hold.example/de/r/${TOKEN}/claim`],
    [`https://hold.example/r/${TOKEN}?from=email#top`],
    [`hold://r/${TOKEN}`],
    [`  https://hold.example/es/r/${TOKEN}\n`],
    [`Your rental at Velo: https://hold.example/r/${TOKEN} See you soon.`],
  ])('gives its token from %j', (text) => {
    expect(rentalTokenFrom(text, HOSTS)).toBe(TOKEN);
  });

  it.each([
    [''],
    ['hello'],
    [`https://elsewhere.example/r/${TOKEN}`],
    [`http://hold.example/r/${TOKEN}`],
    ['https://hold.example/r/short'],
    [`https://hold.example/shop/rentals/${TOKEN}`],
    [`https://hold.example/r/${TOKEN.slice(0, 40)}$$$`],
  ])('gives nothing for %j', (text) => {
    expect(rentalTokenFrom(text, HOSTS)).toBeUndefined();
  });

  it('accepts a link to the local web app while developing, over plain http', () => {
    expect(rentalTokenFrom(`http://localhost:3000/r/${TOKEN}`, ['localhost:3000'])).toBe(TOKEN);
  });
});

describe('an opened link', () => {
  it("is sent to the rental's screen, keeping where in the rental it pointed", () => {
    expect(rentalPathFrom(`https://hold.example/fr/r/${TOKEN}/claim`, HOSTS)).toBe(`/r/${TOKEN}/claim`);
    expect(rentalPathFrom(`hold://r/${TOKEN}`, HOSTS)).toBe(`/r/${TOKEN}`);
  });

  it('is left alone when it is not a rental link', () => {
    expect(rentalPathFrom('hold://rentals', HOSTS)).toBeUndefined();
    expect(rentalPathFrom('/shop', HOSTS)).toBeUndefined();
  });
});
