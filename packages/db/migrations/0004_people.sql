-- People are written only through hold_register_user, so a service cannot create or alter someone else's record.
REVOKE INSERT ON users FROM hold_app, hold_worker;
--> statement-breakpoint

-- Finds or creates the person Cognito identified, and returns their id. The email Cognito verified replaces any
-- earlier one. A name already given is kept.
CREATE FUNCTION hold_register_user(subject text, user_email text, user_name text, user_language text) RETURNS uuid
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO users (cognito_subject, email, name, language) VALUES (subject, user_email, user_name, user_language)
  ON CONFLICT (cognito_subject) DO UPDATE SET email = excluded.email, name = coalesce(users.name, excluded.name)
  RETURNING id
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION hold_register_user(text, text, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION hold_register_user(text, text, text, text) TO hold_app;
--> statement-breakpoint

-- The person a verified token names, and each shop they have a role in. A person with no shop yet is one row with
-- no shop. Nobody at all is no rows. This runs before any shop is chosen, so row-level security cannot answer it.
CREATE FUNCTION hold_shops_of_subject(subject text)
RETURNS TABLE (user_id uuid, email text, name text, shop_id uuid, shop_name text, role staff_role)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT users.id, users.email, users.name, shops.id, shops.name, staff_roles.role
  FROM users
  LEFT JOIN staff_roles ON staff_roles.user_id = users.id
  LEFT JOIN shops ON shops.id = staff_roles.shop_id
  WHERE users.cognito_subject = subject
  ORDER BY shops.created_at
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION hold_shops_of_subject(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION hold_shops_of_subject(text) TO hold_app;
