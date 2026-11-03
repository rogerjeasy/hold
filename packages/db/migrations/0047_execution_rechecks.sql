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
-- (architecture.md section 8.7). A kind of its own, so it is never taken for a refund Hold made, and another for money
-- back from the rental's fee or extra days, which no claim counts. Each such line names the capture it came back from.
ALTER TABLE "money_events" ADD COLUMN "returned_from" text;--> statement-breakpoint
-- A refund Hold made before this names its capture from its own execution's PayPal ids, or else from the rental's one
-- hold capture, the only capture Hold refunds. Only the new column is written; no amount or kind changes.
UPDATE "money_events" SET "returned_from" = "executions"."paypal_resource_ids" ->> 'capture'
FROM "executions"
WHERE "money_events"."kind" = 'refunded' AND "money_events"."returned_from" IS NULL
  AND "executions"."action" = 'refund' AND "executions"."paypal_resource_ids" ->> 'refund' = "money_events"."paypal_reference"
  AND "executions"."paypal_resource_ids" ->> 'capture' IS NOT NULL;--> statement-breakpoint
UPDATE "money_events" AS "refund" SET "returned_from" = "capture"."paypal_reference"
FROM "money_events" AS "capture"
WHERE "refund"."kind" = 'refunded' AND "refund"."returned_from" IS NULL
  AND "capture"."rental_id" = "refund"."rental_id" AND "capture"."kind" = 'hold_captured'
  AND (SELECT count(*) FROM "money_events" AS "other" WHERE "other"."rental_id" = "refund"."rental_id" AND "other"."kind" = 'hold_captured') = 1;--> statement-breakpoint
ALTER TABLE "money_events" DROP CONSTRAINT "kind_allowed";--> statement-breakpoint
ALTER TABLE "money_events" ADD CONSTRAINT "kind_allowed" CHECK ("money_events"."kind" in ('fee_captured', 'hold_placed', 'hold_renewed', 'hold_released', 'hold_captured', 'refunded', 'invoice_sent', 'invoice_paid', 'extension_captured', 'refunded_in_paypal', 'fee_refunded_in_paypal'));
