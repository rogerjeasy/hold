-- Every amount Hold records is whole, non-negative cents (AGENTS.md section 6; `money` in packages/domain refuses a
-- negative one), and now the database refuses one too, whatever code writes it: the money log, the holds, the
-- executions, the claims and their lines. Net cents in the money log stay unchecked: they are what PayPal's fee left of
-- a capture, which PayPal's figures alone decide. No column is required to be positive, since the domain allows none
-- (a claim the advocates agreed to nothing, a line lowered to nothing).
--
-- NOT VALID: the rows already written are not read again while the constraint is added, so deploying takes no long
-- lock on the money log, and no old row can stop the deploy. Each constraint still guards every row written or
-- changed from now on. Written by hand, not by drizzle-kit, for NOT VALID, which drizzle-kit does not write.
ALTER TABLE "money_events" ADD CONSTRAINT "amount_cents_non_negative" CHECK ("money_events"."amount_cents" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "money_events" ADD CONSTRAINT "paypal_fee_cents_non_negative" CHECK ("money_events"."paypal_fee_cents" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "holds" ADD CONSTRAINT "reserved_cents_non_negative" CHECK ("holds"."reserved_cents" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "holds" ADD CONSTRAINT "ordinary_cents_non_negative" CHECK ("holds"."ordinary_cents" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "amount_cents_non_negative" CHECK ("executions"."amount_cents" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "total_cents_non_negative" CHECK ("claims"."total_cents" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "claim_lines" ADD CONSTRAINT "amount_cents_non_negative" CHECK ("claim_lines"."amount_cents" >= 0) NOT VALID;
