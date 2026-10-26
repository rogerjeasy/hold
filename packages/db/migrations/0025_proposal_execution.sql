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
