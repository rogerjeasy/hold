CREATE TABLE "agent_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"rental_id" uuid NOT NULL,
	"booking_secret_fingerprint" text NOT NULL,
	"token_fingerprint" text,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"client_label" text NOT NULL,
	"token_issued_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"draft_reply" jsonb,
	"drafted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_sessions_rentalId_unique" UNIQUE("rental_id"),
	CONSTRAINT "agent_sessions_bookingSecretFingerprint_unique" UNIQUE("booking_secret_fingerprint"),
	CONSTRAINT "agent_sessions_tokenFingerprint_unique" UNIQUE("token_fingerprint")
);
--> statement-breakpoint
ALTER TABLE "agent_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"currency" char(3) NOT NULL,
	"fee_cents" bigint NOT NULL,
	"hold_cents" bigint NOT NULL,
	"lines" jsonb NOT NULL,
	"price_list_id" uuid NOT NULL,
	"wear_policy_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"rental_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotes_rentalId_unique" UNIQUE("rental_id")
);
--> statement-breakpoint
ALTER TABLE "quotes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rentals" DROP CONSTRAINT "bookedThrough_allowed";--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_price_list_id_price_lists_id_fk" FOREIGN KEY ("price_list_id") REFERENCES "public"."price_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_wear_policy_id_wear_policies_id_fk" FOREIGN KEY ("wear_policy_id") REFERENCES "public"."wear_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "bookedThrough_allowed" CHECK ("rentals"."booked_through" in ('staff', 'shop_page', 'assistant'));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "agent_sessions" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("agent_sessions"."shop_id")) WITH CHECK (hold_in_scope("agent_sessions"."shop_id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "quotes" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("quotes"."shop_id")) WITH CHECK (hold_in_scope("quotes"."shop_id"));--> statement-breakpoint
-- hand-written below
-- What the web app may do with an assistant's records (extensions.md section 8). A quote is written once and only ever
-- marked as booked; a session only receives its token, records its use and a drafted reply, and is revoked. Nothing is
-- deleted. The worker reads them only.
GRANT SELECT, INSERT ON quotes, agent_sessions TO hold_app;--> statement-breakpoint
GRANT UPDATE (rental_id) ON quotes TO hold_app;--> statement-breakpoint
GRANT UPDATE (token_fingerprint, scopes, token_issued_at, expires_at, last_used_at, revoked_at, draft_reply, drafted_at) ON agent_sessions TO hold_app;--> statement-breakpoint
GRANT SELECT ON quotes, agent_sessions TO hold_worker;--> statement-breakpoint
ALTER TABLE quotes ADD CONSTRAINT quotes_amounts CHECK (fee_cents >= 0 AND hold_cents >= 0 AND ends_at > starts_at AND expires_at > created_at);--> statement-breakpoint
ALTER TABLE agent_sessions ADD CONSTRAINT agent_sessions_token_whole CHECK ((token_fingerprint IS NULL) = (token_issued_at IS NULL) AND (token_fingerprint IS NULL) = (expires_at IS NULL));--> statement-breakpoint
-- A quote is booked from once, and the booking it names never changes.
CREATE FUNCTION hold_quote_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.rental_id IS NOT NULL AND NEW.rental_id IS DISTINCT FROM OLD.rental_id THEN
    RAISE EXCEPTION 'A quote is booked from once.';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER hold_quote_guard BEFORE UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION hold_quote_guard();--> statement-breakpoint
-- An agent token is issued once and never extended; a revoked session stays revoked and receives nothing more.
CREATE FUNCTION hold_agent_session_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.token_fingerprint IS NOT NULL AND (NEW.token_fingerprint IS DISTINCT FROM OLD.token_fingerprint OR NEW.token_issued_at IS DISTINCT FROM OLD.token_issued_at OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.scopes IS DISTINCT FROM OLD.scopes) THEN
    RAISE EXCEPTION 'An agent token is issued once.';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND (NEW.revoked_at IS DISTINCT FROM OLD.revoked_at OR NEW.token_fingerprint IS DISTINCT FROM OLD.token_fingerprint OR NEW.draft_reply IS DISTINCT FROM OLD.draft_reply) THEN
    RAISE EXCEPTION 'A disconnected assistant stays disconnected.';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER hold_agent_session_guard BEFORE UPDATE ON agent_sessions FOR EACH ROW EXECUTE FUNCTION hold_agent_session_guard();--> statement-breakpoint
-- The shops an assistant can find, read before any shop is chosen: only those that take bookings online (PayPal
-- connected in this mode, a price list published, an item in service), with only what find_shops returns.
CREATE FUNCTION hold_public_shops(place text, kind text, paypal_mode text)
RETURNS TABLE (id uuid, name text, slug text, time_zone text, currency char(3), kinds jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT shops.id, shops.name, shops.slug, shops.time_zone, shops.currency,
    (SELECT coalesce(jsonb_agg(DISTINCT item_types.category), '[]'::jsonb) FROM item_types
      WHERE item_types.shop_id = shops.id AND NOT item_types.simulated
      AND EXISTS (SELECT 1 FROM items WHERE items.item_type_id = item_types.id AND items.status = 'in_service' AND NOT items.simulated))
  FROM shops
  WHERE shops.currency IS NOT NULL
    AND EXISTS (SELECT 1 FROM paypal_accounts WHERE paypal_accounts.shop_id = shops.id AND paypal_accounts.mode = paypal_mode)
    AND EXISTS (SELECT 1 FROM price_lists WHERE price_lists.shop_id = shops.id AND price_lists.published_at IS NOT NULL)
    AND EXISTS (SELECT 1 FROM item_types JOIN items ON items.item_type_id = item_types.id
      WHERE item_types.shop_id = shops.id AND NOT item_types.simulated AND items.status = 'in_service' AND NOT items.simulated
      AND (kind IS NULL OR item_types.category = kind))
    AND (place IS NULL OR shops.name ILIKE '%' || place || '%' OR shops.slug ILIKE '%' || place || '%' OR shops.time_zone ILIKE '%' || replace(place, ' ', '_') || '%')
  ORDER BY shops.name, shops.slug
  LIMIT 20
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION hold_public_shops(text, text, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION hold_public_shops(text, text, text) TO hold_app;--> statement-breakpoint
-- The shop a quote belongs to, so a booking can be made from its ID alone. Nothing for an unknown quote.
CREATE FUNCTION hold_quote_shop(quote uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT quotes.shop_id FROM quotes WHERE quotes.id = quote
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION hold_quote_shop(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION hold_quote_shop(uuid) TO hold_app;--> statement-breakpoint
-- The session a booking secret's fingerprint names, read before any shop is chosen.
CREATE FUNCTION hold_agent_booking(fingerprint text)
RETURNS TABLE (id uuid, shop_id uuid, rental_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT agent_sessions.id, agent_sessions.shop_id, agent_sessions.rental_id FROM agent_sessions WHERE agent_sessions.booking_secret_fingerprint = fingerprint
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION hold_agent_booking(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION hold_agent_booking(text) TO hold_app;--> statement-breakpoint
-- The session an agent token's fingerprint names, read before any shop is chosen.
CREATE FUNCTION hold_agent_session(fingerprint text)
RETURNS TABLE (id uuid, shop_id uuid, rental_id uuid, scopes jsonb, client_label text, expires_at timestamptz, revoked_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT agent_sessions.id, agent_sessions.shop_id, agent_sessions.rental_id, agent_sessions.scopes, agent_sessions.client_label, agent_sessions.expires_at, agent_sessions.revoked_at
  FROM agent_sessions WHERE agent_sessions.token_fingerprint = fingerprint
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION hold_agent_session(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION hold_agent_session(text) TO hold_app;