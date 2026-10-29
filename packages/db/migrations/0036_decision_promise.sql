-- The shop's promise to decide a contested claim, and the words between renter and shop on a claim (architecture.md
-- section 6.16). A promise once made never moves: the days, the date, when it was decided and when it was missed are
-- each written once. Messages are append-only.
CREATE TABLE "claim_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"author" text NOT NULL,
	"author_user_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "author_allowed" CHECK ("claim_messages"."author" in ('renter', 'shop')),
	CONSTRAINT "shop_author_named" CHECK (("claim_messages"."author" = 'shop') = ("claim_messages"."author_user_id" is not null)),
	CONSTRAINT "body_length" CHECK (char_length("claim_messages"."body") between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "claim_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "negotiations" DROP CONSTRAINT "endedReason_allowed";--> statement-breakpoint
ALTER TABLE "exceptions" DROP CONSTRAINT "kind_allowed";--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "promise_days" integer;--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "decide_by" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "promise_missed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "decision_promise_days" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "claim_messages" ADD CONSTRAINT "claim_messages_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_messages" ADD CONSTRAINT "claim_messages_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_messages" ADD CONSTRAINT "claim_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "promise_days_allowed" CHECK ("claims"."promise_days" is null or "claims"."promise_days" between 1 and 14);--> statement-breakpoint
ALTER TABLE "negotiations" ADD CONSTRAINT "endedReason_allowed" CHECK ("negotiations"."ended_reason" in ('pass', 'refused_twice', 'time_limit', 'deadline', 'mandate_ended', 'declined', 'nothing_to_charge', 'promise_missed'));--> statement-breakpoint
ALTER TABLE "exceptions" ADD CONSTRAINT "kind_allowed" CHECK ("exceptions"."kind" in ('clean_return_unconfirmed', 'hold_ending', 'hold_at_risk', 'return_overdue', 'claim_reply_due', 'balance_above_hold', 'capture_failed', 'invoice_unpaid', 'dispute_open', 'incident_waiting', 'reconciliation_difference', 'decision_promise_due', 'decision_promise_missed'));--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "promise_days_allowed" CHECK ("shops"."decision_promise_days" between 1 and 14);--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "claim_messages" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("claim_messages"."shop_id")) WITH CHECK (hold_in_scope("claim_messages"."shop_id"));--> statement-breakpoint
GRANT SELECT, INSERT ON claim_messages TO hold_app, hold_worker;--> statement-breakpoint
CREATE FUNCTION hold_claim_promise_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.promise_days IS NOT NULL AND NEW.promise_days IS DISTINCT FROM OLD.promise_days)
    OR (OLD.decide_by IS NOT NULL AND NEW.decide_by IS DISTINCT FROM OLD.decide_by)
    OR (OLD.decided_at IS NOT NULL AND NEW.decided_at IS DISTINCT FROM OLD.decided_at)
    OR (OLD.promise_missed_at IS NOT NULL AND NEW.promise_missed_at IS DISTINCT FROM OLD.promise_missed_at) THEN
    RAISE EXCEPTION 'A promise to the renter is written once.';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER claim_promise_guard BEFORE UPDATE OF promise_days, decide_by, decided_at, promise_missed_at ON claims FOR EACH ROW EXECUTE FUNCTION hold_claim_promise_guard();
