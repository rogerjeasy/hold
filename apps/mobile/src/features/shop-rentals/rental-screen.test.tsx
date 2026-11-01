import { fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import type { RentalView } from '@hold/mobile-api';
import { COMPARISON_ID, ITEM_ID, RENTAL, RENTAL_ID, SESSION_ID, signInStaff } from '@/features/shop-session/test-fixtures';
import { createFakeApi } from '@/test/fake-api';
import { renderRoutes } from '@/test/render-router';
import { RentalScreen } from './rental-screen';

const routes = {
  'shop/rental/[rentalId]/index': RentalScreen,
  'shop/rental/[rentalId]/link': () => <Text>Link screen</Text>,
  'shop/rental/[rentalId]/message': () => <Text>Message sheet</Text>,
  'shop/rental/[rentalId]/item/[itemId]': () => <Text>Item sheet</Text>,
  'shop/session/[sessionId]/index': () => <Text>Session screen</Text>,
  'shop/review/[comparisonId]': () => <Text>Review sheet</Text>,
};

async function open(rental: RentalView, replies: Record<string, unknown> = {}) {
  await signInStaff();
  const api = createFakeApi({ [`shop/rentals/${RENTAL_ID}`]: { ok: true, value: rental }, ...(replies as Record<string, never>) });
  const view = await renderRoutes(routes, { initialUrl: `/shop/rental/${RENTAL_ID}`, api });
  return view;
}

describe('a rental at the counter', () => {
  it('shows where it stands, its hold and its items', async () => {
    await open(RENTAL);
    expect(await screen.findByText('Ready for handover')).toBeOnTheScreen();
    expect(screen.getAllByText('€300.00').length).toBeGreaterThan(0);
    expect(screen.getByText('Reserved in the renter\'s PayPal account')).toBeOnTheScreen();
    expect(screen.getAllByText('City e-bike 4').length).toBeGreaterThan(0);
  });

  it('starts the handover of an item and opens its photographs', async () => {
    const view = await open(RENTAL, { 'shop/actions/start-handover': { ok: true, value: { sessionId: SESSION_ID } } });
    await fireEvent.press(await screen.findByRole('button', { name: 'Photograph City e-bike 4' }));
    expect(view.api.calls.find((call) => call.path === 'shop/actions/start-handover')?.options.body).toEqual({ rentalId: RENTAL_ID, itemId: ITEM_ID, locale: 'en' });
    expect(view.getPathname()).toBe(`/shop/session/${SESSION_ID}`);
  });

  it('continues a handover already started', async () => {
    const view = await open({ ...RENTAL, items: [{ ...RENTAL.items[0]!, handover: { sessionId: SESSION_ID, sealed: false } }] });
    await fireEvent.press(await screen.findByRole('button', { name: 'Continue the handover of City e-bike 4' }));
    expect(view.getPathname()).toBe(`/shop/session/${SESSION_ID}`);
  });

  it("shows the renter's link as a code", async () => {
    const view = await open(RENTAL);
    await fireEvent.press(await screen.findByRole('button', { name: 'Show the link' }));
    expect(view.getPathname()).toBe(`/shop/rental/${RENTAL_ID}/link`);
  });

  it('sends the link again the way the renter is reached, and says how', async () => {
    await open(RENTAL, { 'shop/actions/send-renter-link': { ok: true, value: { via: 'text', to: '•••• 1234' } } });
    await fireEvent.press(await screen.findByRole('button', { name: 'Send it again' }));
    expect(await screen.findByText('Sent by text to •••• 1234.')).toBeOnTheScreen();
  });

  it('says when the link went by email', async () => {
    await open(RENTAL, { 'shop/actions/send-renter-link': { ok: true, value: { via: 'email', to: 'priya@example.com' } } });
    await fireEvent.press(await screen.findByRole('button', { name: 'Send it again' }));
    expect(await screen.findByText('Emailed to priya@example.com.')).toBeOnTheScreen();
  });

  it('says plainly that a money decision is made on the web, and does not try again', async () => {
    const view = await open(RENTAL, { 'shop/actions/send-renter-link': { ok: false, failure: 'passkey_needed' } });
    await fireEvent.press(await screen.findByRole('button', { name: 'Send it again' }));
    expect(await screen.findByText('This is decided on the web')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(view.api.calls.filter((call) => call.path === 'shop/actions/send-renter-link')).toHaveLength(1);
  });

  it('asks for the hold once the fee is paid', async () => {
    const view = await open({ ...RENTAL, state: 'booked', hold: null });
    await fireEvent.press(await screen.findByRole('button', { name: 'Ask for the hold' }));
    expect(view.getPathname()).toBe(`/shop/rental/${RENTAL_ID}/link`);
  });

  it('starts the return of an item that went out', async () => {
    const view = await open({ ...RENTAL, state: 'out', items: [{ ...RENTAL.items[0]!, handover: { sessionId: SESSION_ID, sealed: true } }] }, { 'shop/actions/start-return': { ok: true, value: { sessionId: SESSION_ID } } });
    expect(await screen.findByText('Photographed and sealed')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Start the return of City e-bike 4' }));
    expect(view.getPathname()).toBe(`/shop/session/${SESSION_ID}`);
  });

  it('leads to noting what was seen once a return is compared', async () => {
    const view = await open({ ...RENTAL, state: 'inspecting', items: [{ ...RENTAL.items[0]!, handover: { sessionId: SESSION_ID, sealed: true }, return: { sessionId: SESSION_ID, sealed: true, comparisonId: COMPARISON_ID } }] });
    await fireEvent.press(await screen.findByRole('button', { name: 'Note what you saw on City e-bike 4' }));
    expect(view.getPathname()).toBe(`/shop/review/${COMPARISON_ID}`);
  });

  it('opens the sheet to write to the renter on a claim', async () => {
    const view = await open({ ...RENTAL, state: 'settling' });
    expect(await screen.findByText('Claims, releases and approvals for this rental are decided on the web.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Write to the renter' }));
    expect(view.getPathname()).toBe(`/shop/rental/${RENTAL_ID}/message`);
  });

  it("changes an item's status from its row", async () => {
    const view = await open(RENTAL);
    await fireEvent.press(await screen.findByRole('button', { name: 'Change the status of City e-bike 4' }));
    expect(view.getPathname()).toBe(`/shop/rental/${RENTAL_ID}/item/${ITEM_ID}`);
  });

  it('acts on nothing for a sample rental, and says why', async () => {
    await open({ ...RENTAL, simulated: true });
    expect(await screen.findByText('A sample rental for the demo. Nothing is photographed, emailed or charged for it.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Show the link' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Photograph City e-bike 4' })).toBeNull();
  });

  it('shows a read-only member the rental without the counter actions', async () => {
    await open({ ...RENTAL, canAct: false, contactEmail: undefined });
    expect(await screen.findByText('Your role can see this rental but not act on it at the counter.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Show the link' })).toBeNull();
  });
});
