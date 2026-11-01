import { fireEvent, screen } from '@testing-library/react-native';
import { Alert, Text } from 'react-native';
import { EMPTY_TODAY, RENTAL_ID, signInStaff, TODAY } from '@/features/shop-session/test-fixtures';
import { createFakeApi } from '@/test/fake-api';
import { renderRoutes } from '@/test/render-router';
import { DropOffsScreen } from './drop-offs-screen';

const routes = {
  'shop/drop-offs': DropOffsScreen,
  'shop/rental/[rentalId]/index': () => <Text>Rental screen</Text>,
};

// The system's confirmation, answered with its non-cancelling button.
const confirmAlerts = () =>
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _body, buttons) => {
    buttons?.find((button) => button.style !== 'cancel')?.onPress?.();
  });

async function open(replies: Record<string, unknown> = {}) {
  await signInStaff();
  return renderRoutes(routes, { initialUrl: '/shop/drop-offs', api: createFakeApi({ 'shop/today': { ok: true, value: TODAY }, ...(replies as Record<string, never>) }) });
}

describe('returns at the drop point', () => {
  it('lists what renters left with nobody at the counter', async () => {
    await open();
    expect(await screen.findByText('Priya Raman')).toBeOnTheScreen();
    expect(screen.getByText(/Look at the drop point first/)).toBeOnTheScreen();
  });

  it('confirms an item is there and opens its rental to review the return', async () => {
    const view = await open({ 'shop/actions/confirm-drop-off': { ok: true, value: { rentalId: RENTAL_ID } } });
    await fireEvent.press(await screen.findByRole('button', { name: "It's here, review the return" }));
    expect(view.api.calls.find((call) => call.path === 'shop/actions/confirm-drop-off')?.options.body).toEqual({ rentalId: RENTAL_ID, locale: 'en' });
    expect(view.getPathname()).toBe(`/shop/rental/${RENTAL_ID}`);
  });

  it('records an item that is not there, after asking, and says the hold stays', async () => {
    confirmAlerts();
    const view = await open({ 'shop/actions/report-drop-off-missing': { ok: true, value: { emailed: true } } });
    await fireEvent.press(await screen.findByRole('button', { name: "It's not here" }));
    expect(Alert.alert).toHaveBeenCalled();
    expect(await screen.findByText('Recorded, and the renter was emailed. The hold stays in place.')).toBeOnTheScreen();
    expect(view.api.calls.some((call) => call.path === 'shop/actions/report-drop-off-missing')).toBe(true);
  });

  it('says why Hold refused', async () => {
    await open({ 'shop/actions/confirm-drop-off': { ok: false, failure: 'refused', reason: 'not_dropped_off' } });
    await fireEvent.press(await screen.findByRole('button', { name: "It's here, review the return" }));
    expect(await screen.findByText('This item is no longer waiting at the drop point.')).toBeOnTheScreen();
  });

  it('says when nothing waits there', async () => {
    await signInStaff();
    await renderRoutes(routes, { initialUrl: '/shop/drop-offs', api: createFakeApi({ 'shop/today': { ok: true, value: EMPTY_TODAY } }) });
    expect(await screen.findByText('Nothing at the drop point')).toBeOnTheScreen();
  });
});
