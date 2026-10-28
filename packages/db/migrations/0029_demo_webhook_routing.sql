-- The demo's one PayPal sandbox app delivers every demo shop's events to one address (architecture.md section 20.3).
-- An event names its rental in the order's custom_id, which Hold set; this finds that rental's PayPal account, and only
-- when the rental is a demo shop's, so the shared address can reach no real shop. The worker still verifies every event
-- with PayPal and reads back what it names before anything is applied.
CREATE FUNCTION hold_demo_paypal_account(rental_id text, paypal_mode text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT paypal_accounts.id
  FROM rentals
  JOIN shops ON shops.id = rentals.shop_id
  JOIN paypal_accounts ON paypal_accounts.shop_id = shops.id AND paypal_accounts.mode = paypal_mode
  WHERE rental_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND rentals.id = rental_id::uuid
    AND shops.demo_session
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION hold_demo_paypal_account(text, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION hold_demo_paypal_account(text, text) TO hold_app;
