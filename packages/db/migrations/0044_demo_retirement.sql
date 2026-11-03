-- A judge's demo is retired a week after it opened (architecture.md section 20.3). Nothing is deleted: the shop keeps
-- every record and is marked retired, which only a demo shop can be. Written by hand, not by drizzle-kit, so that it
-- can be regenerated in order at merge.
ALTER TABLE "shops" ADD COLUMN "retired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "only_demo_retires" CHECK ("shops"."retired_at" is null or "shops"."demo_session");--> statement-breakpoint

-- The demos opened before the cutoff and not yet retired, each with the address of every person who works in it, for
-- the worker's daily cleanup, which removes the demo's own accounts before it marks the shop. A demo with nobody in it
-- comes back once, with no address.
CREATE FUNCTION hold_demo_sessions_due(cutoff timestamptz)
RETURNS TABLE (shop_id uuid, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT shops.id, users.email
  FROM shops
  LEFT JOIN staff_roles ON staff_roles.shop_id = shops.id
  LEFT JOIN users ON users.id = staff_roles.user_id
  WHERE shops.demo_session AND shops.retired_at IS NULL AND shops.created_at < cutoff
  ORDER BY shops.created_at, shops.id, users.email
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION hold_demo_sessions_due(timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION hold_demo_sessions_due(timestamptz) TO hold_worker;--> statement-breakpoint

-- As in 0006, without a retired shop: its people no longer work in it, so signing in finds no shop there.
CREATE OR REPLACE FUNCTION hold_shops_of_subject(subject text)
RETURNS TABLE (user_id uuid, email text, name text, shop_id uuid, shop_name text, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT users.id, users.email, users.name, shops.id, shops.name, staff_roles.role
  FROM users
  LEFT JOIN (staff_roles JOIN shops ON shops.id = staff_roles.shop_id AND shops.retired_at IS NULL) ON staff_roles.user_id = users.id
  WHERE users.cognito_subject = subject
  ORDER BY shops.created_at
$$;--> statement-breakpoint

-- As in 0011, without a retired shop: its public page and its assistants' lookups find nothing.
CREATE OR REPLACE FUNCTION hold_shop_by_slug(shop_slug text)
RETURNS TABLE (id uuid, name text, currency char(3), time_zone text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT shops.id, shops.name, shops.currency, shops.time_zone FROM shops WHERE shops.slug = shop_slug AND shops.retired_at IS NULL
$$;--> statement-breakpoint

-- As in 0025, without a retired shop: the nightly operations run and the negotiation sweep pass it by, so a retired
-- demo spends no model tokens.
CREATE OR REPLACE FUNCTION hold_shops_for_operations(paypal_mode text)
RETURNS TABLE (shop_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT DISTINCT paypal_accounts.shop_id FROM paypal_accounts JOIN shops ON shops.id = paypal_accounts.shop_id
  WHERE paypal_accounts.mode = paypal_mode AND shops.retired_at IS NULL
  ORDER BY paypal_accounts.shop_id
$$;
