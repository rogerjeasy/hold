CREATE TABLE "mandates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"granted_by_user_id" uuid,
	"granted_by_renter_id" uuid,
	"rental_id" uuid,
	"agent" text NOT NULL,
	"limits" jsonb NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"granted_how" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kind_allowed" CHECK ("mandates"."kind" in ('ops_standing_rule', 'agent_hold', 'settlement_shop', 'settlement_renter')),
	CONSTRAINT "grantedHow_allowed" CHECK ("mandates"."granted_how" in ('on_screen', 'one_time_code'))
);
--> statement-breakpoint
ALTER TABLE "mandates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ops_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"rule" jsonb NOT NULL,
	"state" text DEFAULT 'drafted' NOT NULL,
	"from_proposal_id" uuid,
	"decided_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "state_allowed" CHECK ("ops_rules"."state" in ('drafted', 'confirmed', 'discarded'))
);
--> statement-breakpoint
ALTER TABLE "ops_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ops_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"trigger" text NOT NULL,
	"state" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"tool_calls" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"model" text,
	"prompt_version" text,
	"paypal_checked" boolean DEFAULT false NOT NULL,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "state_allowed" CHECK ("ops_runs"."state" in ('running', 'completed', 'failed')),
	CONSTRAINT "trigger_allowed" CHECK ("ops_runs"."trigger" in ('nightly', 'dispute_opened', 'hold_at_risk', 'capture_failed', 'manual'))
);
--> statement-breakpoint
ALTER TABLE "ops_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"subject_kind" text NOT NULL,
	"subject_id" text NOT NULL,
	"rental_id" uuid,
	"exception_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reason" text NOT NULL,
	"references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"draft" text,
	"precondition_fingerprint" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"raised_by_agent" boolean DEFAULT false NOT NULL,
	"run_id" uuid,
	"model" text,
	"prompt_version" text,
	"decided_by_user_id" uuid,
	"mandate_id" uuid,
	"decision_reason" text,
	"decided_at" timestamp with time zone,
	"postponed_until" timestamp with time zone,
	"execution_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposals_shopId_kind_subjectId_preconditionFingerprint_unique" UNIQUE("shop_id","kind","subject_id","precondition_fingerprint"),
	CONSTRAINT "kind_allowed" CHECK ("proposals"."kind" in ('release_hold', 'request_replacement_hold', 'send_invoice', 'refund_part', 'respond_to_dispute', 'send_message', 'note')),
	CONSTRAINT "state_allowed" CHECK ("proposals"."state" in ('pending', 'approved', 'rejected', 'expired', 'superseded', 'executing', 'executed', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "proposals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"renter_id" uuid,
	"rental_id" uuid,
	"sent_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminders_shopId_kind_renterId_sentOn_unique" UNIQUE("shop_id","kind","renter_id","sent_on"),
	CONSTRAINT "kind_allowed" CHECK ("reminders"."kind" in ('return_due', 'reply_due', 'invoice'))
);
--> statement-breakpoint
ALTER TABLE "reminders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"subject_kind" text NOT NULL,
	"subject_id" text NOT NULL,
	"rental_id" uuid,
	"fingerprint" text NOT NULL,
	"deadline" timestamp with time zone,
	"money_cents" bigint DEFAULT 0 NOT NULL,
	"detected_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"last_run_id" uuid,
	CONSTRAINT "exceptions_shopId_fingerprint_unique" UNIQUE("shop_id","fingerprint"),
	CONSTRAINT "kind_allowed" CHECK ("exceptions"."kind" in ('clean_return_unconfirmed', 'hold_ending', 'hold_at_risk', 'return_overdue', 'claim_reply_due', 'balance_above_hold', 'capture_failed', 'invoice_unpaid', 'dispute_open', 'incident_waiting', 'reconciliation_difference'))
);
--> statement-breakpoint
ALTER TABLE "exceptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "approvals" DROP CONSTRAINT "subject_allowed";--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "holds" ADD COLUMN "state_changed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "ops_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_granted_by_renter_id_renters_id_fk" FOREIGN KEY ("granted_by_renter_id") REFERENCES "public"."renters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_rules" ADD CONSTRAINT "ops_rules_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_rules" ADD CONSTRAINT "ops_rules_from_proposal_id_proposals_id_fk" FOREIGN KEY ("from_proposal_id") REFERENCES "public"."proposals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_rules" ADD CONSTRAINT "ops_rules_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_runs" ADD CONSTRAINT "ops_runs_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_exception_id_exceptions_id_fk" FOREIGN KEY ("exception_id") REFERENCES "public"."exceptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_run_id_ops_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ops_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_mandate_id_mandates_id_fk" FOREIGN KEY ("mandate_id") REFERENCES "public"."mandates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_renter_id_renters_id_fk" FOREIGN KEY ("renter_id") REFERENCES "public"."renters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_last_run_id_ops_runs_id_fk" FOREIGN KEY ("last_run_id") REFERENCES "public"."ops_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "subject_allowed" CHECK ("approvals"."subject" in ('claim', 'release', 'refund', 'proposal'));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "mandates" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("mandates"."shop_id")) WITH CHECK (hold_in_scope("mandates"."shop_id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "ops_rules" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("ops_rules"."shop_id")) WITH CHECK (hold_in_scope("ops_rules"."shop_id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "ops_runs" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("ops_runs"."shop_id")) WITH CHECK (hold_in_scope("ops_runs"."shop_id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "proposals" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("proposals"."shop_id")) WITH CHECK (hold_in_scope("proposals"."shop_id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "reminders" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("reminders"."shop_id")) WITH CHECK (hold_in_scope("reminders"."shop_id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "exceptions" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("exceptions"."shop_id")) WITH CHECK (hold_in_scope("exceptions"."shop_id"));--> statement-breakpoint
-- hand-written below
-- When a hold's state last changed, and when an invoice was sent, kept by the database so no money path has to.
CREATE FUNCTION hold_stamp_state_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state IS DISTINCT FROM OLD.state THEN
    NEW.state_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER hold_state_changed BEFORE UPDATE OF state ON holds FOR EACH ROW EXECUTE FUNCTION hold_stamp_state_change();--> statement-breakpoint
CREATE FUNCTION hold_stamp_invoice_sent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state = 'sent' AND OLD.state IS DISTINCT FROM 'sent' AND NEW.sent_at IS NULL THEN
    NEW.sent_at := now();
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER invoice_sent BEFORE UPDATE OF state ON invoices FOR EACH ROW EXECUTE FUNCTION hold_stamp_invoice_sent();--> statement-breakpoint
-- What the services may do with the operations agent's records. Mandates change only by revocation; a proposal moves
-- through its states; exceptions are resolved; nothing is deleted.
GRANT SELECT, INSERT ON mandates, ops_runs, exceptions, proposals, ops_rules, reminders TO hold_app, hold_worker;--> statement-breakpoint
GRANT UPDATE (revoked_at) ON mandates TO hold_app, hold_worker;--> statement-breakpoint
GRANT UPDATE (state, completed_at, tool_calls, input_tokens, output_tokens, model, prompt_version, paypal_checked, counts) ON ops_runs TO hold_worker;--> statement-breakpoint
GRANT UPDATE (resolved_at, last_run_id, deadline, money_cents) ON exceptions TO hold_worker;--> statement-breakpoint
GRANT UPDATE (state, decided_by_user_id, mandate_id, decision_reason, decided_at, postponed_until, execution_id, updated_at) ON proposals TO hold_app, hold_worker;--> statement-breakpoint
GRANT UPDATE (state, decided_by_user_id, decided_at) ON ops_rules TO hold_app;
