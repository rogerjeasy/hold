-- The services may read, create and update invitations, as with any shop table. rate_limits gets no grant at all:
-- it is reached only through hold_take_rate_token.
GRANT SELECT, INSERT, UPDATE ON staff_invitations TO hold_app, hold_worker;
--> statement-breakpoint

-- Counts one request against a limit and says whether it is still within it. The window restarts once it is over.
CREATE FUNCTION hold_take_rate_token(bucket text, max_count integer, window_seconds integer) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO rate_limits AS limits (key, window_starts_at, count) VALUES (bucket, now(), 1)
  ON CONFLICT (key) DO UPDATE SET
    window_starts_at = CASE WHEN limits.window_starts_at < now() - make_interval(secs => window_seconds) THEN now() ELSE limits.window_starts_at END,
    count = CASE WHEN limits.window_starts_at < now() - make_interval(secs => window_seconds) THEN 1 ELSE limits.count + 1 END
  RETURNING count <= max_count
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION hold_take_rate_token(text, integer, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION hold_take_rate_token(text, integer, integer) TO hold_app;
--> statement-breakpoint

-- The invitation a link's token names, with its shop's name, read before any shop is chosen. Nothing for a token
-- that names none.
CREATE FUNCTION hold_invitation_by_token(fingerprint text)
RETURNS TABLE (id uuid, shop_id uuid, shop_name text, email text, role text, language text, expires_at timestamptz, accepted_at timestamptz, revoked_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT staff_invitations.id, shops.id, shops.name, staff_invitations.email, staff_invitations.role, staff_invitations.language,
         staff_invitations.expires_at, staff_invitations.accepted_at, staff_invitations.revoked_at
  FROM staff_invitations JOIN shops ON shops.id = staff_invitations.shop_id
  WHERE staff_invitations.token_fingerprint = fingerprint
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION hold_invitation_by_token(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION hold_invitation_by_token(text) TO hold_app;
