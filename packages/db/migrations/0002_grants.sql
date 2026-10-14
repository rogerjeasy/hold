-- What the service roles may do. Nothing may be deleted. The money log, approvals and the audit trail are append-only.
GRANT USAGE ON SCHEMA public TO hold_app, hold_worker;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO hold_app, hold_worker;
--> statement-breakpoint
REVOKE UPDATE ON money_events, approvals, audit_log FROM hold_app, hold_worker;
--> statement-breakpoint
-- Renters are shared across shops and written only through hold_renter_for_payer.
REVOKE INSERT, UPDATE ON renters FROM hold_app, hold_worker;
--> statement-breakpoint

-- Finds or creates the renter PayPal identified, and returns their id. PayPal's details replace any earlier ones.
-- The caller learns only the id: reading the row still needs a rental in the caller's shop.
CREATE FUNCTION hold_renter_for_payer(payer_id text, payer_email text, payer_name text) RETURNS uuid
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO renters (paypal_payer_id, email, name) VALUES (payer_id, payer_email, payer_name)
  ON CONFLICT (paypal_payer_id) DO UPDATE SET email = excluded.email, name = excluded.name
  RETURNING id
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION hold_renter_for_payer(text, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION hold_renter_for_payer(text, text, text) TO hold_app, hold_worker;
