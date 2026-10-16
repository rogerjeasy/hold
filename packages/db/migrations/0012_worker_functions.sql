-- What the webhook intake and the worker read before any shop is chosen. Each answers only what its caller needs.

-- The shop a PayPal account belongs to, for an event PayPal delivers to that account's address.
CREATE FUNCTION hold_paypal_account(account_id uuid) RETURNS TABLE (shop_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT paypal_accounts.shop_id FROM paypal_accounts WHERE paypal_accounts.id = account_id
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION hold_paypal_account(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION hold_paypal_account(uuid) TO hold_app;
--> statement-breakpoint

-- The oldest messages waiting to be sent to a queue, in every shop. Only the worker relays them; each is then marked
-- sent inside its own shop.
CREATE FUNCTION hold_pending_outbox(max_rows integer)
RETURNS TABLE (id uuid, shop_id uuid, queue text, message_group text, payload jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT outbox.id, outbox.shop_id, outbox.queue, outbox.message_group, outbox.payload
  FROM outbox WHERE outbox.state = 'pending' ORDER BY outbox.created_at LIMIT max_rows
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION hold_pending_outbox(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION hold_pending_outbox(integer) TO hold_worker;
