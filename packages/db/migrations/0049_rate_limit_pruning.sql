-- Removes the rows of windows long over, which hold_take_rate_token only ever restarted, so the table no longer grows
-- with every new caller (architecture.md section 12). No limit's window is longer than a day, so a row whose window
-- began two days ago counts nothing; removing it is the same as the fresh bucket the next take would start. Run by the
-- daily cleanup, as hold_worker. Written by hand, not by drizzle-kit, as 0045 was.
CREATE FUNCTION hold_prune_rate_limits() RETURNS integer
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH pruned AS (DELETE FROM rate_limits WHERE window_starts_at < now() - interval '2 days' RETURNING 1)
  SELECT count(*)::integer FROM pruned
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION hold_prune_rate_limits() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION hold_prune_rate_limits() TO hold_worker;
