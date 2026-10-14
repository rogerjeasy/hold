-- hold_shops_of_subject returns a staff_role, so it goes first and returns as text once the enum types are gone.
DROP FUNCTION hold_shops_of_subject(text);--> statement-breakpoint
ALTER TABLE "approvals" ALTER COLUMN "subject" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "approvals" ALTER COLUMN "decision" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "approvals" ALTER COLUMN "method" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "claim_lines" ALTER COLUMN "source" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "claim_replies" ALTER COLUMN "decision" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "claims" ALTER COLUMN "state" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "claims" ALTER COLUMN "state" SET DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "capture_sessions" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "comparisons" ALTER COLUMN "state" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "comparisons" ALTER COLUMN "state" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "findings" ALTER COLUMN "class" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "marks" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "marks" ALTER COLUMN "status" SET DEFAULT 'open';--> statement-breakpoint
ALTER TABLE "outbox" ALTER COLUMN "state" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "outbox" ALTER COLUMN "state" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "executions" ALTER COLUMN "action" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "executions" ALTER COLUMN "state" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "executions" ALTER COLUMN "state" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "state" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "state" SET DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "money_events" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "paypal_events" ALTER COLUMN "verification" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "paypal_events" ALTER COLUMN "verification" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "paypal_events" ALTER COLUMN "processing" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "paypal_events" ALTER COLUMN "processing" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "authorizations" ALTER COLUMN "state" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "authorizations" ALTER COLUMN "state" SET DEFAULT 'created';--> statement-breakpoint
ALTER TABLE "holds" ALTER COLUMN "strategy" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "holds" ALTER COLUMN "state" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "holds" ALTER COLUMN "state" SET DEFAULT 'requested';--> statement-breakpoint
ALTER TABLE "rentals" ALTER COLUMN "state" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "rentals" ALTER COLUMN "state" SET DEFAULT 'pending_payment';--> statement-breakpoint
ALTER TABLE "paypal_accounts" ALTER COLUMN "mode" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "staff_roles" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "subject_allowed" CHECK ("approvals"."subject" in ('claim', 'release', 'refund'));--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "decision_allowed" CHECK ("approvals"."decision" in ('approved', 'rejected', 'waived'));--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "method_allowed" CHECK ("approvals"."method" in ('on_screen', 'mandate'));--> statement-breakpoint
ALTER TABLE "claim_lines" ADD CONSTRAINT "source_allowed" CHECK ("claim_lines"."source" in ('finding', 'person'));--> statement-breakpoint
ALTER TABLE "claim_replies" ADD CONSTRAINT "decision_allowed" CHECK ("claim_replies"."decision" in ('accept', 'contest'));--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "state_allowed" CHECK ("claims"."state" in ('draft', 'awaiting_approval', 'approved', 'presented', 'accepted', 'contested', 'lapsed', 'negotiating', 'agreed', 'escalated', 'decided', 'charging', 'charged', 'charge_failed', 'adjusted', 'waived', 'closed'));--> statement-breakpoint
ALTER TABLE "capture_sessions" ADD CONSTRAINT "kind_allowed" CHECK ("capture_sessions"."kind" in ('handover', 'return', 'packing', 'unboxing', 'send_back'));--> statement-breakpoint
ALTER TABLE "comparisons" ADD CONSTRAINT "state_allowed" CHECK ("comparisons"."state" in ('pending', 'running', 'clean', 'findings', 'deferred', 'failed'));--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "class_allowed" CHECK ("findings"."class" in ('new_damage', 'known_mark', 'wear', 'missing_part', 'uncertain'));--> statement-breakpoint
ALTER TABLE "marks" ADD CONSTRAINT "status_allowed" CHECK ("marks"."status" in ('open', 'repaired'));--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "state_allowed" CHECK ("outbox"."state" in ('pending', 'sent'));--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "action_allowed" CHECK ("executions"."action" in ('renew', 'release', 'capture', 'refund', 'invoice'));--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "state_allowed" CHECK ("executions"."state" in ('pending', 'submitted', 'confirmed', 'failed'));--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "state_allowed" CHECK ("invoices"."state" in ('draft', 'sent', 'paid', 'cancelled'));--> statement-breakpoint
ALTER TABLE "money_events" ADD CONSTRAINT "kind_allowed" CHECK ("money_events"."kind" in ('fee_captured', 'hold_placed', 'hold_renewed', 'hold_released', 'hold_captured', 'refunded', 'invoice_sent', 'invoice_paid'));--> statement-breakpoint
ALTER TABLE "paypal_events" ADD CONSTRAINT "verification_allowed" CHECK ("paypal_events"."verification" in ('pending', 'verified', 'rejected', 'simulated'));--> statement-breakpoint
ALTER TABLE "paypal_events" ADD CONSTRAINT "processing_allowed" CHECK ("paypal_events"."processing" in ('pending', 'applied', 'ignored', 'failed'));--> statement-breakpoint
ALTER TABLE "authorizations" ADD CONSTRAINT "state_allowed" CHECK ("authorizations"."state" in ('created', 'renewed', 'voided', 'captured', 'expired'));--> statement-breakpoint
ALTER TABLE "holds" ADD CONSTRAINT "strategy_allowed" CHECK ("holds"."strategy" in ('at_counter', 'combined', 'saved_method'));--> statement-breakpoint
ALTER TABLE "holds" ADD CONSTRAINT "state_allowed" CHECK ("holds"."state" in ('requested', 'placed', 'declined', 'renewing', 'at_risk', 'releasing', 'released', 'capturing', 'captured', 'capture_failed', 'invoiced', 'expired'));--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "state_allowed" CHECK ("rentals"."state" in ('pending_payment', 'booked', 'awaiting_hold', 'ready', 'out', 'overdue', 'returned', 'inspecting', 'settling', 'closed', 'cancelled', 'abandoned'));--> statement-breakpoint
ALTER TABLE "paypal_accounts" ADD CONSTRAINT "mode_allowed" CHECK ("paypal_accounts"."mode" in ('sandbox', 'live'));--> statement-breakpoint
ALTER TABLE "staff_roles" ADD CONSTRAINT "role_allowed" CHECK ("staff_roles"."role" in ('owner', 'manager', 'counter_staff', 'read_only'));--> statement-breakpoint
DROP TYPE "public"."approval_decision";--> statement-breakpoint
DROP TYPE "public"."approval_method";--> statement-breakpoint
DROP TYPE "public"."approval_subject";--> statement-breakpoint
DROP TYPE "public"."authorization_state";--> statement-breakpoint
DROP TYPE "public"."capture_session_kind";--> statement-breakpoint
DROP TYPE "public"."claim_line_source";--> statement-breakpoint
DROP TYPE "public"."claim_reply_decision";--> statement-breakpoint
DROP TYPE "public"."claim_state";--> statement-breakpoint
DROP TYPE "public"."comparison_state";--> statement-breakpoint
DROP TYPE "public"."execution_action";--> statement-breakpoint
DROP TYPE "public"."execution_state";--> statement-breakpoint
DROP TYPE "public"."finding_class";--> statement-breakpoint
DROP TYPE "public"."hold_state";--> statement-breakpoint
DROP TYPE "public"."invoice_state";--> statement-breakpoint
DROP TYPE "public"."mark_status";--> statement-breakpoint
DROP TYPE "public"."money_event_kind";--> statement-breakpoint
DROP TYPE "public"."outbox_state";--> statement-breakpoint
DROP TYPE "public"."paypal_mode";--> statement-breakpoint
DROP TYPE "public"."placement_strategy";--> statement-breakpoint
DROP TYPE "public"."processing_state";--> statement-breakpoint
DROP TYPE "public"."rental_state";--> statement-breakpoint
DROP TYPE "public"."staff_role";--> statement-breakpoint
DROP TYPE "public"."verification_state";--> statement-breakpoint
CREATE FUNCTION hold_shops_of_subject(subject text)
RETURNS TABLE (user_id uuid, email text, name text, shop_id uuid, shop_name text, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT users.id, users.email, users.name, shops.id, shops.name, staff_roles.role
  FROM users
  LEFT JOIN staff_roles ON staff_roles.user_id = users.id
  LEFT JOIN shops ON shops.id = staff_roles.shop_id
  WHERE users.cognito_subject = subject
  ORDER BY shops.created_at
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION hold_shops_of_subject(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION hold_shops_of_subject(text) TO hold_app;
