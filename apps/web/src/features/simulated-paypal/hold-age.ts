// In the test environment a tester may approve a hold as if it were approved this many days ago, so a hold near the
// end of PayPal's 29 days can be tried, as the morning queue's "hold ending" entry needs, without waiting for it.
export const SIMULATED_HOLD_AGE_DAYS = 27
