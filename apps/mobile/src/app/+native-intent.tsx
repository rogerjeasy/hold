import { PAYPAL_RETURN_LINK } from '@hold/mobile-api';
import { holdLinkHosts } from '@/api/hold';
import { rentalPathFrom } from '@/links/rental-link';

// A link that opens the app, from Hold's web address (a universal or app link) or its own hold:// scheme, goes to the
// rental it names, in whatever language the web address was in. Any other path goes where it says.
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string {
  try {
    // PayPal's hand-back closes the in-app browser session (on Android it also arrives as a link). The screen that
    // opened PayPal confirms the order itself, so the link goes nowhere, or to the start if it is what opened the app.
    if (path.toLowerCase().startsWith(PAYPAL_RETURN_LINK)) return initial ? '/' : '';
    return rentalPathFrom(path, holdLinkHosts()) ?? path;
  } catch {
    // Throwing here would close the app; the start screen is a safe place to land.
    return '/';
  }
}
