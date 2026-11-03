-- How many of a limit's tokens are left in its window, read without taking one, so a screen can say so before anyone
-- asks (architecture.md section 20.3). The same bucket as hold_take_rate_token: the whole limit when the bucket is new
-- or its window is over, never fewer than none. Written by hand, not by drizzle-kit, as 0044 was.
CREATE FUNCTION hold_rate_tokens_left(bucket text, max_count integer, window_seconds integer) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(
    (SELECT CASE WHEN limits.window_starts_at < now() - make_interval(secs => window_seconds) THEN max_count ELSE greatest(max_count - limits.count, 0) END
     FROM rate_limits AS limits WHERE limits.key = bucket),
    max_count)
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION hold_rate_tokens_left(text, integer, integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION hold_rate_tokens_left(text, integer, integer) TO hold_app;
