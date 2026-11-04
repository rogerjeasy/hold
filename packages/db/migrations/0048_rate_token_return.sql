-- Gives back one token taken in the current window, never below none (architecture.md section 8.5). A caller takes a
-- token before work whose outcome decides whether it should count, such as a webhook only a forgery should cost, and
-- gives it back once the work shows it should not, so the count is taken atomically and still counts only what it
-- means to. Written by hand, not by drizzle-kit, as 0045 was.
CREATE FUNCTION hold_return_rate_token(bucket text) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE rate_limits SET count = count - 1 WHERE key = bucket AND count > 0
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION hold_return_rate_token(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION hold_return_rate_token(text) TO hold_app;
