// A renter reaches a rental through a link Hold signed: https://<host>/r/<token> in English, https://<host>/<locale>/r/
// <token> otherwise (packages/auth renter-link.ts), possibly with a page after it such as /claim, and hold://r/<token>
// from the app's own scheme. The phone only finds the token; whether Hold signed it is for the server to say.

// URL-safe characters of a plausible length. Hold's are 65 long today; the server is the one that checks.
const TOKEN = /^[A-Za-z0-9_-]{43,128}$/;
const LOCALE = /^[a-z]{2}$/;
const RENTAL_SEGMENT = 'r';
// Plain http only for the web app running on this computer or the Android emulator's view of it.
const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?$/;
const CANDIDATES = /(?:https?|hold):\/\/[^\s<>"']+/gi;

type RentalPlace = { readonly token: string; readonly rest: string };

// /fr/r/<token>/claim → the token and "/claim".
function placeIn(path: string): RentalPlace | undefined {
  const segments = path.split(/[?#]/)[0]?.split('/').filter(Boolean) ?? [];
  const start = segments[0] !== undefined && LOCALE.test(segments[0]) && segments[1] === RENTAL_SEGMENT ? 1 : 0;
  const token = segments[start + 1];
  if (segments[start] !== RENTAL_SEGMENT || token === undefined || !TOKEN.test(token)) return undefined;
  const rest = segments.slice(start + 2);
  return { token, rest: rest.length === 0 ? '' : `/${rest.join('/')}` };
}

function placeInLink(link: string, hosts: readonly string[]): RentalPlace | undefined {
  const own = /^hold:\/\/(.*)$/i.exec(link);
  if (own) return placeIn(own[1] ?? '');
  const web = /^(https?):\/\/([^/?#]+)(.*)$/i.exec(link);
  if (!web) return undefined;
  const [, scheme, host = '', path = ''] = web;
  const known = hosts.includes(host.toLowerCase());
  const secure = scheme?.toLowerCase() === 'https' || LOCAL_HOSTS.test(host);
  return known && secure ? placeIn(path) : undefined;
}

// The token of the first Hold rental link in a pasted text or a scanned code, from one of Hold's own hosts.
export function rentalTokenFrom(text: string, hosts: readonly string[]): string | undefined {
  for (const [link] of text.matchAll(CANDIDATES)) {
    const place = placeInLink(link, hosts);
    if (place) return place.token;
  }
  return undefined;
}

// Where in the app an opened link goes: /r/<token> and the page after it, or nothing when it is not a rental link.
export function rentalPathFrom(linkOrPath: string, hosts: readonly string[]): string | undefined {
  const place = linkOrPath.startsWith('/') ? placeIn(linkOrPath) : placeInLink(linkOrPath.trim(), hosts);
  return place ? `/r/${place.token}${place.rest}` : undefined;
}
