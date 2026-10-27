-- An approved proposal hands its work to a spine execution. When PayPal confirms or the execution fails, the
-- proposal follows it (extensions.md section 6.3, step 6). It runs as the role that changed the execution, inside
-- that shop's row-level security.
CREATE FUNCTION hold_follow_execution() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state = 'confirmed' AND OLD.state IS DISTINCT FROM 'confirmed' THEN
    UPDATE proposals SET state = 'executed', updated_at = now() WHERE execution_id = NEW.id AND state = 'executing';
  ELSIF NEW.state = 'failed' AND OLD.state IS DISTINCT FROM 'failed' THEN
    UPDATE proposals SET state = 'failed', updated_at = now() WHERE execution_id = NEW.id AND state = 'executing';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER proposal_follows_execution AFTER UPDATE OF state ON executions FOR EACH ROW EXECUTE FUNCTION hold_follow_execution();
--> statement-breakpoint
-- The shops the nightly operations run visits: each with a PayPal account in the worker's mode. Ids only.
CREATE FUNCTION hold_shops_for_operations(paypal_mode text)
RETURNS TABLE (shop_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT DISTINCT paypal_accounts.shop_id FROM paypal_accounts WHERE paypal_accounts.mode = paypal_mode ORDER BY paypal_accounts.shop_id
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION hold_shops_for_operations(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION hold_shops_for_operations(text) TO hold_worker;
