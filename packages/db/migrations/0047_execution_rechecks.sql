-- The money executions PayPal left waiting, across every shop, for the relay to read back from PayPal again
-- (architecture.md section 7.6). Each one found is stamped with the moment it was found, so it comes back only after
-- another wait. Only that moment changes: no state moves here. Written by hand, not by drizzle-kit, so that it can be
-- renumbered in order at merge.
CREATE FUNCTION hold_executions_to_recheck(waited_since timestamptz, found_at timestamptz, max_rows integer)
RETURNS TABLE (id uuid, shop_id uuid, rental_id uuid)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE executions SET updated_at = found_at
  WHERE executions.id IN (
    SELECT due.id FROM executions AS due
    WHERE due.state IN ('pending', 'submitted') AND due.updated_at < waited_since
    ORDER BY due.updated_at LIMIT max_rows FOR UPDATE SKIP LOCKED
  )
  RETURNING executions.id, executions.shop_id, executions.rental_id
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION hold_executions_to_recheck(timestamptz, timestamptz, integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION hold_executions_to_recheck(timestamptz, timestamptz, integer) TO hold_worker;
--> statement-breakpoint

-- Money PayPal returned to the renter from a capture Hold made, without Hold: a refund made in PayPal, or a reversal
-- (architecture.md section 8.7). A kind of its own, so it is never taken for a refund Hold made.
ALTER TABLE "money_events" DROP CONSTRAINT "kind_allowed";--> statement-breakpoint
ALTER TABLE "money_events" ADD CONSTRAINT "kind_allowed" CHECK ("money_events"."kind" in ('fee_captured', 'hold_placed', 'hold_renewed', 'hold_released', 'hold_captured', 'refunded', 'invoice_sent', 'invoice_paid', 'extension_captured', 'refunded_in_paypal'));
