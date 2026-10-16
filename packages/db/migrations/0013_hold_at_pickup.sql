-- Placing the hold at pickup: authorizing the order the renter approved is an execution like any other action on a
-- hold (architecture.md section 7.6).
ALTER TABLE "executions" DROP CONSTRAINT "action_allowed";--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "action_allowed" CHECK ("executions"."action" in ('authorize', 'renew', 'release', 'capture', 'refund', 'invoice', 'fee_capture'));