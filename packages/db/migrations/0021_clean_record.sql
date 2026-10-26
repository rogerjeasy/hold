CREATE TABLE "rental_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"rental_id" uuid NOT NULL,
	"renter_key" text NOT NULL,
	"item_category" text NOT NULL,
	"closed_at" timestamp with time zone NOT NULL,
	"outcome" text NOT NULL,
	"counts" boolean NOT NULL,
	"unpaid_after" timestamp with time zone,
	CONSTRAINT "rental_outcomes_rentalId_unique" UNIQUE("rental_id"),
	CONSTRAINT "outcome_allowed" CHECK ("rental_outcomes"."outcome" in ('clean', 'settled', 'open')),
	CONSTRAINT "itemCategory_allowed" CHECK ("rental_outcomes"."item_category" in ('bike', 'e_bike', 'scooter', 'water', 'snow', 'camera', 'camping', 'event', 'tool', 'other'))
);
--> statement-breakpoint
ALTER TABLE "rental_outcomes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "renter_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"renter_key" text NOT NULL,
	"purpose" text NOT NULL,
	"answered_at" timestamp with time zone NOT NULL,
	"consented_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	CONSTRAINT "renter_consents_renterKey_purpose_unique" UNIQUE("renter_key","purpose"),
	CONSTRAINT "purpose_allowed" CHECK ("renter_consents"."purpose" in ('network_history'))
);
--> statement-breakpoint
ALTER TABLE "renter_consents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "trust_ladders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"currency" char(3) NOT NULL,
	"history" text NOT NULL,
	"window_months" integer NOT NULL,
	"minimum_fee_cents" bigint NOT NULL,
	"minimum_hours" integer NOT NULL,
	"published_by_user_id" uuid NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trust_ladders_shopId_version_unique" UNIQUE("shop_id","version"),
	CONSTRAINT "history_allowed" CHECK ("trust_ladders"."history" in ('own', 'network'))
);
--> statement-breakpoint
ALTER TABLE "trust_ladders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "trust_rungs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"ladder_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"clean_returns" integer NOT NULL,
	"share_percent" integer NOT NULL,
	"largest_value_cents" bigint,
	"needs_saved_method" boolean DEFAULT false NOT NULL,
	CONSTRAINT "trust_rungs_ladderId_position_unique" UNIQUE("ladder_id","position")
);
--> statement-breakpoint
ALTER TABLE "trust_rungs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "renter_links" ADD COLUMN "trust_code_hash" text;--> statement-breakpoint
ALTER TABLE "renter_links" ADD COLUMN "trust_code_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "renter_links" ADD COLUMN "trust_code_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "holds" ADD COLUMN "ordinary_cents" bigint;--> statement-breakpoint
ALTER TABLE "holds" ADD COLUMN "trust_ladder_id" uuid;--> statement-breakpoint
ALTER TABLE "holds" ADD COLUMN "trust_rung" integer;--> statement-breakpoint
ALTER TABLE "holds" ADD COLUMN "clean_returns" integer;--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "trust_ladder_id" uuid;--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "trust_rung" integer;--> statement-breakpoint
ALTER TABLE "renters" ADD COLUMN "trust_key" text;--> statement-breakpoint
ALTER TABLE "rental_outcomes" ADD CONSTRAINT "rental_outcomes_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_outcomes" ADD CONSTRAINT "rental_outcomes_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_ladders" ADD CONSTRAINT "trust_ladders_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_ladders" ADD CONSTRAINT "trust_ladders_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_rungs" ADD CONSTRAINT "trust_rungs_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_rungs" ADD CONSTRAINT "trust_rungs_ladder_id_trust_ladders_id_fk" FOREIGN KEY ("ladder_id") REFERENCES "public"."trust_ladders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rental_outcomes_renter_key" ON "rental_outcomes" USING btree ("renter_key");--> statement-breakpoint
ALTER TABLE "holds" ADD CONSTRAINT "holds_trust_ladder_id_trust_ladders_id_fk" FOREIGN KEY ("trust_ladder_id") REFERENCES "public"."trust_ladders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_trust_ladder_id_trust_ladders_id_fk" FOREIGN KEY ("trust_ladder_id") REFERENCES "public"."trust_ladders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renters" ADD CONSTRAINT "renters_trustKey_unique" UNIQUE("trust_key");--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "rental_outcomes" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("rental_outcomes"."shop_id")) WITH CHECK (hold_in_scope("rental_outcomes"."shop_id"));--> statement-breakpoint
CREATE POLICY "no_direct_access" ON "renter_consents" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "trust_ladders" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("trust_ladders"."shop_id")) WITH CHECK (hold_in_scope("trust_ladders"."shop_id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "trust_rungs" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("trust_rungs"."shop_id")) WITH CHECK (hold_in_scope("trust_rungs"."shop_id"));
--> statement-breakpoint
-- hand-written below
-- The Clean Record (extensions.md section 7). A published ladder is never changed, so the service roles may only read
-- and add one. A rental's outcome is written by its own shop, and changes from open to settled once its invoice is
-- paid; only hold_delete_trust_record removes one. Consents are reached through the functions below alone.
GRANT SELECT, INSERT ON trust_ladders, trust_rungs TO hold_app, hold_worker;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON rental_outcomes TO hold_app, hold_worker;
--> statement-breakpoint
REVOKE ALL ON renter_consents FROM hold_app, hold_worker;
--> statement-breakpoint

-- Whether the transaction's shop has rented to the renter this key names. Every function below answers only then, so
-- a shop cannot ask about a renter it never served. Security definer, so renters and rentals are not filtered here.
CREATE FUNCTION hold_renter_key_in_scope(renter_key text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM rentals JOIN renters ON renters.id = rentals.renter_id
    WHERE renters.trust_key = hold_renter_key_in_scope.renter_key AND hold_in_scope(rentals.shop_id)
  )
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION hold_renter_key_in_scope(text) FROM PUBLIC;
--> statement-breakpoint

-- Whether the renter consented to their record being used at other Hold shops, and has not withdrawn it.
CREATE FUNCTION hold_trust_consented(renter_key text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM renter_consents
    WHERE renter_consents.renter_key = hold_trust_consented.renter_key AND renter_consents.purpose = 'network_history'
      AND renter_consents.consented_at IS NOT NULL AND renter_consents.withdrawn_at IS NULL
  )
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION hold_trust_consented(text) FROM PUBLIC;
--> statement-breakpoint

-- Keeps the renter key on the renter the shop's rental names, once, so the rental's outcome can be written when it
-- closes without Hold's secret. Renters are written only through functions.
CREATE FUNCTION hold_set_renter_trust_key(renter uuid, key text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM rentals WHERE rentals.renter_id = renter AND hold_in_scope(rentals.shop_id)) THEN
    RETURN false;
  END IF;
  UPDATE renters SET trust_key = key WHERE renters.id = renter AND renters.trust_key IS NULL;
  RETURN EXISTS (SELECT 1 FROM renters WHERE renters.id = renter AND renters.trust_key = key);
END
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION hold_set_renter_trust_key(uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION hold_set_renter_trust_key(uuid, text) TO hold_app;
--> statement-breakpoint

-- A renter's outcomes, across shops. A shop's own always; another shop's only with the renter's consent, or for the
-- renter themselves through a link, which names no person. No shop is named: each is a number, and `here` says which
-- is the asking shop's own.
CREATE FUNCTION hold_trust_outcomes(key text)
RETURNS TABLE (outcome text, closed_at timestamptz, counts boolean, unpaid_after timestamptz, shop_number integer, here boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT rental_outcomes.outcome, rental_outcomes.closed_at, rental_outcomes.counts, rental_outcomes.unpaid_after,
    (dense_rank() OVER (ORDER BY rental_outcomes.shop_id))::integer, rental_outcomes.shop_id = hold_scope_shop()
  FROM rental_outcomes
  WHERE rental_outcomes.renter_key = key AND hold_renter_key_in_scope(key)
    AND (rental_outcomes.shop_id = hold_scope_shop() OR hold_scope_user() IS NULL OR hold_trust_consented(key))
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION hold_trust_outcomes(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION hold_trust_outcomes(text) TO hold_app;
--> statement-breakpoint

-- Whether the renter has answered the consent question, and their answer. No row for a renter the shop never served.
CREATE FUNCTION hold_trust_consent(key text) RETURNS TABLE (answered boolean, consented boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM renter_consents WHERE renter_consents.renter_key = key AND renter_consents.purpose = 'network_history'), hold_trust_consented(key)
  WHERE hold_renter_key_in_scope(key)
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION hold_trust_consent(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION hold_trust_consent(text) TO hold_app;
--> statement-breakpoint

-- The renter's answer, through their link only: a transaction that names a person is staff, who may not answer for
-- the renter. Consenting again after withdrawing starts a new consent.
CREATE FUNCTION hold_answer_trust_consent(key text, consent boolean, answered timestamptz) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF hold_scope_user() IS NOT NULL OR NOT hold_renter_key_in_scope(key) THEN
    RETURN false;
  END IF;
  INSERT INTO renter_consents AS existing (renter_key, purpose, answered_at, consented_at)
  VALUES (key, 'network_history', answered, CASE WHEN consent THEN answered END)
  ON CONFLICT (renter_key, purpose) DO UPDATE SET
    answered_at = excluded.answered_at,
    consented_at = CASE WHEN consent THEN answered ELSE existing.consented_at END,
    withdrawn_at = CASE
      WHEN consent THEN NULL
      WHEN existing.consented_at IS NOT NULL AND existing.withdrawn_at IS NULL THEN answered
      ELSE existing.withdrawn_at
    END;
  RETURN true;
END
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION hold_answer_trust_consent(text, boolean, timestamptz) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION hold_answer_trust_consent(text, boolean, timestamptz) TO hold_app;
--> statement-breakpoint

-- The renter deletes their record from any rental link: their clean and settled returns, at every shop, and their
-- consent. An open or unpaid claim stays until it is settled, so deleting cannot hide a debt. Returns how many returns
-- went, or null when the caller may not.
CREATE FUNCTION hold_delete_trust_record(key text, deleted timestamptz) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  removed integer;
BEGIN
  IF hold_scope_user() IS NOT NULL OR NOT hold_renter_key_in_scope(key) THEN
    RETURN NULL;
  END IF;
  DELETE FROM rental_outcomes WHERE rental_outcomes.renter_key = key AND rental_outcomes.outcome IN ('clean', 'settled');
  GET DIAGNOSTICS removed = ROW_COUNT;
  UPDATE renter_consents SET withdrawn_at = deleted
  WHERE renter_consents.renter_key = key AND renter_consents.consented_at IS NOT NULL AND renter_consents.withdrawn_at IS NULL;
  RETURN removed;
END
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION hold_delete_trust_record(text, timestamptz) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION hold_delete_trust_record(text, timestamptz) TO hold_app;
--> statement-breakpoint

-- The holds released or captured for the renter, across shops, for "deposits never taken from you". For the renter
-- through their link only. Sample rentals are left out.
CREATE FUNCTION hold_trust_money_log(key text)
RETURNS TABLE (rental_id uuid, kind text, currency char(3), amount_cents bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT money_events.rental_id, money_events.kind, money_events.currency, money_events.amount_cents
  FROM money_events JOIN rentals ON rentals.id = money_events.rental_id JOIN renters ON renters.id = rentals.renter_id
  WHERE renters.trust_key = key AND NOT rentals.simulated AND money_events.kind IN ('hold_released', 'hold_captured')
    AND hold_scope_user() IS NULL AND hold_renter_key_in_scope(key)
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION hold_trust_money_log(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION hold_trust_money_log(text) TO hold_app;