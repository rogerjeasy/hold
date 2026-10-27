ALTER TABLE "shops" ADD COLUMN "demo_session" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- A demo session's shop belongs to one judge (architecture.md section 20.3), so it is never listed for renters'
-- assistants. Otherwise as in 0026: shops taking bookings online, with only what find_shops returns.
CREATE OR REPLACE FUNCTION hold_public_shops(place text, kind text, paypal_mode text)
RETURNS TABLE (id uuid, name text, slug text, time_zone text, currency char(3), kinds jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT shops.id, shops.name, shops.slug, shops.time_zone, shops.currency,
    (SELECT coalesce(jsonb_agg(DISTINCT item_types.category), '[]'::jsonb) FROM item_types
      WHERE item_types.shop_id = shops.id AND NOT item_types.simulated
      AND EXISTS (SELECT 1 FROM items WHERE items.item_type_id = item_types.id AND items.status = 'in_service' AND NOT items.simulated))
  FROM shops
  WHERE shops.currency IS NOT NULL
    AND NOT shops.demo_session
    AND EXISTS (SELECT 1 FROM paypal_accounts WHERE paypal_accounts.shop_id = shops.id AND paypal_accounts.mode = paypal_mode)
    AND EXISTS (SELECT 1 FROM price_lists WHERE price_lists.shop_id = shops.id AND price_lists.published_at IS NOT NULL)
    AND EXISTS (SELECT 1 FROM item_types JOIN items ON items.item_type_id = item_types.id
      WHERE item_types.shop_id = shops.id AND NOT item_types.simulated AND items.status = 'in_service' AND NOT items.simulated
      AND (kind IS NULL OR item_types.category = kind))
    AND (place IS NULL OR shops.name ILIKE '%' || place || '%' OR shops.slug ILIKE '%' || place || '%' OR shops.time_zone ILIKE '%' || replace(place, ' ', '_') || '%')
  ORDER BY shops.name, shops.slug
  LIMIT 20
$$;
