-- Bookings by staff and on a shop's own page, and the rental fee captured through an execution. Rows written before
-- this are filled in before each new column is required: a rental's agreed hold from its hold, each shop's address
-- from its name, an execution's rental from its hold.
ALTER TABLE "executions" DROP CONSTRAINT "action_allowed";--> statement-breakpoint
ALTER TABLE "executions" ALTER COLUMN "hold_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "rental_id" uuid;--> statement-breakpoint
UPDATE "executions" SET "rental_id" = "holds"."rental_id" FROM "holds" WHERE "holds"."id" = "executions"."hold_id";--> statement-breakpoint
ALTER TABLE "executions" ALTER COLUMN "rental_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "hold_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "rentals" SET "hold_cents" = "holds"."reserved_cents" FROM "holds" WHERE "holds"."rental_id" = "rentals"."id";--> statement-breakpoint
ALTER TABLE "rentals" ALTER COLUMN "hold_cents" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "contact_name" text;--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "language" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "booked_through" text DEFAULT 'staff' NOT NULL;--> statement-breakpoint
ALTER TABLE "rental_items" ADD COLUMN "day_rate_cents" bigint;--> statement-breakpoint
ALTER TABLE "rental_items" ADD COLUMN "hold_cents" bigint;--> statement-breakpoint
UPDATE "rental_items" SET "day_rate_cents" = "item_types"."day_rate_cents", "hold_cents" = "item_types"."hold_cents"
  FROM "items" JOIN "item_types" ON "item_types"."id" = "items"."item_type_id" WHERE "items"."id" = "rental_items"."item_id";--> statement-breakpoint
ALTER TABLE "rental_items" ALTER COLUMN "day_rate_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "rental_items" ALTER COLUMN "hold_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "slug" text;--> statement-breakpoint
UPDATE "shops" SET "slug" = named.slug FROM (
  SELECT id, CASE WHEN row_number() OVER (PARTITION BY base ORDER BY created_at, id) = 1 THEN base
              ELSE base || '-' || row_number() OVER (PARTITION BY base ORDER BY created_at, id) END AS slug
  FROM (SELECT id, created_at, coalesce(nullif(left(trim(BOTH '-' FROM regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')), 48), ''), 'shop') AS base FROM "shops") AS bases
) AS named WHERE named.id = "shops"."id";--> statement-breakpoint
ALTER TABLE "shops" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "shops_slug_unique" UNIQUE("slug");--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "action_allowed" CHECK ("executions"."action" in ('renew', 'release', 'capture', 'refund', 'invoice', 'fee_capture'));--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "bookedThrough_allowed" CHECK ("rentals"."booked_through" in ('staff', 'shop_page'));--> statement-breakpoint

-- The address a new shop gets: its name made plain, numbered when another shop has it. Read across shops, which no
-- policy allows, so it is a function that answers only with the free address.
CREATE FUNCTION hold_free_shop_slug(base text) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  candidate text := base;
  number integer := 1;
BEGIN
  WHILE EXISTS (SELECT 1 FROM shops WHERE shops.slug = candidate) LOOP
    number := number + 1;
    candidate := base || '-' || number;
  END LOOP;
  RETURN candidate;
END
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION hold_free_shop_slug(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION hold_free_shop_slug(text) TO hold_app;
--> statement-breakpoint

-- The shop a public page names by its address, with only what that page shows. Nothing for an unknown address.
CREATE FUNCTION hold_shop_by_slug(shop_slug text)
RETURNS TABLE (id uuid, name text, currency char(3), time_zone text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT shops.id, shops.name, shops.currency, shops.time_zone FROM shops WHERE shops.slug = shop_slug
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION hold_shop_by_slug(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION hold_shop_by_slug(text) TO hold_app;
--> statement-breakpoint

-- The renter link a token's fingerprint names, read before any shop is chosen. Nothing for a fingerprint that names none.
CREATE FUNCTION hold_renter_link(fingerprint text)
RETURNS TABLE (id uuid, shop_id uuid, rental_id uuid, scopes jsonb, expires_at timestamptz, revoked_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT renter_links.id, renter_links.shop_id, renter_links.rental_id, renter_links.scopes, renter_links.expires_at, renter_links.revoked_at
  FROM renter_links WHERE renter_links.token_fingerprint = fingerprint
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION hold_renter_link(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION hold_renter_link(text) TO hold_app;
