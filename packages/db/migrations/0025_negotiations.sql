CREATE TABLE "negotiation_moves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"negotiation_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"side" text NOT NULL,
	"kind" text NOT NULL,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_cents" bigint,
	"pass_reason" text,
	"argument" text,
	"argument_dropped" boolean DEFAULT false NOT NULL,
	"actor" text NOT NULL,
	"model" text,
	"prompt_version" text,
	"previous_fingerprint" text,
	"fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "negotiation_moves_negotiationId_sequence_unique" UNIQUE("negotiation_id","sequence"),
	CONSTRAINT "negotiation_moves_fingerprint_unique" UNIQUE("fingerprint"),
	CONSTRAINT "side_allowed" CHECK ("negotiation_moves"."side" in ('shop', 'renter')),
	CONSTRAINT "kind_allowed" CHECK ("negotiation_moves"."kind" in ('offer', 'accept', 'pass')),
	CONSTRAINT "passReason_allowed" CHECK ("negotiation_moves"."pass_reason" in ('chose', 'unavailable', 'ceiling'))
);
--> statement-breakpoint
ALTER TABLE "negotiation_moves" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "negotiations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"rental_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"shop_mandate_id" uuid,
	"renter_mandate_id" uuid NOT NULL,
	"currency" char(3) NOT NULL,
	"claim_total_cents" bigint NOT NULL,
	"round_limit" integer NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"shop_refusals" integer DEFAULT 0 NOT NULL,
	"renter_refusals" integer DEFAULT 0 NOT NULL,
	"head_fingerprint" text,
	"agreed" jsonb,
	"ended_reason" text,
	"shop_confirmed_by_user_id" uuid,
	"shop_confirmed_at" timestamp with time zone,
	"renter_confirmed_at" timestamp with time zone,
	"simulated" boolean DEFAULT false NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "negotiations_claimId_unique" UNIQUE("claim_id"),
	CONSTRAINT "kind_allowed" CHECK ("negotiations"."kind" in ('negotiation', 'reply')),
	CONSTRAINT "state_allowed" CHECK ("negotiations"."state" in ('open', 'agreed', 'settled', 'escalated', 'replied')),
	CONSTRAINT "endedReason_allowed" CHECK ("negotiations"."ended_reason" in ('pass', 'refused_twice', 'time_limit', 'deadline', 'mandate_ended', 'declined', 'nothing_to_charge'))
);
--> statement-breakpoint
ALTER TABLE "negotiations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "negotiation_moves" ADD CONSTRAINT "negotiation_moves_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiation_moves" ADD CONSTRAINT "negotiation_moves_negotiation_id_negotiations_id_fk" FOREIGN KEY ("negotiation_id") REFERENCES "public"."negotiations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_shop_mandate_id_mandates_id_fk" FOREIGN KEY ("shop_mandate_id") REFERENCES "public"."mandates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_renter_mandate_id_mandates_id_fk" FOREIGN KEY ("renter_mandate_id") REFERENCES "public"."mandates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_shop_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("shop_confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "negotiation_moves" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("negotiation_moves"."shop_id")) WITH CHECK (hold_in_scope("negotiation_moves"."shop_id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "negotiations" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("negotiations"."shop_id")) WITH CHECK (hold_in_scope("negotiations"."shop_id"));--> statement-breakpoint
-- hand-written below
-- An advocate for each side (extensions.md section 9). The services may read and add negotiations and their moves and
-- move a negotiation through its states. Nothing is deleted, a move never changes, and the claim, its mandates and
-- its limits are fixed when it opens.
GRANT SELECT, INSERT ON negotiations, negotiation_moves TO hold_app, hold_worker;--> statement-breakpoint
GRANT UPDATE (state, shop_refusals, renter_refusals, head_fingerprint, agreed, ended_reason, shop_confirmed_by_user_id, shop_confirmed_at, renter_confirmed_at, ended_at, updated_at) ON negotiations TO hold_app, hold_worker;--> statement-breakpoint
-- A negotiation between two advocates names both mandates; a round limit is a small whole number; an agreement is kept
-- once made; and a negotiation that went to the owner says why.
ALTER TABLE negotiations ADD CONSTRAINT negotiations_shop_mandate CHECK (kind = 'reply' OR shop_mandate_id IS NOT NULL);--> statement-breakpoint
ALTER TABLE negotiations ADD CONSTRAINT negotiations_limits CHECK (round_limit BETWEEN 1 AND 10 AND claim_total_cents >= 0 AND shop_refusals BETWEEN 0 AND 2 AND renter_refusals BETWEEN 0 AND 2);--> statement-breakpoint
ALTER TABLE negotiations ADD CONSTRAINT negotiations_agreed CHECK ((state NOT IN ('agreed', 'settled') OR agreed IS NOT NULL) AND ((state = 'escalated') = (ended_reason IS NOT NULL)));--> statement-breakpoint
ALTER TABLE negotiation_moves ADD CONSTRAINT negotiation_moves_shape CHECK (sequence >= 1 AND (kind = 'offer') = (total_cents IS NOT NULL) AND (total_cents IS NULL OR total_cents >= 0) AND (kind = 'pass') = (pass_reason IS NOT NULL) AND (sequence = 1) = (previous_fingerprint IS NULL));--> statement-breakpoint
-- The negotiation's state machine (domain negotiation.ts), again in the database. An agreement, a confirmation and the
-- reason it ended never change once set.
CREATE FUNCTION hold_negotiation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state <> OLD.state AND (OLD.state, NEW.state) NOT IN (
    ('open', 'agreed'), ('open', 'escalated'), ('open', 'replied'), ('agreed', 'settled'), ('agreed', 'escalated')
  ) THEN
    RAISE EXCEPTION 'A negotiation cannot move from % to %', OLD.state, NEW.state;
  END IF;
  IF OLD.agreed IS NOT NULL AND NEW.agreed IS DISTINCT FROM OLD.agreed THEN
    RAISE EXCEPTION 'An agreement never changes';
  END IF;
  IF (OLD.shop_confirmed_at IS NOT NULL AND (NEW.shop_confirmed_at IS DISTINCT FROM OLD.shop_confirmed_at OR NEW.shop_confirmed_by_user_id IS DISTINCT FROM OLD.shop_confirmed_by_user_id))
    OR (OLD.renter_confirmed_at IS NOT NULL AND NEW.renter_confirmed_at IS DISTINCT FROM OLD.renter_confirmed_at)
    OR (OLD.ended_reason IS NOT NULL AND NEW.ended_reason IS DISTINCT FROM OLD.ended_reason) THEN
    RAISE EXCEPTION 'A confirmation or an ending never changes';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER negotiation_guard BEFORE UPDATE ON negotiations FOR EACH ROW EXECUTE FUNCTION hold_negotiation_guard();--> statement-breakpoint
-- A move joins the end of an open negotiation's transcript, chained to the move before it, and is never changed or
-- removed afterwards, whoever asks.
CREATE FUNCTION hold_negotiation_move_chain() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  open_state text;
  last_sequence integer;
  last_fingerprint text;
BEGIN
  SELECT state INTO open_state FROM negotiations WHERE id = NEW.negotiation_id FOR UPDATE;
  IF open_state IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'Moves are added only to an open negotiation';
  END IF;
  SELECT sequence, fingerprint INTO last_sequence, last_fingerprint FROM negotiation_moves WHERE negotiation_id = NEW.negotiation_id ORDER BY sequence DESC LIMIT 1;
  IF NEW.sequence <> coalesce(last_sequence, 0) + 1 OR NEW.previous_fingerprint IS DISTINCT FROM last_fingerprint THEN
    RAISE EXCEPTION 'A move must follow the last move of its transcript';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER negotiation_move_chain BEFORE INSERT ON negotiation_moves FOR EACH ROW EXECUTE FUNCTION hold_negotiation_move_chain();--> statement-breakpoint
CREATE FUNCTION hold_negotiation_move_fixed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'A negotiation move is never changed or removed';
END;
$$;--> statement-breakpoint
CREATE TRIGGER negotiation_move_fixed BEFORE UPDATE OR DELETE ON negotiation_moves FOR EACH ROW EXECUTE FUNCTION hold_negotiation_move_fixed();--> statement-breakpoint
-- An agreed settlement lowers a claim's total to the agreed amount. Once a claim was approved its total never rises.
CREATE FUNCTION hold_claim_total_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.total_cents > OLD.total_cents AND OLD.state NOT IN ('draft', 'awaiting_approval') THEN
    RAISE EXCEPTION 'An approved claim''s total never rises';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER claim_total_guard BEFORE UPDATE OF total_cents ON claims FOR EACH ROW EXECUTE FUNCTION hold_claim_total_guard();