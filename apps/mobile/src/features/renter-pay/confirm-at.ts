// Where PayPal's answer is confirmed after its page closes: the page for what was approved, with the order to confirm
// and whether the renter closed PayPal's page themselves. The web's PayPal return pages have the same paths.
export type ConfirmPage = 'paid' | 'pay' | 'extended';

export const confirmAt = (token: string, page: ConfirmPage, orderId: string, closed: boolean) =>
  ({ pathname: `/r/[token]/${page}`, params: { token, order: orderId, ...(closed ? { closed: '1' } : {}) } }) as const;
