-- The roles the services log in as. Roles belong to the whole cluster, so they are created only if missing.
-- Neither owns a table, so row-level security applies to both. Deploying gives each a login and a password.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hold_app') THEN
    CREATE ROLE hold_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hold_worker') THEN
    CREATE ROLE hold_worker NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint

-- The shop and the person a transaction acts for, set with set_config(..., true) so they end with it.
CREATE FUNCTION hold_scope_shop() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('hold.shop_id', true), '')::uuid
$$;
--> statement-breakpoint

CREATE FUNCTION hold_scope_user() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('hold.user_id', true), '')::uuid
$$;
--> statement-breakpoint

-- A row is visible only inside the transaction's shop. When a person is named, they must also have a role in it.
-- With no person named, the request acts for a renter link or a worker job, already bound to this shop.
-- Security definer, so reading staff_roles here is not itself filtered. plpgsql, so it may be created before the table.
CREATE FUNCTION hold_in_scope(row_shop uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF row_shop IS NULL OR row_shop IS DISTINCT FROM hold_scope_shop() THEN
    RETURN false;
  END IF;
  IF hold_scope_user() IS NULL THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM staff_roles WHERE staff_roles.shop_id = row_shop AND staff_roles.user_id = hold_scope_user()
  );
END
$$;
